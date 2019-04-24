package PVE::API2::Ceph::OSD;

use strict;
use warnings;

use Cwd qw(abs_path);
use IO::File;

use PVE::Ceph::Tools;
use PVE::Ceph::Services;
use PVE::CephConfig;
use PVE::Cluster qw(cfs_read_file cfs_write_file);
use PVE::Diskmanage;
use PVE::Exception qw(raise_param_exc);
use PVE::JSONSchema qw(get_standard_option);
use PVE::RADOS;
use PVE::RESTHandler;
use PVE::RPCEnvironment;
use PVE::Tools qw(run_command file_set_contents);
use PVE::ProcFSTools;

use base qw(PVE::RESTHandler);

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

    return wantarray ? ($osdstat, $flags) : $osdstat;
};

my $get_osd_usage = sub {
    my ($rados) = @_;

    my $osdlist = $rados->mon_command({ prefix => 'pg dump', dumpcontents => [ 'osds' ]});
    if (!($osdlist && ref($osdlist))) {
	warn "got unknown result format for 'pg dump osds' command\n";
	return [];
    }

    if (ref($osdlist) eq "HASH") { # since nautilus
	$osdlist = $osdlist->{osd_stats};
    }

    my $osdstat = {};
    for my $d (@$osdlist) {
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

	PVE::Ceph::Tools::check_ceph_inited();

	my $rados = PVE::RADOS->new();
	my $res = $rados->mon_command({ prefix => 'osd tree' });

        die "no tree nodes found\n" if !($res && $res->{nodes});

	my ($osdhash, $flags) = &$get_osd_status($rados);

	my $osd_usage = $get_osd_usage->($rados);

	my $osdmetadata_res = $rados->mon_command({ prefix => 'osd metadata' });
	my $osdmetadata = { map { $_->{id} => $_ } @$osdmetadata_res };

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

	    if (my $stat = $osd_usage->{$e->{id}}) {
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
		enum => ['xfs', 'ext4'],
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

	PVE::Ceph::Tools::check_ceph_inited();

	PVE::Ceph::Tools::setup_pve_symlinks();

	PVE::Ceph::Tools::check_ceph_installed('ceph_osd');

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

	my $ceph_bootstrap_osd_keyring = PVE::Ceph::Tools::get_config('ceph_bootstrap_osd_keyring');

	if (! -f $ceph_bootstrap_osd_keyring) {
	    my $bindata = $rados->mon_command({ prefix => 'auth get', entity => 'client.bootstrap-osd', format => 'plain' });
	    file_set_contents($ceph_bootstrap_osd_keyring, $bindata);
	};

	my $worker = sub {
	    my $upid = shift;

	    my $fstype = $param->{fstype} || 'xfs';


	    my $ccname = PVE::Ceph::Tools::get_config('ccname');

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

	    PVE::Ceph::Tools::wipe_disks($devpath);

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

	PVE::Ceph::Tools::check_ceph_inited();

	my $osdid = $param->{osdid};

	my $rados = PVE::RADOS->new();
	# dies if osdid is unknown
	my $osdstat = &$get_osd_status($rados, $osdid);

	die "osd is in use (in == 1)\n" if $osdstat->{in};
	#&$run_ceph_cmd(['osd', 'out', $osdid]);

	die "osd is still running (up == 1)\n" if $osdstat->{up};

	my $osdsection = "osd.$osdid";

	my $worker = sub {
	    my $upid = shift;

	    # reopen with longer timeout
	    $rados = PVE::RADOS->new(timeout => PVE::Ceph::Tools::get_config('long_rados_timeout'));

	    print "destroy OSD $osdsection\n";

	    eval {
		PVE::Ceph::Services::ceph_service_cmd('stop', $osdsection);
		PVE::Ceph::Services::ceph_service_cmd('disable', $osdsection);
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

		PVE::Ceph::Tools::wipe_disks($part);
		print "remove partition $part (disk '${devpath}', partnum $partnum)\n";
		eval { run_command(['/sbin/sgdisk', '-d', $partnum, "${devpath}"]); };
		warn $@ if $@;
	    };

	    my $partitions_to_remove = [];

	    if ($param->{cleanup}) {
		if (my $mp = PVE::ProcFSTools::parse_proc_mounts()) {
		    foreach my $line (@$mp) {
			my ($dev, $path, $fstype) = @$line;
			next if !($dev && $path && $fstype);
			next if $dev !~ m|^/dev/|;

			if ($path eq $mountpoint) {
			    abs_path($dev) =~ m|^(/.+)| or die "invalid dev: $dev\n";
			    push @$partitions_to_remove, $1;
			    last;
			}
		    }
		}

		foreach my $path (qw(journal block block.db block.wal)) {
		    abs_path("$mountpoint/$path") =~ m|^(/.+)| or die "invalid path: $path\n";
		    push @$partitions_to_remove, $1;
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

	PVE::Ceph::Tools::check_ceph_inited();

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

	PVE::Ceph::Tools::check_ceph_inited();

	my $osdid = $param->{osdid};

	my $rados = PVE::RADOS->new();

	my $osdstat = &$get_osd_status($rados, $osdid); # osd exists?

	my $osdsection = "osd.$osdid";

	$rados->mon_command({ prefix => "osd out", ids => [ $osdsection ], format => 'plain' });

	return undef;
    }});

1;
