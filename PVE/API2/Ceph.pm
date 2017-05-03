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

	my $nodes = {};
	my $newnodes = {};
	foreach my $e (@{$res->{nodes}}) {
	    $nodes->{$e->{id}} = $e;
	    
	    my $new = { 
		id => $e->{id}, 
		name => $e->{name}, 
		type => $e->{type}
	    };

	    foreach my $opt (qw(status crush_weight reweight)) {
		$new->{$opt} = $e->{$opt} if defined($e->{$opt});
	    }

	    if (my $stat = $osdhash->{$e->{id}}) {
		$new->{in} = $stat->{in} if defined($stat->{in});
	    }

	    if (my $stat = $usagehash->{$e->{id}}) {
		$new->{total_space} = ($stat->{kb} || 1) * 1024;
		$new->{bytes_used} = ($stat->{kb_used} || 0) * 1024;
		$new->{percent_used} = ($new->{bytes_used}*100)/$new->{total_space};
		if (my $d = $stat->{fs_perf_stat}) {
		    $new->{commit_latency_ms} = $d->{commit_latency_ms};
		    $new->{apply_latency_ms} = $d->{apply_latency_ms};
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
		description => "Block device name for journal.",
		optional => 1,
		type => 'string',
	    },
	    fstype => {
		description => "File system type.",
		type => 'string',
		enum => ['xfs', 'ext4', 'btrfs'],
		default => 'xfs',
		optional => 1,
	    },
	},
    },
    returns => { type => 'string' },
    code => sub {
	my ($param) = @_;

	my $rpcenv = PVE::RPCEnvironment::get();

	my $authuser = $rpcenv->get_user();

	PVE::CephTools::check_ceph_inited();

	PVE::CephTools::setup_pve_symlinks();

	my $journal_dev;

	if ($param->{journal_dev} && ($param->{journal_dev} ne $param->{dev})) {
            $journal_dev = PVE::Diskmanage::verify_blockdev_path($param->{journal_dev});
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

	    print "create OSD on $devpath ($fstype)\n";

	    my $ccname = PVE::CephTools::get_config('ccname');

	    my $cmd = ['ceph-disk', 'prepare', '--zap-disk', '--fs-type', $fstype,
		       '--cluster', $ccname, '--cluster-uuid', $fsid ];

	    if ($journal_dev) {
		print "using device '$journal_dev' for journal\n";
		push @$cmd, '--journal-dev', $devpath, $journal_dev;
	    } else {
		push @$cmd, $devpath;
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

	    eval { PVE::CephTools::ceph_service_cmd('stop', $osdsection); };
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

	    my $journal_part;
	    my $data_part;
	    
	    if ($param->{cleanup}) {
		my $jpath = "$mountpoint/journal";
		$journal_part = abs_path($jpath);

		if (my $fd = IO::File->new("/proc/mounts", "r")) {
		    while (defined(my $line = <$fd>)) {
			my ($dev, $path, $fstype) = split(/\s+/, $line);
			next if !($dev && $path && $fstype);
			next if $dev !~ m|^/dev/|;
			if ($path eq $mountpoint) {
			    $data_part = abs_path($dev);
			    last;
			}
		    }
		    close($fd);
		}
	    }

	    print "Unmount OSD $osdsection from  $mountpoint\n";
	    eval { run_command(['/bin/umount', $mountpoint]); };
	    if (my $err = $@) {
		warn $err;
	    } elsif ($param->{cleanup}) {
		#be aware of the ceph udev rules which can remount.
		&$remove_partition($data_part);
		&$remove_partition($journal_part);
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
		description => 'Number of replicas per object',
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

	PVE::CephTools::check_ceph_installed();

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
		'osd pool default min size' => 1,
		'mon allow pool delete' => 'true',
	    };

	    # this does not work for default pools 
	    #'osd pool default pg num' => $pg_num,
	    #'osd pool default pgp num' => $pg_num, 
	}
	
	$cfg->{global}->{keyring} = '/etc/pve/priv/$cluster.$name.keyring';
	$cfg->{osd}->{keyring} = '/var/lib/ceph/osd/ceph-$id/keyring';

	$cfg->{global}->{'osd pool default size'} = $param->{size} if $param->{size};

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

my $find_node_ip = sub {
    my ($cidr) = @_;

    my $net = Net::IP->new($cidr) || die Net::IP::Error() . "\n";
    my $id = $net->version == 6 ? 'address6' : 'address';

    my $config = PVE::INotify::read_file('interfaces');
    my $ifaces = $config->{ifaces};

    foreach my $iface (keys %$ifaces) {
	my $d = $ifaces->{$iface};
	next if !$d->{$id};
	my $a = Net::IP->new($d->{$id});
	next if !$a;
	return $d->{$id} if $net->overlaps($a);
    }

    die "unable to find local address within network '$cidr'\n";
};

__PACKAGE__->register_method ({
    name => 'createmon',
    path => 'mon',
    method => 'POST',
    description => "Create Ceph Monitor",
    proxyto => 'node',
    protected => 1,
    permissions => {
	check => ['perm', '/', [ 'Sys.Modify' ]],
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

	my $monid;
	for (my $i = 0; $i < 7; $i++) {
	    if (!$cfg->{"mon.$i"}) {
		$monid = $i;
		last;
	    }
	}
	die "unable to find usable monitor id\n" if !defined($monid);

	my $monsection = "mon.$monid"; 
	my $ip;
	if (my $pubnet = $cfg->{global}->{'public network'}) {
	    $ip = &$find_node_ip($pubnet);
	} else {
	    $ip = PVE::Cluster::remote_node_ip($param->{node});
	}

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
	};

	return $rpcenv->fork_worker('cephcreatemon', $monsection, $authuser, $worker);
    }});

__PACKAGE__->register_method ({
    name => 'destroymon',
    path => 'mon/{monid}',
    method => 'DELETE',
    description => "Destroy Ceph monitor.",
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
		type => 'integer',
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
	};

	return $rpcenv->fork_worker('cephdestroymon', $monsection,  $authuser, $worker);
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
		pattern => '(mon|mds|osd)\.[A-Za-z0-9]{1,32}',
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
		pattern => '(mon|mds|osd)\.[A-Za-z0-9]{1,32}',
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
	return $rados->mon_command({ prefix => 'status' });
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
	my $total = $res->{stats}->{total_avail_bytes} || 0;

	foreach my $d (@{$res->{pools}}) {
	    next if !$d->{stats};
	    next if !defined($d->{id});
	    $stats->{$d->{id}} = $d->{stats};
	}

	$res = $rados->mon_command({ prefix => 'osd dump' });

	my $data = [];
	foreach my $e (@{$res->{pools}}) {
	    my $d = {};
	    foreach my $attr (qw(pool pool_name size min_size pg_num crush_ruleset)) {
		$d->{$attr} = $e->{$attr} if defined($e->{$attr});
	    }
	    if (my $s = $stats->{$d->{pool}}) {
		$d->{bytes_used} = $s->{bytes_used};
		$d->{percent_used} = ($s->{bytes_used} / $total)*100
		    if $s->{max_avail} && $total;
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
		default => 2,
		optional => 1,
		minimum => 1,
		maximum => 7,
	    },
	    min_size => {
		description => 'Minimum number of replicas per object',
		type => 'integer',
		default => 1,
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
	    crush_ruleset => {
		description => "The ruleset to use for mapping object placement in the cluster.",
		type => 'integer',
		minimum => 0,
		maximum => 32768,
		default => 0,
		optional => 1,
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

	my $pg_num = $param->{pg_num} || 64;
	my $size = $param->{size} || 2;
	my $min_size = $param->{min_size} || 1;
	my $ruleset = $param->{crush_ruleset} || 0;
	my $rados = PVE::RADOS->new();

	$rados->mon_command({ 
	    prefix => "osd pool create",
	    pool => $param->{name},
	    pg_num => int($pg_num),
# this does not work for unknown reason
#	    properties => ["size=$size", "min_size=$min_size", "crush_ruleset=$ruleset"],
	    format => 'plain',
	});

	$rados->mon_command({ 
	    prefix => "osd pool set",
	    pool => $param->{name},
	    var => 'min_size',
	    val => $min_size,
	    format => 'plain',
	});

	$rados->mon_command({ 
	    prefix => "osd pool set",
	    pool => $param->{name},
	    var => 'size',
	    val => $size,
	    format => 'plain',
	});

	if (defined($param->{crush_ruleset})) {
	    $rados->mon_command({ 
		prefix => "osd pool set",
		pool => $param->{name},
		var => 'crush_ruleset',
		val => $param->{crush_ruleset},
	        format => 'plain',
	    });
	}

	return undef;
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
	    }
	},
    },
    returns => { type => 'null' },
    code => sub {
	my ($param) = @_;

	PVE::CephTools::check_ceph_inited();

	# if not forced, destroy ceph pool only when no
	# vm disks are on it anymore
	if (!$param->{force}) {
	    my $storagecfg = PVE::Storage::config();
	    foreach my $storageid (keys %{$storagecfg->{ids}}) {
		my $storage = $storagecfg->{ids}->{$storageid};
		next if $storage->{type} ne 'rbd';
		next if $storage->{pool} ne $param->{name};

		# check if any vm disks are on the pool
		my $res = PVE::Storage::vdisk_list($storagecfg, $storageid);
		die "ceph pool '$param->{name}' still in use by storage '$storageid'\n"
		    if @{$res->{$storageid}} != 0;
	    }
	}

	my $rados = PVE::RADOS->new();
	# fixme: '--yes-i-really-really-mean-it'
	$rados->mon_command({ 
	    prefix => "osd pool delete",
	    pool => $param->{name},
	    pool2 => $param->{name},
	    sure => '--yes-i-really-really-mean-it',
	    format => 'plain',
        });

	return undef;
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


