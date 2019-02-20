package PVE::Ceph::Tools;

use strict;
use warnings;

use File::Path;
use File::Basename;
use IO::File;

use PVE::Tools qw(run_command dir_glob_foreach);
use PVE::RADOS;

my $ccname = 'ceph'; # ceph cluster name
my $ceph_cfgdir = "/etc/ceph";
my $pve_ceph_cfgpath = "/etc/pve/$ccname.conf";
my $ceph_cfgpath = "$ceph_cfgdir/$ccname.conf";

my $pve_mon_key_path = "/etc/pve/priv/$ccname.mon.keyring";
my $pve_ckeyring_path = "/etc/pve/priv/$ccname.client.admin.keyring";
my $ceph_bootstrap_osd_keyring = "/var/lib/ceph/bootstrap-osd/$ccname.keyring";
my $ceph_bootstrap_mds_keyring = "/var/lib/ceph/bootstrap-mds/$ccname.keyring";
my $ceph_mds_data_dir = '/var/lib/ceph/mds';

my $ceph_service = {
    ceph_bin => "/usr/bin/ceph",
    ceph_mon => "/usr/bin/ceph-mon",
    ceph_mgr => "/usr/bin/ceph-mgr",
    ceph_osd => "/usr/bin/ceph-osd",
    ceph_mds => "/usr/bin/ceph-mds",
};

my $config_hash = {
    ccname => $ccname,
    pve_ceph_cfgpath => $pve_ceph_cfgpath,
    pve_mon_key_path => $pve_mon_key_path,
    pve_ckeyring_path => $pve_ckeyring_path,
    ceph_bootstrap_osd_keyring => $ceph_bootstrap_osd_keyring,
    ceph_bootstrap_mds_keyring => $ceph_bootstrap_mds_keyring,
    ceph_mds_data_dir => $ceph_mds_data_dir,
    long_rados_timeout => 60,
};

sub get_local_version {
    my ($noerr) = @_;

    if (check_ceph_installed('ceph_bin', $noerr)) {
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

    return undef if !check_ceph_installed('ceph_mon', $noerr);

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

sub create_pool {
    my ($pool, $param, $rados) = @_;

    if (!defined($rados)) {
	$rados = PVE::RADOS->new();
    }

    my $pg_num = $param->{pg_num} || 128;
    my $size = $param->{size} || 3;
    my $min_size = $param->{min_size} || 2;
    my $application = $param->{application} // 'rbd';

    $rados->mon_command({
	prefix => "osd pool create",
	pool => $pool,
	pg_num => int($pg_num),
	format => 'plain',
    });

    $rados->mon_command({
	prefix => "osd pool set",
	pool => $pool,
	var => 'min_size',
	val => "$min_size",
	format => 'plain',
    });

    $rados->mon_command({
	prefix => "osd pool set",
	pool => $pool,
	var => 'size',
	val => "$size",
	format => 'plain',
    });

    if (defined($param->{crush_rule})) {
	$rados->mon_command({
	    prefix => "osd pool set",
	    pool => $pool,
	    var => 'crush_rule',
	    val => $param->{crush_rule},
	    format => 'plain',
	});
    }

    $rados->mon_command({
	prefix => "osd pool application enable",
	pool => $pool,
	app => $application,
    });

}

sub ls_pools {
    my ($pool, $rados) = @_;

    if (!defined($rados)) {
	$rados = PVE::RADOS->new();
    }

    my $res = $rados->mon_command({ prefix => "osd lspools" });

    return $res;
}

sub destroy_pool {
    my ($pool, $rados) = @_;

    if (!defined($rados)) {
	$rados = PVE::RADOS->new();
    }

    # fixme: '--yes-i-really-really-mean-it'
    $rados->mon_command({
	prefix => "osd pool delete",
	pool => $pool,
	pool2 => $pool,
	sure => '--yes-i-really-really-mean-it',
	format => 'plain',
    });
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

# Ceph versions greater Hammer use 'ceph' as user and group instead
# of 'root', and use systemd.
sub systemd_managed {

    if (-f "/lib/systemd/system/ceph-osd\@.service") {
	return 1;
    } else {
	return 0;
    }
}

# wipe the first 200 MB to clear off leftovers from previous use, otherwise a
# create OSD fails.
sub wipe_disks {
    my (@devs) = @_;

    my @wipe_cmd = qw(/bin/dd if=/dev/zero bs=1M conv=fdatasync);

    foreach my $devpath (@devs) {
	my $devname = basename($devpath);
	my $dev_size = PVE::Tools::file_get_contents("/sys/class/block/$devname/size");

	($dev_size) = $dev_size =~ m|(\d+)|; # untaint $dev_size
	die "Coulnd't get the size of the device $devname\n" if (!defined($dev_size));

	my $size = ($dev_size * 512 / 1024 / 1024);
	my $count = ($size < 200) ? $size : 200;

	print "wipe disk/partition: $devpath\n";
	eval { run_command([@wipe_cmd, "count=$count", "of=${devpath}"]) };
	warn $@ if $@;
    }
};

1;
