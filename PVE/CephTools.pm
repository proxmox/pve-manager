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

my $ceph_service = {
    ceph_bin => "/usr/bin/ceph",
    ceph_mon => "/usr/bin/ceph-mon",
    ceph_mgr => "/usr/bin/ceph-mgr",
    ceph_osd => "/usr/bin/ceph-osd"
};

my $config_hash = {
    ccname => $ccname,
    pve_ceph_cfgpath => $pve_ceph_cfgpath,
    pve_mon_key_path => $pve_mon_key_path,
    pve_ckeyring_path => $pve_ckeyring_path,
    ceph_bootstrap_osd_keyring => $ceph_bootstrap_osd_keyring,
    ceph_bootstrap_mds_keyring => $ceph_bootstrap_mds_keyring,
    long_rados_timeout => 60,
};

sub get_local_version {
    my ($noerr) = @_;

    if (PVE::CephTools::check_ceph_installed('ceph_bin', $noerr)) {
	my $ceph_version;
	run_command([$ceph_service->{ceph_bin}, '--version'],
	            noerr => $noerr,
	            outfunc => sub { $ceph_version = shift; });
	if ($ceph_version && $ceph_version =~ /^ceph.*\s((\d+)\.(\d+)\.(\d+))/) {
	    # return (version, major, minor, patch) : major;
	    return wantarray ? ($1, $2, $3, $4) : $2;
	}
    }

    return undef;
}

sub get_config {
    my $key = shift;

    my $value = $config_hash->{$key};

    die "no such ceph config '$key'" if !$value;

    return $value;
}

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
    my ($service, $noerr) = @_;

    $service = 'ceph_bin' if !defined($service);

    if (! -x $ceph_service->{$service}) {
	die "binary not installed: $ceph_service->{$service}\n" if !$noerr;
	return undef;
    }

    return 1;
}

sub check_ceph_inited {
    my ($noerr) = @_;

    return undef if !check_ceph_installed('ceph_bin', $noerr);

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

	if ($service && $service =~ m/^(mon|osd|mds|mgr|radosgw)(\.([A-Za-z0-9\-]{1,32}))?$/) {
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
