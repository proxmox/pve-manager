package PVE::CephTools;

use strict;
use warnings;

use File::Path;
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

sub create_pool {
    my ($pool, $param, $rados) = @_;

    if (!defined($rados)) {
	$rados = PVE::RADOS->new();
    }

    my $pg_num = $param->{pg_num} || 64;
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
	val => $min_size,
	format => 'plain',
    });

    $rados->mon_command({
	prefix => "osd pool set",
	pool => $pool,
	var => 'size',
	val => $size,
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

sub list_local_mds_ids {
    my $mds_list = [];

    PVE::Tools::dir_glob_foreach($ceph_mds_data_dir, qr/$ccname-(\S+)/, sub {
	my (undef, $mds_id) = @_;
	push @$mds_list, $mds_id;
    });

    return $mds_list;
}

sub get_cluster_mds_state {
    my ($rados) = @_;

    my $mds_state = {};

    if (!defined($rados)) {
	$rados = PVE::RADOS->new();
    }

    my $add_state = sub {
	my ($mds) = @_;

	my $state = {};
	$state->{addr} = $mds->{addr};
	$state->{rank} = $mds->{rank};
	$state->{standby_replay} = $mds->{standby_replay} ? 1 : 0;
	$state->{state} = $mds->{state};

	$mds_state->{$mds->{name}} = $state;
    };

    my $mds_dump = $rados->mon_command({ prefix => 'mds stat' });
    my $fsmap = $mds_dump->{fsmap};


    foreach my $mds (@{$fsmap->{standbys}}) {
	$add_state->($mds);
    }

    my $fs_info = $fsmap->{filesystems}->[0];
    my $active_mds = $fs_info->{mdsmap}->{info};

    # normally there's only one active MDS, but we can have multiple active for
    # different ranks (e.g., different cephs path hierarchy). So just add all.
    foreach my $mds (values %$active_mds) {
	$add_state->($mds);
    }

    return $mds_state;
}

sub is_any_mds_active {
    my ($rados) = @_;

    if (!defined($rados)) {
	$rados = PVE::RADOS->new();
    }

    my $mds_dump = $rados->mon_command({ prefix => 'mds stat' });
    my $fs = $mds_dump->{fsmap}->{filesystems};

    if (!($fs && scalar(@$fs) > 0)) {
	return undef;
    }
    my $active_mds = $fs->[0]->{mdsmap}->{info};

    return scalar(keys %$active_mds) > 0;
}

sub create_mds {
    my ($id, $rados) = @_;

    # `ceph fs status` fails with numeric only ID.
    die "ID: $id, numeric only IDs are not supported\n"
	if $id =~ /^\d+$/;

    if (!defined($rados)) {
	$rados = PVE::RADOS->new();
    }

    my $service_dir = "/var/lib/ceph/mds/$ccname-$id";
    my $service_keyring = "$service_dir/keyring";
    my $service_name = "mds.$id";

    die "ceph MDS directory '$service_dir' already exists\n"
	if -d $service_dir;

    print "creating MDS directory '$service_dir'\n";
    eval { File::Path::mkpath($service_dir) };
    my $err = $@;
    die "creation MDS directory '$service_dir' failed\n" if $err;

    # http://docs.ceph.com/docs/luminous/install/manual-deployment/#adding-mds
    my $priv = [
	mon => 'allow profile mds',
	osd => 'allow rwx',
	mds => 'allow *',
    ];

    print "creating keys for '$service_name'\n";
    my $output = $rados->mon_command({
	prefix => 'auth get-or-create',
	entity => $service_name,
	caps => $priv,
	format => 'plain',
    });

    PVE::Tools::file_set_contents($service_keyring, $output);

    print "setting ceph as owner for service directory\n";
    run_command(["chown", 'ceph:ceph', '-R', $service_dir]);

    print "enabling service 'ceph-mds\@$id.service'\n";
    ceph_service_cmd('enable', $service_name);
    print "starting service 'ceph-mds\@$id.service'\n";
    ceph_service_cmd('start', $service_name);

    return undef;
};

sub destroy_mds {
    my ($id, $rados) = @_;

    if (!defined($rados)) {
	$rados = PVE::RADOS->new();
    }

    my $service_name = "mds.$id";
    my $service_dir = "/var/lib/ceph/mds/$ccname-$id";

    print "disabling service 'ceph-mds\@$id.service'\n";
    ceph_service_cmd('disable', $service_name);
    print "stopping service 'ceph-mds\@$id.service'\n";
    ceph_service_cmd('stop', $service_name);

    if (-d $service_dir) {
	print "removing ceph-mds directory '$service_dir'\n";
	File::Path::remove_tree($service_dir);
    } else {
	warn "cannot cleanup MDS $id directory, '$service_dir' not found\n"
    }

    print "removing ceph auth for '$service_name'\n";
    $rados->mon_command({
	    prefix => 'auth del',
	    entity => $service_name,
	    format => 'plain'
	});

    return undef;
};

1;
