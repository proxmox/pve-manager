package PVE::CephTools;

use strict;
use warnings;
use File::Basename;
use File::Path;
use POSIX qw (LONG_MAX);
use Cwd qw(abs_path);
use IO::Dir;

use PVE::Tools qw(extract_param run_command file_get_contents file_read_firstline dir_glob_regex dir_glob_foreach);

my $ccname = 'ceph'; # ceph cluster name
my $ceph_cfgdir = "/etc/ceph";
my $pve_ceph_cfgpath = "/etc/pve/$ccname.conf";
my $ceph_cfgpath = "$ceph_cfgdir/$ccname.conf";

my $pve_mon_key_path = "/etc/pve/priv/$ccname.mon.keyring";
my $pve_ckeyring_path = "/etc/pve/priv/$ccname.client.admin.keyring";
my $ceph_bootstrap_osd_keyring = "/var/lib/ceph/bootstrap-osd/$ccname.keyring";
my $ceph_bootstrap_mds_keyring = "/var/lib/ceph/bootstrap-mds/$ccname.keyring";

my $ceph_bin = "/usr/bin/ceph";

my $config_hash = {
    ccname => $ccname,
    pve_ceph_cfgpath => $pve_ceph_cfgpath,
    pve_mon_key_path => $pve_mon_key_path,
    pve_ckeyring_path => $pve_ckeyring_path,
    ceph_bootstrap_osd_keyring => $ceph_bootstrap_osd_keyring,
    ceph_bootstrap_mds_keyring => $ceph_bootstrap_mds_keyring,
    long_rados_timeout => 60,
};

sub get_config {
    my $key = shift;

    my $value = $config_hash->{$key};

    die "no such ceph config '$key'" if !$value; 

    return $value;
}

sub verify_blockdev_path {
    my ($rel_path) = @_;

    die "missing path" if !$rel_path;
    my $path = abs_path($rel_path);
    die "failed to get absolute path to $rel_path" if !$path;

    die "got unusual device path '$path'\n" if $path !~  m|^/dev/(.*)$|;

    $path = "/dev/$1"; # untaint

    die "no such block device '$path'\n"
	if ! -b $path;
    
    return $path;
};

sub purge_all_ceph_files {
    # fixme: this is very dangerous - should we really support this function?

    unlink $ceph_cfgpath;

    unlink $pve_ceph_cfgpath;
    unlink $pve_ckeyring_path;
    unlink $pve_mon_key_path;

    unlink $ceph_bootstrap_osd_keyring;
    unlink $ceph_bootstrap_mds_keyring;

    system("rm -rf /var/lib/ceph/mon/ceph-*");

    # remove osd?
}

sub check_ceph_installed {
    my ($noerr) = @_;

    if (! -x $ceph_bin) {
	die "ceph binaries not installed\n" if !$noerr;
	return undef;
    }

    return 1;
}

sub check_ceph_inited {
    my ($noerr) = @_;

    return undef if !check_ceph_installed($noerr);
    
    if (! -f $pve_ceph_cfgpath) {
	die "pveceph configuration not initialized\n" if !$noerr;
	return undef;
    }

    return 1;
}

sub check_ceph_enabled {
    my ($noerr) = @_;

    return undef if !check_ceph_inited($noerr);

    if (! -f $ceph_cfgpath) {
	die "pveceph configuration not enabled\n" if !$noerr;
	return undef;
    }

    return 1;
}

sub parse_ceph_config {
    my ($filename) = @_;

    $filename = $pve_ceph_cfgpath if !$filename;

    my $cfg = {};

    return $cfg if ! -f $filename;

    my $fh = IO::File->new($filename, "r") ||
	die "unable to open '$filename' - $!\n";

    my $section;

    while (defined(my $line = <$fh>)) {
	$line =~ s/[;#].*$//;
	$line =~ s/^\s+//;
	$line =~ s/\s+$//;
	next if !$line;

	$section = $1 if $line =~ m/^\[(\S+)\]$/;
	if (!$section) {
	    warn "no section - skip: $line\n";
	    next;
	}

	if ($line =~ m/^(.*?\S)\s*=\s*(\S.*)$/) {
	    $cfg->{$section}->{$1} = $2;
	}

    }

    return $cfg;
}

sub write_ceph_config {
    my ($cfg) = @_;

    my $out = '';

    my $cond_write_sec = sub {
	my $re = shift;

	foreach my $section (keys %$cfg) {
	    next if $section !~ m/^$re$/;
	    $out .= "[$section]\n";
	    foreach my $key (sort keys %{$cfg->{$section}}) {
		$out .= "\t $key = $cfg->{$section}->{$key}\n";
	    }
	    $out .= "\n";
	}
    };

    &$cond_write_sec('global');
    &$cond_write_sec('client');
    &$cond_write_sec('mds');
    &$cond_write_sec('mds\..*');
    &$cond_write_sec('mon');
    &$cond_write_sec('osd');
    &$cond_write_sec('mon\..*');
    &$cond_write_sec('osd\..*');

    PVE::Tools::file_set_contents($pve_ceph_cfgpath, $out);
}

sub setup_pve_symlinks {
    # fail if we find a real file instead of a link
    if (-f $ceph_cfgpath) {
	my $lnk = readlink($ceph_cfgpath);
	die "file '$ceph_cfgpath' already exists\n"
	    if !$lnk || $lnk ne $pve_ceph_cfgpath;
    } else {
	symlink($pve_ceph_cfgpath, $ceph_cfgpath) ||
	    die "unable to create symlink '$ceph_cfgpath' - $!\n";
    }
}

sub ceph_service_cmd {
    my ($action, $service) = @_;

    if (systemd_managed()) {

	if ($service && $service =~ m/^(mon|osd|mds|radosgw)(\.([A-Za-z0-9]{1,32}))?$/) {
	    $service = defined($3) ? "ceph-$1\@$3" : "ceph-$1.target";
	} else {
	    $service = "ceph.target";
	}

	PVE::Tools::run_command(['/bin/systemctl', $action, $service]);

    } else {
	# ceph daemons does not call 'setsid', so we do that ourself
	# (fork_worker send KILL to whole process group) 
	PVE::Tools::run_command(['setsid', 'service', 'ceph', '-c', $pve_ceph_cfgpath, $action, $service]);
    }
}

sub list_disks {
    my $disklist = {};
    
    my $fd = IO::File->new("/proc/mounts", "r") ||
	die "unable to open /proc/mounts - $!\n";

    my $mounted = {};

    while (defined(my $line = <$fd>)) {
	my ($dev, $path, $fstype) = split(/\s+/, $line);
	next if !($dev && $path && $fstype);
	next if $dev !~ m|^/dev/|;
	my $real_dev = abs_path($dev);
	$mounted->{$real_dev} = $path;
    }
    close($fd);

    my $dev_is_mounted = sub {
	my ($dev) = @_;
	return $mounted->{$dev};
    };

    my $dir_is_empty = sub {
	my ($dir) = @_;

	my $dh = IO::Dir->new ($dir);
	return 1 if !$dh;
	
	while (defined(my $tmp = $dh->read)) {
	    next if $tmp eq '.' || $tmp eq '..';
	    $dh->close;
	    return 0;
	}
	$dh->close;
	return 1;
    };

    my $journal_uuid = '45b0969e-9b03-4f30-b4c6-b4b80ceff106';

    my $journalhash = {};
    dir_glob_foreach('/dev/disk/by-parttypeuuid', "$journal_uuid\..+", sub {
	my ($entry) = @_;
	my $real_dev = abs_path("/dev/disk/by-parttypeuuid/$entry");
	$journalhash->{$real_dev} = 1;
    });

    dir_glob_foreach('/sys/block', '.*', sub {
	my ($dev) = @_;

	return if $dev eq '.';
	return if $dev eq '..';

	return if $dev =~ m|^ram\d+$|; # skip ram devices
	return if $dev =~ m|^loop\d+$|; # skip loop devices
	return if $dev =~ m|^md\d+$|; # skip md devices
	return if $dev =~ m|^dm-.*$|; # skip dm related things
	return if $dev =~ m|^fd\d+$|; # skip Floppy
	return if $dev =~ m|^sr\d+$|; # skip CDs

	my $devdir = "/sys/block/$dev/device";
	return if ! -d $devdir;
	
	my $size = file_read_firstline("/sys/block/$dev/size");
	return if !$size;

	$size = $size * 512;

	my $info = `udevadm info --path /sys/block/$dev --query all`;
	return if !$info;

	return if $info !~ m/^E: DEVTYPE=disk$/m;
	return if $info =~ m/^E: ID_CDROM/m;

	my $serial = 'unknown';
	if ($info =~ m/^E: ID_SERIAL_SHORT=(\S+)$/m) {
	    $serial = $1;
	}

	my $gpt = 0;
	if ($info =~ m/^E: ID_PART_TABLE_TYPE=gpt$/m) {
	    $gpt = 1;
	}

	# detect SSD (fixme - currently only works for ATA disks)
	my $rpm = 7200; # default guess
	if ($info =~ m/^E: ID_ATA_ROTATION_RATE_RPM=(\d+)$/m) {
	    $rpm = $1;
	}

	my $vendor = file_read_firstline("$devdir/vendor") || 'unknown';
	my $model = file_read_firstline("$devdir/model") || 'unknown';

	my $used;

	$used = 'LVM' if !&$dir_is_empty("/sys/block/$dev/holders");

	$used = 'mounted' if &$dev_is_mounted("/dev/$dev");

	$disklist->{$dev} = { 
	    vendor => $vendor, 
	    model => $model, 
	    size => $size,
	    serial => $serial,
	    gpt => $gpt,
	    rmp => $rpm,
	}; 

	my $osdid = -1;

	my $journal_count = 0;

	my $found_partitions;
	my $found_lvm;
	my $found_mountpoints;
	dir_glob_foreach("/sys/block/$dev", "$dev.+", sub {
	    my ($part) = @_;

	    $found_partitions = 1;

	    if (my $mp = &$dev_is_mounted("/dev/$part")) {
		$found_mountpoints = 1;
		if ($mp =~ m|^/var/lib/ceph/osd/ceph-(\d+)$|) {
		    $osdid = $1;
		} 
	    }
	    if (!&$dir_is_empty("/sys/block/$dev/$part/holders"))  {
		$found_lvm = 1;
	    }
	    $journal_count++ if $journalhash->{"/dev/$part"};
	});

	$used = 'mounted' if $found_mountpoints && !$used;
	$used = 'LVM' if $found_lvm && !$used;
	$used = 'partitions' if $found_partitions && !$used;

	$disklist->{$dev}->{used} = $used if $used;
	$disklist->{$dev}->{osdid} = $osdid;
	$disklist->{$dev}->{journals} = $journal_count;
    });

    return $disklist;
}

# Ceph versions greater Hammer use 'ceph' as user and group instead
# of 'root', and use systemd.
sub systemd_managed {

    if (-f "/lib/systemd/system/ceph-osd\@.service") {
	return 1;
    } else {
	return 0;
    }
}

1;
