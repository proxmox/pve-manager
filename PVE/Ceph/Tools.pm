package PVE::Ceph::Tools;

use strict;
use warnings;

use File::Path;
use File::Basename;
use IO::File;
use JSON;

use PVE::Tools qw(run_command dir_glob_foreach);
use PVE::Cluster qw(cfs_read_file);
use PVE::RADOS;
use PVE::Ceph::Services;
use PVE::CephConfig;

my $ccname = 'ceph'; # ceph cluster name
my $ceph_cfgdir = "/etc/ceph";
my $pve_ceph_cfgpath = "/etc/pve/$ccname.conf";
my $ceph_cfgpath = "$ceph_cfgdir/$ccname.conf";

my $pve_mon_key_path = "/etc/pve/priv/$ccname.mon.keyring";
my $pve_ckeyring_path = "/etc/pve/priv/$ccname.client.admin.keyring";
my $ckeyring_path = "/etc/ceph/ceph.client.admin.keyring";
my $ceph_bootstrap_osd_keyring = "/var/lib/ceph/bootstrap-osd/$ccname.keyring";
my $ceph_bootstrap_mds_keyring = "/var/lib/ceph/bootstrap-mds/$ccname.keyring";
my $ceph_mds_data_dir = '/var/lib/ceph/mds';

my $ceph_service = {
    ceph_bin => "/usr/bin/ceph",
    ceph_mon => "/usr/bin/ceph-mon",
    ceph_mgr => "/usr/bin/ceph-mgr",
    ceph_osd => "/usr/bin/ceph-osd",
    ceph_mds => "/usr/bin/ceph-mds",
    ceph_volume => '/usr/sbin/ceph-volume',
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
    ceph_cfgpath => $ceph_cfgpath,
};

sub get_local_version {
    my ($noerr) = @_;

    if (check_ceph_installed('ceph_bin', $noerr)) {
	my $ceph_version;
	run_command(
	    [ $ceph_service->{ceph_bin}, '--version' ],
	    noerr => $noerr,
	    outfunc => sub { $ceph_version = shift if !defined $ceph_version },
	);
	return undef if !defined $ceph_version;

	if ($ceph_version =~ /^ceph.*\sv?(\d+(?:\.\d+)+(?:-pve\d+)?)\s+(?:\(([a-zA-Z0-9]+)\))?/) {
	    my ($version, $buildcommit) = ($1, $2);
	    my $subversions = [ split(/\.|-/, $version) ];

	    # return (version, buildid, major, minor, ...) : major;
	    return wantarray
		? ($version, $buildcommit, $subversions)
		: $subversions->[0];
	}
    }

    return undef;
}

sub get_cluster_versions {
    my ($service, $noerr) = @_;

    my $rados = PVE::RADOS->new();
    my $cmd = $service ? "$service versions" : 'versions';
    return $rados->mon_command({ prefix => $cmd });
}

sub get_config {
    my $key = shift;

    my $value = $config_hash->{$key};

    die "no such ceph config '$key'" if !$value;

    return $value;
}

sub purge_all_ceph_files {
    my ($services) = @_;
    my $is_local_mon;
    my $monlist = [ split(',', PVE::CephConfig::get_monaddr_list($pve_ceph_cfgpath)) ];

    foreach my $service (keys %$services) {
	my $type = $services->{$service};
	next if (!%$type);

	foreach my $name (keys %$type) {
	    my $dir_exists = $type->{$name}->{direxists};

	    $is_local_mon = grep($type->{$name}->{addr}, @$monlist)
		if $service eq 'mon';

	    my $path = "/var/lib/ceph/$service";
	    $path = '/var/log/ceph' if $service eq 'logs';
	    if ($dir_exists) {
		my $err;
		File::Path::remove_tree($path, {
			keep_root => 1,
			error => \$err,
		    });
		warn "Error removing path, '$path'\n" if @$err;
	    }
	}
    }

    if (scalar @$monlist > 0 && !$is_local_mon) {
	warn "Foreign MON address in ceph.conf. Keeping config & keyrings\n"
    } else {
	print "Removing config & keyring files\n";
	foreach my $file (%$config_hash) {
	    unlink $file if (-e $file);
	}
    }
}

sub purge_all_ceph_services {
    my ($services) = @_;

    foreach my $service (keys %$services) {
	my $type = $services->{$service};
	next if (!%$type);

	foreach my $name (keys %$type) {
	    my $service_exists = $type->{$name}->{service};

	    if ($service_exists) {
		eval { PVE::Ceph::Services::ceph_service_cmd('disable', "$service.$name") };
		warn "Could not disable ceph-$service\@$name, error: $@\n" if $@;

		eval { PVE::Ceph::Services::ceph_service_cmd('stop', "$service.$name") };
		warn "Could not stop ceph-$service\@$name, error: $@\n" if $@;
	    }
	}
    }
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


sub check_ceph_configured {

    check_ceph_inited();

    die "ceph not fully configured - missing '$pve_ckeyring_path'\n"
	if ! -f $pve_ckeyring_path;

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

sub set_pool {
    my ($pool, $param) = @_;

    foreach my $setting (keys %$param) {
	my $value = $param->{$setting};

	my $command;
	if ($setting eq 'application') {
	    $command = {
		prefix => "osd pool application enable",
		pool   => "$pool",
		app    => "$value",
	    };
	} else {
	    $command = {
		prefix => "osd pool set",
		pool   => "$pool",
		var    => "$setting",
		val    => "$value",
		format => 'plain',
	    };
	}

	my $rados = PVE::RADOS->new();
	eval { $rados->mon_command($command); };
	if ($@) {
	    print "$@";
	} else {
	    delete $param->{$setting};
	}
    }

    if ((keys %$param) > 0) {
	my @missing = join(', ', keys %$param );
	die "Could not set: @missing\n";
    }

}

sub create_pool {
    my ($pool, $param, $rados) = @_;

    if (!defined($rados)) {
	$rados = PVE::RADOS->new();
    }

    my $pg_num = $param->{pg_num} || 128;

    $rados->mon_command({
	prefix => "osd pool create",
	pool => $pool,
	pg_num => int($pg_num),
	format => 'plain',
    });

    set_pool($pool, $param);

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
	'yes_i_really_really_mean_it' => JSON::true,
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
	mkdir $ceph_cfgdir;
	symlink($pve_ceph_cfgpath, $ceph_cfgpath) ||
	    die "unable to create symlink '$ceph_cfgpath' - $!\n";
    }
    my $ceph_uid = getpwnam('ceph');
    my $ceph_gid = getgrnam('ceph');
    chown $ceph_uid, $ceph_gid, $ceph_cfgdir;
}

sub get_or_create_admin_keyring {
    if (! -f $pve_ckeyring_path) {
	run_command("ceph-authtool --create-keyring $pve_ckeyring_path " .
	    "--gen-key -n client.admin " .
	    "--cap mon 'allow *' " .
	    "--cap osd 'allow *' " .
	    "--cap mds 'allow *' " .
	    "--cap mgr 'allow *' ");
	# we do not want to overwrite it
	if (! -f $ckeyring_path) {
	    run_command("cp $pve_ckeyring_path $ckeyring_path");
	    run_command("chown ceph:ceph $ckeyring_path");
	}
    }
    return $pve_ckeyring_path;
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

# get ceph-volume managed osds
sub ceph_volume_list {
    my $result = {};

    if (!check_ceph_installed('ceph_volume', 1)) {
	return $result;
    }

    my $output = '';
    my $cmd = [ $ceph_service->{ceph_volume}, 'lvm', 'list', '--format', 'json' ];
    run_command($cmd, outfunc => sub { $output .= shift });

    $result = eval { decode_json($output) };
    warn $@ if $@;
    return $result;
}

sub ceph_volume_zap {
    my ($osdid, $destroy) = @_;

    die "no osdid given\n" if !defined($osdid);

    my $cmd = [ $ceph_service->{ceph_volume}, 'lvm', 'zap', '--osd-id', $osdid ];
    push @$cmd, '--destroy' if $destroy;

    run_command($cmd);
}

sub get_db_wal_sizes {
    my $res = {};

    my $rados = PVE::RADOS->new();
    my $db_config = $rados->mon_command({ prefix => 'config-key dump', key => 'config/' });

    $res->{db} = $db_config->{"config/osd/bluestore_block_db_size"} //
		 $db_config->{"config/global/bluestore_block_db_size"};

    $res->{wal} = $db_config->{"config/osd/bluestore_block_wal_size"} //
		  $db_config->{"config/global/bluestore_block_wal_size"};

    if (!$res->{db} || !$res->{wal}) {
	my $cfg = cfs_read_file('ceph.conf');
	if (!$res->{db}) {
	    $res->{db} = $cfg->{osd}->{bluestore_block_db_size} //
			 $cfg->{global}->{bluestore_block_db_size};
	}

	if (!$res->{wal}) {
	    $res->{wal} = $cfg->{osd}->{bluestore_block_wal_size} //
			 $cfg->{global}->{bluestore_block_wal_size};
	}
    }

    return $res;
}
sub get_possible_osd_flags {
    my $possible_flags = {
	pause => {
	    description => 'Pauses read and writes.',
	    type => 'boolean',
	    optional=> 1,
	},
	noup => {
	    description => 'OSDs are not allowed to start.',
	    type => 'boolean',
	    optional=> 1,
	},
	nodown => {
	    description => 'OSD failure reports are being ignored, such that the monitors will not mark OSDs down.',
	    type => 'boolean',
	    optional=> 1,
	},
	noout => {
	    description => 'OSDs will not automatically be marked out after the configured interval.',
	    type => 'boolean',
	    optional=> 1,
	},
	noin => {
	    description => 'OSDs that were previously marked out will not be marked back in when they start.',
	    type => 'boolean',
	    optional=> 1,
	},
	nobackfill => {
	    description => 'Backfilling of PGs is suspended.',
	    type => 'boolean',
	    optional=> 1,
	},
	norebalance => {
	    description => 'Rebalancing of PGs is suspended.',
	    type => 'boolean',
	    optional=> 1,
	},
	norecover => {
	    description => 'Recovery of PGs is suspended.',
	    type => 'boolean',
	    optional=> 1,
	},
	noscrub => {
	    description => 'Scrubbing is disabled.',
	    type => 'boolean',
	    optional=> 1,
	},
	'nodeep-scrub' => {
	    description => 'Deep Scrubbing is disabled.',
	    type => 'boolean',
	    optional=> 1,
	},
	notieragent => {
	    description => 'Cache tiering activity is suspended.',
	    type => 'boolean',
	    optional=> 1,
	},
    };
    return $possible_flags;
}

sub get_real_flag_name {
    my ($flag) = @_;

    # the 'pause' flag gets always set to both 'pauserd' and 'pausewr'
    # so decide that the 'pause' flag is set if we detect 'pauserd'
    my $flagmap = {
	'pause' => 'pauserd',
    };

    return $flagmap->{$flag} // $flag;
}

sub ceph_cluster_status {
    my ($rados) = @_;
    $rados = PVE::RADOS->new() if !$rados;

    my $status = $rados->mon_command({ prefix => 'status' });
    $status->{health} = $rados->mon_command({ prefix => 'health', detail => 'detail' });

    if (!exists $status->{monmap}->{mons}) { # octopus moved most info out of status, re-add
	$status->{monmap} = $rados->mon_command({ prefix => 'mon dump' });
	$status->{mgrmap} = $rados->mon_command({ prefix => 'mgr dump' });
    }

    return $status;
}

1;
