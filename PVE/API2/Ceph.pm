package PVE::API2::CephOSD;

use strict;
use warnings;
use Cwd qw(abs_path);
use Net::IP;

use PVE::SafeSyslog;
use PVE::Tools qw(extract_param run_command file_get_contents file_read_firstline dir_glob_regex dir_glob_foreach);
use PVE::Exception qw(raise raise_param_exc);
use PVE::INotify;
use PVE::Cluster qw(cfs_lock_file cfs_read_file cfs_write_file);
use PVE::AccessControl;
use PVE::Storage;
use PVE::API2::Storage::Config;
use PVE::RESTHandler;
use PVE::RPCEnvironment;
use PVE::JSONSchema qw(get_standard_option);
use PVE::RADOS;
use PVE::CephTools;
use PVE::Diskmanage;

use base qw(PVE::RESTHandler);

use Data::Dumper; # fixme: remove

my $get_osd_status = sub {
    my ($rados, $osdid) = @_;

    my $stat = $rados->mon_command({ prefix => 'osd dump' });

    my $osdlist = $stat->{osds} || [];

    my $flags = $stat->{flags} || undef;

    my $osdstat;
    foreach my $d (@$osdlist) {
	$osdstat->{$d->{osd}} = $d if defined($d->{osd});
    }
    if (defined($osdid)) {
	die "no such OSD '$osdid'\n" if !$osdstat->{$osdid};
	return $osdstat->{$osdid};
    }

    return wantarray? ($osdstat, $flags):$osdstat;
};

my $get_osd_usage = sub {
    my ($rados) = @_;

    my $osdlist = $rados->mon_command({ prefix => 'pg dump',
					dumpcontents => [ 'osds' ]}) || [];

    my $osdstat;
    foreach my $d (@$osdlist) {
	$osdstat->{$d->{osd}} = $d if defined($d->{osd});
    }

    return $osdstat;
};

__PACKAGE__->register_method ({
    name => 'index',
    path => '',
    method => 'GET',
    description => "Get Ceph osd list/tree.",
    proxyto => 'node',
    protected => 1,
    permissions => {
	check => ['perm', '/', [ 'Sys.Audit', 'Datastore.Audit' ], any => 1],
    },
    parameters => {
	additionalProperties => 0,
	properties => {
	    node => get_standard_option('pve-node'),
	},
    },
    # fixme: return a list instead of extjs tree format ?
    returns => {
	type => "object",
    },
    code => sub {
	my ($param) = @_;

	PVE::CephTools::check_ceph_inited();

	my $rados = PVE::RADOS->new();
	my $res = $rados->mon_command({ prefix => 'osd tree' });

        die "no tree nodes found\n" if !($res && $res->{nodes});

	my ($osdhash, $flags) = &$get_osd_status($rados);

	my $usagehash = &$get_osd_usage($rados);

	my $osdmetadata_tmp = $rados->mon_command({ prefix => 'osd metadata' });

	my $osdmetadata = {};
	foreach my $osd (@$osdmetadata_tmp) {
	    $osdmetadata->{$osd->{id}} = $osd;
	}

	my $nodes = {};
	my $newnodes = {};
	foreach my $e (@{$res->{nodes}}) {
	    $nodes->{$e->{id}} = $e;

	    my $new = {
		id => $e->{id},
		name => $e->{name},
		type => $e->{type}
	    };

	    foreach my $opt (qw(status crush_weight reweight device_class)) {
		$new->{$opt} = $e->{$opt} if defined($e->{$opt});
	    }

	    if (my $stat = $osdhash->{$e->{id}}) {
		$new->{in} = $stat->{in} if defined($stat->{in});
	    }

	    if (my $stat = $usagehash->{$e->{id}}) {
		$new->{total_space} = ($stat->{kb} || 1) * 1024;
		$new->{bytes_used} = ($stat->{kb_used} || 0) * 1024;
		$new->{percent_used} = ($new->{bytes_used}*100)/$new->{total_space};
		if (my $d = $stat->{perf_stat}) {
		    $new->{commit_latency_ms} = $d->{commit_latency_ms};
		    $new->{apply_latency_ms} = $d->{apply_latency_ms};
		}
	    }

	    my $osdmd = $osdmetadata->{$e->{id}};
	    if ($e->{type} eq 'osd' && $osdmd) {
		if ($osdmd->{bluefs}) {
		    $new->{osdtype} = 'bluestore';
		    $new->{blfsdev} = $osdmd->{bluestore_bdev_dev_node};
		    $new->{dbdev} = $osdmd->{bluefs_db_dev_node};
		    $new->{waldev} = $osdmd->{bluefs_wal_dev_node};
		} else {
		    $new->{osdtype} = 'filestore';
		}
	    }

	    $newnodes->{$e->{id}} = $new;
	}

	foreach my $e (@{$res->{nodes}}) {
	    my $new = $newnodes->{$e->{id}};
	    if ($e->{children} && scalar(@{$e->{children}})) {
		$new->{children} = [];
		$new->{leaf} = 0;
		foreach my $cid (@{$e->{children}}) {
		    $nodes->{$cid}->{parent} = $e->{id};
		    if ($nodes->{$cid}->{type} eq 'osd' &&
			$e->{type} eq 'host') {
			$newnodes->{$cid}->{host} = $e->{name};
		    }
		    push @{$new->{children}}, $newnodes->{$cid};
		}
	    } else {
		$new->{leaf} = ($e->{id} >= 0) ? 1 : 0;
	    }
	}

	my $roots = [];
	foreach my $e (@{$res->{nodes}}) {
	    if (!$nodes->{$e->{id}}->{parent}) {
		push @$roots, $newnodes->{$e->{id}};
	    }
	}

	die "no root node\n" if !@$roots;

	my $data = { root => { leaf =>  0, children => $roots } };

	# we want this for the noout flag
	$data->{flags} = $flags if $flags;

	return $data;
    }});

__PACKAGE__->register_method ({
    name => 'createosd',
    path => '',
    method => 'POST',
    description => "Create OSD",
    proxyto => 'node',
    protected => 1,
    parameters => {
	additionalProperties => 0,
	properties => {
	    node => get_standard_option('pve-node'),
	    dev => {
		description => "Block device name.",
		type => 'string',
	    },
	    journal_dev => {
		description => "Block device name for journal (filestore) or block.db (bluestore).",
		optional => 1,
		type => 'string',
	    },
	    wal_dev => {
		description => "Block device name for block.wal (bluestore only).",
		optional => 1,
		type => 'string',
	    },
	    fstype => {
		description => "File system type (filestore only).",
		type => 'string',
		enum => ['xfs', 'ext4', 'btrfs'],
		default => 'xfs',
		optional => 1,
	    },
	    bluestore => {
		description => "Use bluestore instead of filestore. This is the default.",
		type => 'boolean',
		default => 1,
		optional => 1,
	    },
	},
    },
    returns => { type => 'string' },
    code => sub {
	my ($param) = @_;

	my $rpcenv = PVE::RPCEnvironment::get();

	my $authuser = $rpcenv->get_user();

	raise_param_exc({ 'bluestore' => "conflicts with parameter 'fstype'" })
	    if (defined($param->{fstype}) && defined($param->{bluestore}) && $param->{bluestore});

	PVE::CephTools::check_ceph_inited();

	PVE::CephTools::setup_pve_symlinks();

	PVE::CephTools::check_ceph_installed('ceph_osd');

	my $bluestore = $param->{bluestore} // 1;

	my $journal_dev;
	my $wal_dev;

	if ($param->{journal_dev} && ($param->{journal_dev} ne $param->{dev})) {
            $journal_dev = PVE::Diskmanage::verify_blockdev_path($param->{journal_dev});
	}

	if ($param->{wal_dev} &&
	    ($param->{wal_dev} ne $param->{dev}) &&
	    (!$param->{journal_dev} || $param->{wal_dev} ne $param->{journal_dev})) {
	    raise_param_exc({ 'wal_dev' => "can only be set with paramater 'bluestore'"})
		if !$bluestore;
            $wal_dev = PVE::Diskmanage::verify_blockdev_path($param->{wal_dev});
	}

        $param->{dev} = PVE::Diskmanage::verify_blockdev_path($param->{dev});

	my $devname = $param->{dev};
	$devname =~ s|/dev/||;

	my $disklist = PVE::Diskmanage::get_disks($devname, 1);

	my $diskinfo = $disklist->{$devname};
	die "unable to get device info for '$devname'\n"
	    if !$diskinfo;

	die "device '$param->{dev}' is in use\n"
	    if $diskinfo->{used};

	my $devpath = $diskinfo->{devpath};
	my $rados = PVE::RADOS->new();
	my $monstat = $rados->mon_command({ prefix => 'mon_status' });
	die "unable to get fsid\n" if !$monstat->{monmap} || !$monstat->{monmap}->{fsid};

	my $fsid = $monstat->{monmap}->{fsid};
        $fsid = $1 if $fsid =~ m/^([0-9a-f\-]+)$/;

	my $ceph_bootstrap_osd_keyring = PVE::CephTools::get_config('ceph_bootstrap_osd_keyring');

	if (! -f $ceph_bootstrap_osd_keyring) {
	    my $bindata = $rados->mon_command({ prefix => 'auth get', entity => 'client.bootstrap-osd', format => 'plain' });
	    PVE::Tools::file_set_contents($ceph_bootstrap_osd_keyring, $bindata);
	};

	my $worker = sub {
	    my $upid = shift;

	    my $fstype = $param->{fstype} || 'xfs';


	    my $ccname = PVE::CephTools::get_config('ccname');

	    my $cmd = ['ceph-disk', 'prepare', '--zap-disk',
		       '--cluster', $ccname, '--cluster-uuid', $fsid ];

	    if ($bluestore) {
		print "create OSD on $devpath (bluestore)\n";
		push @$cmd, '--bluestore';

		if ($journal_dev) {
		    print "using device '$journal_dev' for block.db\n";
		    push @$cmd, '--block.db', $journal_dev;
		}

		if ($wal_dev) {
		    print "using device '$wal_dev' for block.wal\n";
		    push @$cmd, '--block.wal', $wal_dev;
		}

		push @$cmd, $devpath;
	    } else {
		print "create OSD on $devpath ($fstype)\n";
		push @$cmd, '--filestore', '--fs-type', $fstype;
		if ($journal_dev) {
		    print "using device '$journal_dev' for journal\n";
		    push @$cmd, '--journal-dev', $devpath, $journal_dev;
		} else {
		    push @$cmd, $devpath;
		}
	    }


	    run_command($cmd);
	};

	return $rpcenv->fork_worker('cephcreateosd', $devname,  $authuser, $worker);
    }});

__PACKAGE__->register_method ({
    name => 'destroyosd',
    path => '{osdid}',
    method => 'DELETE',
    description => "Destroy OSD",
    proxyto => 'node',
    protected => 1,
    parameters => {
	additionalProperties => 0,
	properties => {
	    node => get_standard_option('pve-node'),
	    osdid => {
		description => 'OSD ID',
		type => 'integer',
	    },
	    cleanup => {
		description => "If set, we remove partition table entries.",
		type => 'boolean',
		optional => 1,
		default => 0,
	    },
	},
    },
    returns => { type => 'string' },
    code => sub {
	my ($param) = @_;

	my $rpcenv = PVE::RPCEnvironment::get();

	my $authuser = $rpcenv->get_user();

	PVE::CephTools::check_ceph_inited();

	my $osdid = $param->{osdid};

	my $rados = PVE::RADOS->new();
	my $osdstat = &$get_osd_status($rados, $osdid);

	die "osd is in use (in == 1)\n" if $osdstat->{in};
	#&$run_ceph_cmd(['osd', 'out', $osdid]);

	die "osd is still runnung (up == 1)\n" if $osdstat->{up};

	my $osdsection = "osd.$osdid";

	my $worker = sub {
	    my $upid = shift;

	    # reopen with longer timeout
	    $rados = PVE::RADOS->new(timeout => PVE::CephTools::get_config('long_rados_timeout'));

	    print "destroy OSD $osdsection\n";

	    eval {
		PVE::CephTools::ceph_service_cmd('stop', $osdsection);
		PVE::CephTools::ceph_service_cmd('disable', $osdsection);
	    };
	    warn $@ if $@;

	    print "Remove $osdsection from the CRUSH map\n";
	    $rados->mon_command({ prefix => "osd crush remove", name => $osdsection, format => 'plain' });

	    print "Remove the $osdsection authentication key.\n";
	    $rados->mon_command({ prefix => "auth del", entity => $osdsection, format => 'plain' });

	    print "Remove OSD $osdsection\n";
	    $rados->mon_command({ prefix => "osd rm", ids => [ $osdsection ], format => 'plain' });

	    # try to unmount from standard mount point
	    my $mountpoint = "/var/lib/ceph/osd/ceph-$osdid";

	    my $remove_partition = sub {
		my ($part) = @_;

		return if !$part || (! -b $part );
		my $partnum = PVE::Diskmanage::get_partnum($part);
		my $devpath = PVE::Diskmanage::get_blockdev($part);

		print "remove partition $part (disk '${devpath}', partnum $partnum)\n";
		eval { run_command(['/sbin/sgdisk', '-d', $partnum, "${devpath}"]); };
		warn $@ if $@;
	    };

	    my $partitions_to_remove = [];

	    if ($param->{cleanup}) {
		if (my $fd = IO::File->new("/proc/mounts", "r")) {
		    while (defined(my $line = <$fd>)) {
			my ($dev, $path, $fstype) = split(/\s+/, $line);
			next if !($dev && $path && $fstype);
			next if $dev !~ m|^/dev/|;
			if ($path eq $mountpoint) {
			    my $data_part = abs_path($dev);
			    push @$partitions_to_remove, $data_part;
			    last;
			}
		    }
		    close($fd);
		}

		foreach my $path (qw(journal block block.db block.wal)) {
		    my $part = abs_path("$mountpoint/$path");
		    if ($part) {
			push @$partitions_to_remove, $part;
		    }
		}
	    }

	    print "Unmount OSD $osdsection from  $mountpoint\n";
	    eval { run_command(['/bin/umount', $mountpoint]); };
	    if (my $err = $@) {
		warn $err;
	    } elsif ($param->{cleanup}) {
		#be aware of the ceph udev rules which can remount.
		foreach my $part (@$partitions_to_remove) {
		    $remove_partition->($part);
		}
	    }
	};

	return $rpcenv->fork_worker('cephdestroyosd', $osdsection,  $authuser, $worker);
    }});

__PACKAGE__->register_method ({
    name => 'in',
    path => '{osdid}/in',
    method => 'POST',
    description => "ceph osd in",
    proxyto => 'node',
    protected => 1,
    permissions => {
	check => ['perm', '/', [ 'Sys.Modify' ]],
    },
    parameters => {
	additionalProperties => 0,
	properties => {
	    node => get_standard_option('pve-node'),
	    osdid => {
		description => 'OSD ID',
		type => 'integer',
	    },
	},
    },
    returns => { type => "null" },
    code => sub {
	my ($param) = @_;

	PVE::CephTools::check_ceph_inited();

	my $osdid = $param->{osdid};

	my $rados = PVE::RADOS->new();

	my $osdstat = &$get_osd_status($rados, $osdid); # osd exists?

	my $osdsection = "osd.$osdid";

	$rados->mon_command({ prefix => "osd in", ids => [ $osdsection ], format => 'plain' });

	return undef;
    }});

__PACKAGE__->register_method ({
    name => 'out',
    path => '{osdid}/out',
    method => 'POST',
    description => "ceph osd out",
    proxyto => 'node',
    protected => 1,
    permissions => {
	check => ['perm', '/', [ 'Sys.Modify' ]],
    },
    parameters => {
	additionalProperties => 0,
	properties => {
	    node => get_standard_option('pve-node'),
	    osdid => {
		description => 'OSD ID',
		type => 'integer',
	    },
	},
    },
    returns => { type => "null" },
    code => sub {
	my ($param) = @_;

	PVE::CephTools::check_ceph_inited();

	my $osdid = $param->{osdid};

	my $rados = PVE::RADOS->new();

	my $osdstat = &$get_osd_status($rados, $osdid); # osd exists?

	my $osdsection = "osd.$osdid";

	$rados->mon_command({ prefix => "osd out", ids => [ $osdsection ], format => 'plain' });

	return undef;
    }});

package PVE::API2::Ceph;

use strict;
use warnings;
use File::Basename;
use File::Path;
use POSIX qw (LONG_MAX);
use Cwd qw(abs_path);
use IO::Dir;
use UUID;
use Net::IP;

use PVE::SafeSyslog;
use PVE::Tools qw(extract_param run_command file_get_contents file_read_firstline dir_glob_regex dir_glob_foreach);
use PVE::Exception qw(raise raise_param_exc);
use PVE::INotify;
use PVE::Cluster qw(cfs_lock_file cfs_read_file cfs_write_file);
use PVE::AccessControl;
use PVE::Storage;
use PVE::RESTHandler;
use PVE::RPCEnvironment;
use PVE::JSONSchema qw(get_standard_option);
use JSON;
use PVE::RADOS;
use PVE::CephTools;
use PVE::Network;

use base qw(PVE::RESTHandler);

use Data::Dumper; # fixme: remove

my $pve_osd_default_journal_size = 1024*5;

__PACKAGE__->register_method ({
    subclass => "PVE::API2::CephOSD",
    path => 'osd',
});

__PACKAGE__->register_method ({
    name => 'index',
    path => '',
    method => 'GET',
    description => "Directory index.",
    permissions => { user => 'all' },
    permissions => {
	check => ['perm', '/', [ 'Sys.Audit', 'Datastore.Audit' ], any => 1],
    },
    parameters => {
	additionalProperties => 0,
	properties => {
	    node => get_standard_option('pve-node'),
	},
    },
    returns => {
	type => 'array',
	items => {
	    type => "object",
	    properties => {},
	},
	links => [ { rel => 'child', href => "{name}" } ],
    },
    code => sub {
	my ($param) = @_;

	my $result = [
	    { name => 'init' },
	    { name => 'mon' },
	    { name => 'osd' },
	    { name => 'pools' },
	    { name => 'stop' },
	    { name => 'start' },
	    { name => 'status' },
	    { name => 'crush' },
	    { name => 'config' },
	    { name => 'log' },
	    { name => 'disks' },
	    { name => 'flags' },
	    { name => 'rules' },
	];

	return $result;
    }});

__PACKAGE__->register_method ({
    name => 'disks',
    path => 'disks',
    method => 'GET',
    description => "List local disks.",
    proxyto => 'node',
    protected => 1,
    permissions => {
	check => ['perm', '/', [ 'Sys.Audit', 'Datastore.Audit' ], any => 1],
    },
    parameters => {
	additionalProperties => 0,
	properties => {
	    node => get_standard_option('pve-node'),
	    type => {
		description => "Only list specific types of disks.",
		type => 'string',
		enum => ['unused', 'journal_disks'],
		optional => 1,
	    },
	},
    },
    returns => {
	type => 'array',
	items => {
	    type => "object",
	    properties => {
		dev => { type => 'string' },
		used => { type => 'string', optional => 1 },
		gpt => { type => 'boolean' },
		size => { type => 'integer' },
		osdid => { type => 'integer' },
		vendor =>  { type => 'string', optional => 1 },
		model =>  { type => 'string', optional => 1 },
		serial =>  { type => 'string', optional => 1 },
	    },
	},
	# links => [ { rel => 'child', href => "{}" } ],
    },
    code => sub {
	my ($param) = @_;

	PVE::CephTools::check_ceph_inited();

	my $disks = PVE::Diskmanage::get_disks(undef, 1);

	my $res = [];
	foreach my $dev (keys %$disks) {
	    my $d = $disks->{$dev};
	    if ($param->{type}) {
		if ($param->{type} eq 'journal_disks') {
		    next if $d->{osdid} >= 0;
		    next if !$d->{gpt};
		} elsif ($param->{type} eq 'unused') {
		    next if $d->{used};
		} else {
		    die "internal error"; # should not happen
		}
	    }

	    $d->{dev} = "/dev/$dev";
	    push @$res, $d;
	}

	return $res;
    }});

__PACKAGE__->register_method ({
    name => 'config',
    path => 'config',
    method => 'GET',
    permissions => {
	check => ['perm', '/', [ 'Sys.Audit', 'Datastore.Audit' ], any => 1],
    },
    description => "Get Ceph configuration.",
    parameters => {
	additionalProperties => 0,
	properties => {
	    node => get_standard_option('pve-node'),
	},
    },
    returns => { type => 'string' },
    code => sub {
	my ($param) = @_;

	PVE::CephTools::check_ceph_inited();

	my $path = PVE::CephTools::get_config('pve_ceph_cfgpath');
	return PVE::Tools::file_get_contents($path);

    }});

my $add_storage = sub {
    my ($pool, $storeid, $krbd) = @_;

    my $storage_params = {
	type => 'rbd',
	pool => $pool,
	storage => $storeid,
	krbd => $krbd // 0,
	content => $krbd ? 'rootdir' : 'images',
    };

    PVE::API2::Storage::Config->create($storage_params);
};

my $get_storages = sub {
    my ($pool) = @_;

    my $cfg = PVE::Storage::config();

    my $storages = $cfg->{ids};
    my $res = {};
    foreach my $storeid (keys %$storages) {
	my $curr = $storages->{$storeid};
	$res->{$storeid} = $storages->{$storeid}
	    if $curr->{type} eq 'rbd' && $pool eq $curr->{pool};
    }

    return $res;
};

__PACKAGE__->register_method ({
    name => 'listmon',
    path => 'mon',
    method => 'GET',
    description => "Get Ceph monitor list.",
    proxyto => 'node',
    protected => 1,
    permissions => {
	check => ['perm', '/', [ 'Sys.Audit', 'Datastore.Audit' ], any => 1],
    },
    parameters => {
	additionalProperties => 0,
	properties => {
	    node => get_standard_option('pve-node'),
	},
    },
    returns => {
	type => 'array',
	items => {
	    type => "object",
	    properties => {
		name => { type => 'string' },
		addr => { type => 'string' },
	    },
	},
	links => [ { rel => 'child', href => "{name}" } ],
    },
    code => sub {
	my ($param) = @_;

	PVE::CephTools::check_ceph_inited();

	my $res = [];

	my $cfg = PVE::CephTools::parse_ceph_config();

	my $monhash = {};
	foreach my $section (keys %$cfg) {
	    my $d = $cfg->{$section};
	    if ($section =~ m/^mon\.(\S+)$/) {
		my $monid = $1;
		if ($d->{'mon addr'} && $d->{'host'}) {
		    $monhash->{$monid} = {
			addr => $d->{'mon addr'},
			host => $d->{'host'},
			name => $monid,
		    }
		}
	    }
	}

	eval {
	    my $rados = PVE::RADOS->new();
	    my $monstat = $rados->mon_command({ prefix => 'mon_status' });
	    my $mons = $monstat->{monmap}->{mons};
	    foreach my $d (@$mons) {
		next if !defined($d->{name});
		$monhash->{$d->{name}}->{rank} = $d->{rank};
		$monhash->{$d->{name}}->{addr} = $d->{addr};
		if (grep { $_ eq $d->{rank} } @{$monstat->{quorum}}) {
		    $monhash->{$d->{name}}->{quorum} = 1;
		}
	    }
	};
	warn $@ if $@;

	return PVE::RESTHandler::hash_to_array($monhash, 'name');
    }});

__PACKAGE__->register_method ({
    name => 'init',
    path => 'init',
    method => 'POST',
    description => "Create initial ceph default configuration and setup symlinks.",
    proxyto => 'node',
    protected => 1,
    permissions => {
	check => ['perm', '/', [ 'Sys.Modify' ]],
    },
    parameters => {
	additionalProperties => 0,
	properties => {
	    node => get_standard_option('pve-node'),
	    network => {
		description => "Use specific network for all ceph related traffic",
		type => 'string', format => 'CIDR',
		optional => 1,
		maxLength => 128,
	    },
	    size => {
		description => 'Targeted number of replicas per object',
		type => 'integer',
		default => 3,
		optional => 1,
		minimum => 1,
		maximum => 7,
	    },
	    min_size => {
		description => 'Minimum number of available replicas per object to allow I/O',
		type => 'integer',
		default => 2,
		optional => 1,
		minimum => 1,
		maximum => 7,
	    },
	    pg_bits => {
		description => "Placement group bits, used to specify the " .
		    "default number of placement groups.\n\nNOTE: 'osd pool " .
		    "default pg num' does not work for default pools.",
		type => 'integer',
		default => 6,
		optional => 1,
		minimum => 6,
		maximum => 14,
	    },
	    disable_cephx => {
		description => "Disable cephx authentification.\n\n" .
		    "WARNING: cephx is a security feature protecting against " .
		    "man-in-the-middle attacks. Only consider disabling cephx ".
		    "if your network is private!",
		type => 'boolean',
		optional => 1,
		default => 0,
	    },
	},
    },
    returns => { type => 'null' },
    code => sub {
	my ($param) = @_;

	my $version = PVE::CephTools::get_local_version(1);

	if (!$version || $version < 12) {
	    die "Ceph Luminous required - please run 'pveceph install'\n";
	} else {
	    PVE::CephTools::check_ceph_installed('ceph_bin');
	}

	# simply load old config if it already exists
	my $cfg = PVE::CephTools::parse_ceph_config();

	if (!$cfg->{global}) {

	    my $fsid;
	    my $uuid;

	    UUID::generate($uuid);
	    UUID::unparse($uuid, $fsid);

	    my $auth = $param->{disable_cephx} ? 'none' : 'cephx';

	    $cfg->{global} = {
		'fsid' => $fsid,
		'auth cluster required' => $auth,
		'auth service required' => $auth,
		'auth client required' => $auth,
		'osd journal size' => $pve_osd_default_journal_size,
		'osd pool default size' => $param->{size} // 3,
		'osd pool default min size' => $param->{min_size} // 2,
		'mon allow pool delete' => 'true',
	    };

	    # this does not work for default pools
	    #'osd pool default pg num' => $pg_num,
	    #'osd pool default pgp num' => $pg_num,
	}

	$cfg->{global}->{keyring} = '/etc/pve/priv/$cluster.$name.keyring';
	$cfg->{osd}->{keyring} = '/var/lib/ceph/osd/ceph-$id/keyring';

	if ($param->{pg_bits}) {
	    $cfg->{global}->{'osd pg bits'} = $param->{pg_bits};
	    $cfg->{global}->{'osd pgp bits'} = $param->{pg_bits};
	}

	if ($param->{network}) {
	    $cfg->{global}->{'public network'} = $param->{network};
	    $cfg->{global}->{'cluster network'} = $param->{network};
	}

	PVE::CephTools::write_ceph_config($cfg);

	PVE::CephTools::setup_pve_symlinks();

	return undef;
    }});

my $find_mon_ip = sub {
    my ($pubnet, $node, $overwrite_ip) = @_;

    if (!$pubnet) {
	return $overwrite_ip // PVE::Cluster::remote_node_ip($node);
    }

    my $allowed_ips = PVE::Network::get_local_ip_from_cidr($pubnet);
    die "No IP configured and up from ceph public network '$pubnet'\n"
	if scalar(@$allowed_ips) < 1;

    if (!$overwrite_ip) {
	if (scalar(@$allowed_ips) == 1) {
	    return $allowed_ips->[0];
	}
	die "Multiple IPs for ceph public network '$pubnet' detected on $node:\n".
	    join("\n", @$allowed_ips) ."\nuse 'mon-address' to specify one of them.\n";
    } else {
	if (grep { $_ eq $overwrite_ip } @$allowed_ips) {
	    return $overwrite_ip;
	}
	die "Monitor IP '$overwrite_ip' not in ceph public network '$pubnet'\n"
	    if !PVE::Network::is_ip_in_cidr($overwrite_ip, $pubnet);

	die "Specified monitor IP '$overwrite_ip' not configured or up on $node!\n";
    }
};

my $create_mgr = sub {
    my ($rados, $id) = @_;

    my $clustername = PVE::CephTools::get_config('ccname');
    my $mgrdir = "/var/lib/ceph/mgr/$clustername-$id";
    my $mgrkeyring = "$mgrdir/keyring";
    my $mgrname = "mgr.$id";

    die "ceph manager directory '$mgrdir' already exists\n"
	if -d $mgrdir;

    print "creating manager directory '$mgrdir'\n";
    mkdir $mgrdir;
    print "creating keys for '$mgrname'\n";
    my $output = $rados->mon_command({ prefix => 'auth get-or-create',
				       entity => $mgrname,
				       caps => [
					   mon => 'allow profile mgr',
					   osd => 'allow *',
					   mds => 'allow *',
				       ],
				       format => 'plain'});
    PVE::Tools::file_set_contents($mgrkeyring, $output);

    print "setting owner for directory\n";
    run_command(["chown", 'ceph:ceph', '-R', $mgrdir]);

    print "enabling service 'ceph-mgr\@$id.service'\n";
    PVE::CephTools::ceph_service_cmd('enable', $mgrname);
    print "starting service 'ceph-mgr\@$id.service'\n";
    PVE::CephTools::ceph_service_cmd('start', $mgrname);
};

my $destroy_mgr = sub {
    my ($mgrid) = @_;

    my $clustername = PVE::CephTools::get_config('ccname');
    my $mgrname = "mgr.$mgrid";
    my $mgrdir = "/var/lib/ceph/mgr/$clustername-$mgrid";

    die "ceph manager directory '$mgrdir' not found\n"
	if ! -d $mgrdir;

    print "disabling service 'ceph-mgr\@$mgrid.service'\n";
    PVE::CephTools::ceph_service_cmd('disable', $mgrname);
    print "stopping service 'ceph-mgr\@$mgrid.service'\n";
    PVE::CephTools::ceph_service_cmd('stop', $mgrname);

    print "removing manager directory '$mgrdir'\n";
    File::Path::remove_tree($mgrdir);
};

__PACKAGE__->register_method ({
    name => 'createmon',
    path => 'mon',
    method => 'POST',
    description => "Create Ceph Monitor and Manager",
    proxyto => 'node',
    protected => 1,
    permissions => {
	check => ['perm', '/', [ 'Sys.Modify' ]],
    },
    parameters => {
	additionalProperties => 0,
	properties => {
	    node => get_standard_option('pve-node'),
	    id => {
		type => 'string',
		optional => 1,
		pattern => '[a-zA-Z0-9]([a-zA-Z0-9\-]*[a-zA-Z0-9])?',
		description => "The ID for the monitor, when omitted the same as the nodename",
	    },
	    'exclude-manager' => {
		type => 'boolean',
		optional => 1,
		default => 0,
		description => "When set, only a monitor will be created.",
	    },
	    'mon-address' => {
		description => 'Overwrites autodetected monitor IP address. ' .
		               'Must be in the public network of ceph.',
		type => 'string', format => 'ip',
		optional => 1,
	    },
	},
    },
    returns => { type => 'string' },
    code => sub {
	my ($param) = @_;

	PVE::CephTools::check_ceph_installed('ceph_mon');

	PVE::CephTools::check_ceph_installed('ceph_mgr')
	    if (!$param->{'exclude-manager'});

	PVE::CephTools::check_ceph_inited();

	PVE::CephTools::setup_pve_symlinks();

	my $rpcenv = PVE::RPCEnvironment::get();

	my $authuser = $rpcenv->get_user();

	my $cfg = PVE::CephTools::parse_ceph_config();

	my $moncount = 0;

	my $monaddrhash = {};

	my $systemd_managed = PVE::CephTools::systemd_managed();

	foreach my $section (keys %$cfg) {
	    next if $section eq 'global';
	    my $d = $cfg->{$section};
	    if ($section =~ m/^mon\./) {
		$moncount++;
		if ($d->{'mon addr'}) {
		    $monaddrhash->{$d->{'mon addr'}} = $section;
		}
	    }
	}

	my $monid = $param->{id} // $param->{node};

	my $monsection = "mon.$monid";
	my $pubnet = $cfg->{global}->{'public network'};
	my $ip = $find_mon_ip->($pubnet, $param->{node}, $param->{'mon-address'});

	my $monaddr = Net::IP::ip_is_ipv6($ip) ? "[$ip]:6789" : "$ip:6789";
	my $monname = $param->{node};

	die "monitor '$monsection' already exists\n" if $cfg->{$monsection};
	die "monitor address '$monaddr' already in use by '$monaddrhash->{$monaddr}'\n"
	    if $monaddrhash->{$monaddr};

	my $worker = sub  {
	    my $upid = shift;

	    my $pve_ckeyring_path = PVE::CephTools::get_config('pve_ckeyring_path');

	    if (! -f $pve_ckeyring_path) {
		run_command("ceph-authtool $pve_ckeyring_path --create-keyring " .
			    "--gen-key -n client.admin");
	    }

	    my $pve_mon_key_path = PVE::CephTools::get_config('pve_mon_key_path');
	    if (! -f $pve_mon_key_path) {
		run_command("cp $pve_ckeyring_path $pve_mon_key_path.tmp");
		run_command("ceph-authtool $pve_mon_key_path.tmp -n client.admin --set-uid=0 " .
			    "--cap mds 'allow' " .
			    "--cap osd 'allow *' " .
			    "--cap mgr 'allow *' " .
			    "--cap mon 'allow *'");
		run_command("cp $pve_mon_key_path.tmp /etc/ceph/ceph.client.admin.keyring") if $systemd_managed;
		run_command("chown ceph:ceph /etc/ceph/ceph.client.admin.keyring") if $systemd_managed;
		run_command("ceph-authtool $pve_mon_key_path.tmp --gen-key -n mon. --cap mon 'allow *'");
		run_command("mv $pve_mon_key_path.tmp $pve_mon_key_path");
	    }

	    my $ccname = PVE::CephTools::get_config('ccname');

	    my $mondir =  "/var/lib/ceph/mon/$ccname-$monid";
	    -d $mondir && die "monitor filesystem '$mondir' already exist\n";

	    my $monmap = "/tmp/monmap";

	    eval {
		mkdir $mondir;

		run_command("chown ceph:ceph $mondir") if $systemd_managed;

		if ($moncount > 0) {
		    my $rados = PVE::RADOS->new(timeout => PVE::CephTools::get_config('long_rados_timeout'));
		    my $mapdata = $rados->mon_command({ prefix => 'mon getmap', format => 'plain' });
		    PVE::Tools::file_set_contents($monmap, $mapdata);
		} else {
		    run_command("monmaptool --create --clobber --add $monid $monaddr --print $monmap");
		}

		run_command("ceph-mon --mkfs -i $monid --monmap $monmap --keyring $pve_mon_key_path");
		run_command("chown ceph:ceph -R $mondir") if $systemd_managed;
	    };
	    my $err = $@;
	    unlink $monmap;
	    if ($err) {
		File::Path::remove_tree($mondir);
		die $err;
	    }

	    $cfg->{$monsection} = {
		'host' => $monname,
		'mon addr' => $monaddr,
	    };

	    PVE::CephTools::write_ceph_config($cfg);

	    my $create_keys_pid = fork();
	    if (!defined($create_keys_pid)) {
		die "Could not spawn ceph-create-keys to create bootstrap keys\n";
	    } elsif ($create_keys_pid == 0) {
		exit PVE::Tools::run_command(['ceph-create-keys', '-i', $monid]);
	    } else {
		PVE::CephTools::ceph_service_cmd('start', $monsection);

		if ($systemd_managed) {
		    #to ensure we have the correct startup order.
		    eval { PVE::Tools::run_command(['/bin/systemctl', 'enable', "ceph-mon\@${monid}.service"]); };
		    warn "Enable ceph-mon\@${monid}.service manually"if $@;
		}
		waitpid($create_keys_pid, 0);
	    }

	    # create manager
	    if (!$param->{'exclude-manager'}) {
		my $rados = PVE::RADOS->new(timeout => PVE::CephTools::get_config('long_rados_timeout'));
		$create_mgr->($rados, $monid);
	    }
	};

	return $rpcenv->fork_worker('cephcreatemon', $monsection, $authuser, $worker);
    }});

__PACKAGE__->register_method ({
    name => 'destroymon',
    path => 'mon/{monid}',
    method => 'DELETE',
    description => "Destroy Ceph Monitor and Manager.",
    proxyto => 'node',
    protected => 1,
    permissions => {
	check => ['perm', '/', [ 'Sys.Modify' ]],
    },
    parameters => {
	additionalProperties => 0,
	properties => {
	    node => get_standard_option('pve-node'),
	    monid => {
		description => 'Monitor ID',
		type => 'string',
		pattern => '[a-zA-Z0-9]([a-zA-Z0-9\-]*[a-zA-Z0-9])?',
	    },
	    'exclude-manager' => {
		type => 'boolean',
		default => 0,
		optional => 1,
		description => "When set, removes only the monitor, not the manager"
	    }
	},
    },
    returns => { type => 'string' },
    code => sub {
	my ($param) = @_;

	my $rpcenv = PVE::RPCEnvironment::get();

	my $authuser = $rpcenv->get_user();

	PVE::CephTools::check_ceph_inited();

	my $cfg = PVE::CephTools::parse_ceph_config();

	my $monid = $param->{monid};
	my $monsection = "mon.$monid";

	my $rados = PVE::RADOS->new();
	my $monstat = $rados->mon_command({ prefix => 'mon_status' });
	my $monlist = $monstat->{monmap}->{mons};

	die "no such monitor id '$monid'\n"
	    if !defined($cfg->{$monsection});

	my $ccname = PVE::CephTools::get_config('ccname');

	my $mondir =  "/var/lib/ceph/mon/$ccname-$monid";
	-d $mondir || die "monitor filesystem '$mondir' does not exist on this node\n";

	die "can't remove last monitor\n" if scalar(@$monlist) <= 1;

	my $worker = sub {
	    my $upid = shift;

	    # reopen with longer timeout
	    $rados = PVE::RADOS->new(timeout => PVE::CephTools::get_config('long_rados_timeout'));

	    $rados->mon_command({ prefix => "mon remove", name => $monid, format => 'plain' });

	    eval { PVE::CephTools::ceph_service_cmd('stop', $monsection); };
	    warn $@ if $@;

	    delete $cfg->{$monsection};
	    PVE::CephTools::write_ceph_config($cfg);
	    File::Path::remove_tree($mondir);

	    # remove manager
	    if (!$param->{'exclude-manager'}) {
		eval { $destroy_mgr->($monid); };
		warn $@ if $@;
	    }
	};

	return $rpcenv->fork_worker('cephdestroymon', $monsection,  $authuser, $worker);
    }});

__PACKAGE__->register_method ({
    name => 'createmgr',
    path => 'mgr',
    method => 'POST',
    description => "Create Ceph Manager",
    proxyto => 'node',
    protected => 1,
    permissions => {
	check => ['perm', '/', [ 'Sys.Modify' ]],
    },
    parameters => {
	additionalProperties => 0,
	properties => {
	    node => get_standard_option('pve-node'),
	    id => {
		type => 'string',
		optional => 1,
		pattern => '[a-zA-Z0-9]([a-zA-Z0-9\-]*[a-zA-Z0-9])?',
		description => "The ID for the manager, when omitted the same as the nodename",
	    },
	},
    },
    returns => { type => 'string' },
    code => sub {
	my ($param) = @_;

	PVE::CephTools::check_ceph_installed('ceph_mgr');

	PVE::CephTools::check_ceph_inited();

	my $rpcenv = PVE::RPCEnvironment::get();

	my $authuser = $rpcenv->get_user();

	my $mgrid = $param->{id} // $param->{node};

	my $worker = sub  {
	    my $upid = shift;

	    my $rados = PVE::RADOS->new(timeout => PVE::CephTools::get_config('long_rados_timeout'));

	    $create_mgr->($rados, $mgrid);
	};

	return $rpcenv->fork_worker('cephcreatemgr', "mgr.$mgrid", $authuser, $worker);
    }});

__PACKAGE__->register_method ({
    name => 'destroymgr',
    path => 'mgr/{id}',
    method => 'DELETE',
    description => "Destroy Ceph Manager.",
    proxyto => 'node',
    protected => 1,
    permissions => {
	check => ['perm', '/', [ 'Sys.Modify' ]],
    },
    parameters => {
	additionalProperties => 0,
	properties => {
	    node => get_standard_option('pve-node'),
	    id => {
		description => 'The ID of the manager',
		type => 'string',
		pattern => '[a-zA-Z0-9]([a-zA-Z0-9\-]*[a-zA-Z0-9])?',
	    },
	},
    },
    returns => { type => 'string' },
    code => sub {
	my ($param) = @_;

	my $rpcenv = PVE::RPCEnvironment::get();

	my $authuser = $rpcenv->get_user();

	PVE::CephTools::check_ceph_inited();

	my $mgrid = $param->{id};

	my $worker = sub {
	    my $upid = shift;

	    $destroy_mgr->($mgrid);
	};

	return $rpcenv->fork_worker('cephdestroymgr', "mgr.$mgrid",  $authuser, $worker);
    }});

__PACKAGE__->register_method ({
    name => 'stop',
    path => 'stop',
    method => 'POST',
    description => "Stop ceph services.",
    proxyto => 'node',
    protected => 1,
    permissions => {
	check => ['perm', '/', [ 'Sys.Modify' ]],
    },
    parameters => {
	additionalProperties => 0,
	properties => {
	    node => get_standard_option('pve-node'),
	    service => {
		description => 'Ceph service name.',
		type => 'string',
		optional => 1,
		pattern => '(mon|mds|osd|mgr)\.[A-Za-z0-9\-]{1,32}',
	    },
	},
    },
    returns => { type => 'string' },
    code => sub {
	my ($param) = @_;

	my $rpcenv = PVE::RPCEnvironment::get();

	my $authuser = $rpcenv->get_user();

	PVE::CephTools::check_ceph_inited();

	my $cfg = PVE::CephTools::parse_ceph_config();
	scalar(keys %$cfg) || die "no configuration\n";

	my $worker = sub {
	    my $upid = shift;

	    my $cmd = ['stop'];
	    if ($param->{service}) {
		push @$cmd, $param->{service};
	    }

	    PVE::CephTools::ceph_service_cmd(@$cmd);
	};

	return $rpcenv->fork_worker('srvstop', $param->{service} || 'ceph',
				    $authuser, $worker);
    }});

__PACKAGE__->register_method ({
    name => 'start',
    path => 'start',
    method => 'POST',
    description => "Start ceph services.",
    proxyto => 'node',
    protected => 1,
    permissions => {
	check => ['perm', '/', [ 'Sys.Modify' ]],
    },
    parameters => {
	additionalProperties => 0,
	properties => {
	    node => get_standard_option('pve-node'),
	    service => {
		description => 'Ceph service name.',
		type => 'string',
		optional => 1,
		pattern => '(mon|mds|osd|mgr)\.[A-Za-z0-9\-]{1,32}',
	    },
	},
    },
    returns => { type => 'string' },
    code => sub {
	my ($param) = @_;

	my $rpcenv = PVE::RPCEnvironment::get();

	my $authuser = $rpcenv->get_user();

	PVE::CephTools::check_ceph_inited();

	my $cfg = PVE::CephTools::parse_ceph_config();
	scalar(keys %$cfg) || die "no configuration\n";

	my $worker = sub {
	    my $upid = shift;

	    my $cmd = ['start'];
	    if ($param->{service}) {
		push @$cmd, $param->{service};
	    }

	    PVE::CephTools::ceph_service_cmd(@$cmd);
	};

	return $rpcenv->fork_worker('srvstart', $param->{service} || 'ceph',
				    $authuser, $worker);
    }});

__PACKAGE__->register_method ({
    name => 'status',
    path => 'status',
    method => 'GET',
    description => "Get ceph status.",
    proxyto => 'node',
    protected => 1,
    permissions => {
	check => ['perm', '/', [ 'Sys.Audit', 'Datastore.Audit' ], any => 1],
    },
    parameters => {
	additionalProperties => 0,
	properties => {
	    node => get_standard_option('pve-node'),
	},
    },
    returns => { type => 'object' },
    code => sub {
	my ($param) = @_;

	PVE::CephTools::check_ceph_enabled();

	my $rados = PVE::RADOS->new();
	my $status = $rados->mon_command({ prefix => 'status' });
	$status->{health} = $rados->mon_command({ prefix => 'health', detail => 'detail' });
	return $status;
    }});

__PACKAGE__->register_method ({
    name => 'lspools',
    path => 'pools',
    method => 'GET',
    description => "List all pools.",
    proxyto => 'node',
    protected => 1,
    permissions => {
	check => ['perm', '/', [ 'Sys.Audit', 'Datastore.Audit' ], any => 1],
    },
    parameters => {
	additionalProperties => 0,
	properties => {
	    node => get_standard_option('pve-node'),
	},
    },
    returns => {
	type => 'array',
	items => {
	    type => "object",
	    properties => {
		pool => { type => 'integer' },
		pool_name => { type => 'string' },
		size => { type => 'integer' },
	    },
	},
	links => [ { rel => 'child', href => "{pool_name}" } ],
    },
    code => sub {
	my ($param) = @_;

	PVE::CephTools::check_ceph_inited();

	my $rados = PVE::RADOS->new();

	my $stats = {};
	my $res = $rados->mon_command({ prefix => 'df' });

	foreach my $d (@{$res->{pools}}) {
	    next if !$d->{stats};
	    next if !defined($d->{id});
	    $stats->{$d->{id}} = $d->{stats};
	}

	$res = $rados->mon_command({ prefix => 'osd dump' });
	my $rulestmp = $rados->mon_command({ prefix => 'osd crush rule dump'});

	my $rules = {};
	for my $rule (@$rulestmp) {
	    $rules->{$rule->{rule_id}} = $rule->{rule_name};
	}

	my $data = [];
	foreach my $e (@{$res->{pools}}) {
	    my $d = {};
	    foreach my $attr (qw(pool pool_name size min_size pg_num crush_rule)) {
		$d->{$attr} = $e->{$attr} if defined($e->{$attr});
	    }

	    if (defined($d->{crush_rule}) && defined($rules->{$d->{crush_rule}})) {
		$d->{crush_rule_name} = $rules->{$d->{crush_rule}};
	    }

	    if (my $s = $stats->{$d->{pool}}) {
		$d->{bytes_used} = $s->{bytes_used};
		$d->{percent_used} = $s->{percent_used};
	    }
	    push @$data, $d;
	}


	return $data;
    }});

__PACKAGE__->register_method ({
    name => 'createpool',
    path => 'pools',
    method => 'POST',
    description => "Create POOL",
    proxyto => 'node',
    protected => 1,
    permissions => {
	check => ['perm', '/', [ 'Sys.Modify' ]],
    },
    parameters => {
	additionalProperties => 0,
	properties => {
	    node => get_standard_option('pve-node'),
	    name => {
		description => "The name of the pool. It must be unique.",
		type => 'string',
	    },
	    size => {
		description => 'Number of replicas per object',
		type => 'integer',
		default => 3,
		optional => 1,
		minimum => 1,
		maximum => 7,
	    },
	    min_size => {
		description => 'Minimum number of replicas per object',
		type => 'integer',
		default => 2,
		optional => 1,
		minimum => 1,
		maximum => 7,
	    },
	    pg_num => {
		description => "Number of placement groups.",
		type => 'integer',
		default => 64,
		optional => 1,
		minimum => 8,
		maximum => 32768,
	    },
	    crush_rule => {
		description => "The rule to use for mapping object placement in the cluster.",
		type => 'string',
		optional => 1,
	    },
	    application => {
		description => "The application of the pool, 'rbd' by default.",
		type => 'string',
		enum => ['rbd', 'cephfs', 'rgw'],
		optional => 1,
	    },
	    add_storages => {
		description => "Configure VM and CT storages using the new pool.",
		type => 'boolean',
		optional => 1,
	    },
	},
    },
    returns => { type => 'string' },
    code => sub {
	my ($param) = @_;

	PVE::Cluster::check_cfs_quorum();
	PVE::CephTools::check_ceph_inited();

	my $pve_ckeyring_path = PVE::CephTools::get_config('pve_ckeyring_path');

	die "not fully configured - missing '$pve_ckeyring_path'\n"
	    if ! -f $pve_ckeyring_path;

	my $pool = $param->{name};
	my $rpcenv = PVE::RPCEnvironment::get();
	my $user = $rpcenv->get_user();

	if ($param->{add_storages}) {
	    $rpcenv->check($user, '/storage', ['Datastore.Allocate']);
	    die "pool name contains characters which are illegal for storage naming\n"
		if !PVE::JSONSchema::parse_storage_id($pool);
	}

	my $pg_num = $param->{pg_num} || 64;
	my $size = $param->{size} || 3;
	my $min_size = $param->{min_size} || 2;
	my $application = $param->{application} // 'rbd';

	my $worker = sub {

	    my $rados = PVE::RADOS->new();
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

	    if ($param->{add_storages}) {
		my $err;
		eval { $add_storage->($pool, "${pool}_vm", 0); };
		if ($@) {
		    warn "failed to add VM storage: $@";
		    $err = 1;
		}
		eval { $add_storage->($pool, "${pool}_ct", 1); };
		if ($@) {
		    warn "failed to add CT storage: $@";
		    $err = 1;
		}
		die "adding storages for pool '$pool' failed, check log and add manually!\n"
		    if $err;
	    }
	};

	return $rpcenv->fork_worker('cephcreatepool', $pool,  $user, $worker);
    }});

__PACKAGE__->register_method ({
    name => 'get_flags',
    path => 'flags',
    method => 'GET',
    description => "get all set ceph flags",
    proxyto => 'node',
    protected => 1,
    permissions => {
	check => ['perm', '/', [ 'Sys.Audit' ]],
    },
    parameters => {
	additionalProperties => 0,
	properties => {
	    node => get_standard_option('pve-node'),
	},
    },
    returns => { type => 'string' },
    code => sub {
	my ($param) = @_;

	PVE::CephTools::check_ceph_inited();

	my $pve_ckeyring_path = PVE::CephTools::get_config('pve_ckeyring_path');

	die "not fully configured - missing '$pve_ckeyring_path'\n"
	    if ! -f $pve_ckeyring_path;

	my $rados = PVE::RADOS->new();

	my $stat = $rados->mon_command({ prefix => 'osd dump' });

	return $stat->{flags} // '';
    }});

__PACKAGE__->register_method ({
    name => 'set_flag',
    path => 'flags/{flag}',
    method => 'POST',
    description => "Set a ceph flag",
    proxyto => 'node',
    protected => 1,
    permissions => {
	check => ['perm', '/', [ 'Sys.Modify' ]],
    },
    parameters => {
	additionalProperties => 0,
	properties => {
	    node => get_standard_option('pve-node'),
	    flag => {
		description => 'The ceph flag to set/unset',
		type => 'string',
		enum => [ 'full', 'pause', 'noup', 'nodown', 'noout', 'noin', 'nobackfill', 'norebalance', 'norecover', 'noscrub', 'nodeep-scrub', 'notieragent'],
	    },
	},
    },
    returns => { type => 'null' },
    code => sub {
	my ($param) = @_;

	PVE::CephTools::check_ceph_inited();

	my $pve_ckeyring_path = PVE::CephTools::get_config('pve_ckeyring_path');

	die "not fully configured - missing '$pve_ckeyring_path'\n"
	    if ! -f $pve_ckeyring_path;

	my $set = $param->{set} // !$param->{unset};
	my $rados = PVE::RADOS->new();

	$rados->mon_command({
	    prefix => "osd set",
	    key => $param->{flag},
	});

	return undef;
    }});

__PACKAGE__->register_method ({
    name => 'unset_flag',
    path => 'flags/{flag}',
    method => 'DELETE',
    description => "Unset a ceph flag",
    proxyto => 'node',
    protected => 1,
    permissions => {
	check => ['perm', '/', [ 'Sys.Modify' ]],
    },
    parameters => {
	additionalProperties => 0,
	properties => {
	    node => get_standard_option('pve-node'),
	    flag => {
		description => 'The ceph flag to set/unset',
		type => 'string',
		enum => [ 'full', 'pause', 'noup', 'nodown', 'noout', 'noin', 'nobackfill', 'norebalance', 'norecover', 'noscrub', 'nodeep-scrub', 'notieragent'],
	    },
	},
    },
    returns => { type => 'null' },
    code => sub {
	my ($param) = @_;

	PVE::CephTools::check_ceph_inited();

	my $pve_ckeyring_path = PVE::CephTools::get_config('pve_ckeyring_path');

	die "not fully configured - missing '$pve_ckeyring_path'\n"
	    if ! -f $pve_ckeyring_path;

	my $set = $param->{set} // !$param->{unset};
	my $rados = PVE::RADOS->new();

	$rados->mon_command({
	    prefix => "osd unset",
	    key => $param->{flag},
	});

	return undef;
    }});

__PACKAGE__->register_method ({
    name => 'destroypool',
    path => 'pools/{name}',
    method => 'DELETE',
    description => "Destroy pool",
    proxyto => 'node',
    protected => 1,
    permissions => {
	check => ['perm', '/', [ 'Sys.Modify' ]],
    },
    parameters => {
	additionalProperties => 0,
	properties => {
	    node => get_standard_option('pve-node'),
	    name => {
		description => "The name of the pool. It must be unique.",
		type => 'string',
	    },
	    force => {
		description => "If true, destroys pool even if in use",
		type => 'boolean',
		optional => 1,
		default => 0,
	    },
	    remove_storages => {
		description => "Remove all pveceph-managed storages configured for this pool",
		type => 'boolean',
		optional => 1,
		default => 0,
	    },
	},
    },
    returns => { type => 'string' },
    code => sub {
	my ($param) = @_;

	PVE::CephTools::check_ceph_inited();

	my $rpcenv = PVE::RPCEnvironment::get();
	my $user = $rpcenv->get_user();
	$rpcenv->check($user, '/storage', ['Datastore.Allocate'])
	    if $param->{remove_storages};

	my $pool = $param->{name};

	my $worker = sub {
	    my $storages = $get_storages->($pool);

	    # if not forced, destroy ceph pool only when no
	    # vm disks are on it anymore
	    if (!$param->{force}) {
		my $storagecfg = PVE::Storage::config();
		foreach my $storeid (keys %$storages) {
		    my $storage = $storages->{$storeid};

		    # check if any vm disks are on the pool
		    print "checking storage '$storeid' for RBD images..\n";
		    my $res = PVE::Storage::vdisk_list($storagecfg, $storeid);
		    die "ceph pool '$pool' still in use by storage '$storeid'\n"
			if @{$res->{$storeid}} != 0;
		}
	    }

	    my $rados = PVE::RADOS->new();
	    # fixme: '--yes-i-really-really-mean-it'
	    $rados->mon_command({
		prefix => "osd pool delete",
		pool => $pool,
		pool2 => $pool,
		sure => '--yes-i-really-really-mean-it',
		format => 'plain',
	    });

	    if ($param->{remove_storages}) {
		my $err;
		foreach my $storeid (keys %$storages) {
		    # skip external clusters, not managed by pveceph
		    next if $storages->{$storeid}->{monhost};
		    eval { PVE::API2::Storage::Config->delete({storage => $storeid}) };
		    if ($@) {
			warn "failed to remove storage '$storeid': $@\n";
			$err = 1;
		    }
		}
		die "failed to remove (some) storages - check log and remove manually!\n"
		    if $err;
	    }
	};
	return $rpcenv->fork_worker('cephdestroypool', $pool,  $user, $worker);
    }});


__PACKAGE__->register_method ({
    name => 'crush',
    path => 'crush',
    method => 'GET',
    description => "Get OSD crush map",
    proxyto => 'node',
    protected => 1,
    permissions => {
	check => ['perm', '/', [ 'Sys.Audit', 'Datastore.Audit' ], any => 1],
    },
    parameters => {
	additionalProperties => 0,
	properties => {
	    node => get_standard_option('pve-node'),
	},
    },
    returns => { type => 'string' },
    code => sub {
	my ($param) = @_;

	PVE::CephTools::check_ceph_inited();

	# this produces JSON (difficult to read for the user)
	# my $txt = &$run_ceph_cmd_text(['osd', 'crush', 'dump'], quiet => 1);

	my $txt = '';

	my $mapfile = "/var/tmp/ceph-crush.map.$$";
	my $mapdata = "/var/tmp/ceph-crush.txt.$$";

	my $rados = PVE::RADOS->new();

	eval {
	    my $bindata = $rados->mon_command({ prefix => 'osd getcrushmap', format => 'plain' });
	    PVE::Tools::file_set_contents($mapfile, $bindata);
	    run_command(['crushtool', '-d', $mapfile, '-o', $mapdata]);
	    $txt = PVE::Tools::file_get_contents($mapdata);
	};
	my $err = $@;

	unlink $mapfile;
	unlink $mapdata;

	die $err if $err;

	return $txt;
    }});

__PACKAGE__->register_method({
    name => 'log',
    path => 'log',
    method => 'GET',
    description => "Read ceph log",
    proxyto => 'node',
    permissions => {
	check => ['perm', '/nodes/{node}', [ 'Sys.Syslog' ]],
    },
    protected => 1,
    parameters => {
	additionalProperties => 0,
	properties => {
	    node => get_standard_option('pve-node'),
	    start => {
		type => 'integer',
		minimum => 0,
		optional => 1,
	    },
	    limit => {
		type => 'integer',
		minimum => 0,
		optional => 1,
	    },
	},
    },
    returns => {
	type => 'array',
	items => {
	    type => "object",
	    properties => {
		n => {
		  description=>  "Line number",
		  type=> 'integer',
		},
		t => {
		  description=>  "Line text",
		  type => 'string',
		}
	    }
	}
    },
    code => sub {
	my ($param) = @_;

	my $rpcenv = PVE::RPCEnvironment::get();
	my $user = $rpcenv->get_user();
	my $node = $param->{node};

	my $logfile = "/var/log/ceph/ceph.log";
	my ($count, $lines) = PVE::Tools::dump_logfile($logfile, $param->{start}, $param->{limit});

	$rpcenv->set_result_attrib('total', $count);

	return $lines;
    }});

__PACKAGE__->register_method ({
    name => 'rules',
    path => 'rules',
    method => 'GET',
    description => "List ceph rules.",
    proxyto => 'node',
    protected => 1,
    permissions => {
	check => ['perm', '/', [ 'Sys.Audit', 'Datastore.Audit' ], any => 1],
    },
    parameters => {
	additionalProperties => 0,
	properties => {
	    node => get_standard_option('pve-node'),
	},
    },
    returns => {
	type => 'array',
	items => {
	    type => "object",
	    properties => {},
	},
	links => [ { rel => 'child', href => "{name}" } ],
    },
    code => sub {
	my ($param) = @_;

	PVE::CephTools::check_ceph_inited();

	my $rados = PVE::RADOS->new();

	my $rules = $rados->mon_command({ prefix => 'osd crush rule ls' });

	my $res = [];

	foreach my $rule (@$rules) {
	    push @$res, { name => $rule };
	}

	return $res;
    }});
