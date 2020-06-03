package PVE::API2::Ceph;

use strict;
use warnings;

use File::Path;
use Net::IP;
use UUID;

use PVE::Ceph::Tools;
use PVE::Ceph::Services;
use PVE::Cluster qw(cfs_read_file cfs_write_file);
use PVE::JSONSchema qw(get_standard_option);
use PVE::Network;
use PVE::RADOS;
use PVE::RESTHandler;
use PVE::RPCEnvironment;
use PVE::Storage;
use PVE::Tools qw(run_command file_get_contents file_set_contents);

use PVE::API2::Ceph::OSD;
use PVE::API2::Ceph::FS;
use PVE::API2::Ceph::MDS;
use PVE::API2::Ceph::MGR;
use PVE::API2::Ceph::MON;
use PVE::API2::Storage::Config;

use base qw(PVE::RESTHandler);

my $pve_osd_default_journal_size = 1024*5;

__PACKAGE__->register_method ({
    subclass => "PVE::API2::Ceph::OSD",
    path => 'osd',
});

__PACKAGE__->register_method ({
    subclass => "PVE::API2::Ceph::MDS",
    path => 'mds',
});

__PACKAGE__->register_method ({
    subclass => "PVE::API2::Ceph::MGR",
    path => 'mgr',
});

__PACKAGE__->register_method ({
    subclass => "PVE::API2::Ceph::MON",
    path => 'mon',
});

__PACKAGE__->register_method ({
    subclass => "PVE::API2::Ceph::FS",
    path => 'fs',
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
	    { name => 'fs' },
	    { name => 'mds' },
	    { name => 'stop' },
	    { name => 'start' },
	    { name => 'restart' },
	    { name => 'status' },
	    { name => 'crush' },
	    { name => 'config' },
	    { name => 'log' },
	    { name => 'disks' },
	    { name => 'flags' }, # FIXME: remove with 7.0
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

	PVE::Ceph::Tools::check_ceph_inited();

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
    proxyto => 'node',
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

	PVE::Ceph::Tools::check_ceph_inited();

	my $path = PVE::Ceph::Tools::get_config('pve_ceph_cfgpath');
	return file_get_contents($path);

    }});

__PACKAGE__->register_method ({
    name => 'configdb',
    path => 'configdb',
    method => 'GET',
    proxyto => 'node',
    protected => 1,
    permissions => {
	check => ['perm', '/', [ 'Sys.Audit', 'Datastore.Audit' ], any => 1],
    },
    description => "Get Ceph configuration database.",
    parameters => {
	additionalProperties => 0,
	properties => {
	    node => get_standard_option('pve-node'),
	},
    },
    returns => {
	type => 'array',
	items => {
	    type => 'object',
	    properties => {
		section => { type => "string", },
		name => { type => "string", },
		value => { type => "string", },
		level => { type => "string", },
		'can_update_at_runtime' => { type => "boolean", },
		mask => { type => "string" },
	    },
	},
    },
    code => sub {
	my ($param) = @_;

	PVE::Ceph::Tools::check_ceph_inited();

	my $rados = PVE::RADOS->new();
	my $res = $rados->mon_command( { prefix => 'config dump', format => 'json' });
	foreach my $entry (@$res) {
	    $entry->{can_update_at_runtime} = $entry->{can_update_at_runtime}? 1 : 0; # JSON::true/false -> 1/0
	}

	return $res;
    }});

my $add_storage = sub {
    my ($pool, $storeid) = @_;

    my $storage_params = {
	type => 'rbd',
	pool => $pool,
	storage => $storeid,
	krbd => 0,
	content => 'rootdir,images',
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
	    'cluster-network' => {
		description => "Declare a separate cluster network, OSDs will route" .
		    "heartbeat, object replication and recovery traffic over it",
		type => 'string', format => 'CIDR',
		requires => 'network',
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
		description => "Disable cephx authentication.\n\n" .
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

	my $version = PVE::Ceph::Tools::get_local_version(1);

	if (!$version || $version < 14) {
	    die "Ceph Nautilus required - please run 'pveceph install'\n";
	} else {
	    PVE::Ceph::Tools::check_ceph_installed('ceph_bin');
	}

	my $auth = $param->{disable_cephx} ? 'none' : 'cephx';

	# simply load old config if it already exists
	PVE::Cluster::cfs_lock_file('ceph.conf', undef, sub {
	    my $cfg = cfs_read_file('ceph.conf');

	    if (!$cfg->{global}) {

		my $fsid;
		my $uuid;

		UUID::generate($uuid);
		UUID::unparse($uuid, $fsid);

		$cfg->{global} = {
		    'fsid' => $fsid,
		    'auth cluster required' => $auth,
		    'auth service required' => $auth,
		    'auth client required' => $auth,
		    'osd pool default size' => $param->{size} // 3,
		    'osd pool default min size' => $param->{min_size} // 2,
		    'mon allow pool delete' => 'true',
		};

		# this does not work for default pools
		#'osd pool default pg num' => $pg_num,
		#'osd pool default pgp num' => $pg_num,
	    }

	    if ($auth eq 'cephx') {
		$cfg->{client}->{keyring} = '/etc/pve/priv/$cluster.$name.keyring';
	    }

	    if ($param->{pg_bits}) {
		$cfg->{global}->{'osd pg bits'} = $param->{pg_bits};
		$cfg->{global}->{'osd pgp bits'} = $param->{pg_bits};
	    }

	    if ($param->{network}) {
		$cfg->{global}->{'public network'} = $param->{network};
		$cfg->{global}->{'cluster network'} = $param->{network};
	    }

	    if ($param->{'cluster-network'}) {
		$cfg->{global}->{'cluster network'} = $param->{'cluster-network'};
	    }

	    cfs_write_file('ceph.conf', $cfg);

	    if ($auth eq 'cephx') {
		PVE::Ceph::Tools::get_or_create_admin_keyring();
	    }
	    PVE::Ceph::Tools::setup_pve_symlinks();
	});
	die $@ if $@;

	return undef;
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
		default => 'ceph.target',
		pattern => '(ceph|mon|mds|osd|mgr)(\.'.PVE::Ceph::Services::SERVICE_REGEX.')?',
	    },
	},
    },
    returns => { type => 'string' },
    code => sub {
	my ($param) = @_;

	my $rpcenv = PVE::RPCEnvironment::get();

	my $authuser = $rpcenv->get_user();

	PVE::Ceph::Tools::check_ceph_inited();

	my $cfg = cfs_read_file('ceph.conf');
	scalar(keys %$cfg) || die "no configuration\n";

	my $worker = sub {
	    my $upid = shift;

	    my $cmd = ['stop'];
	    if ($param->{service}) {
		push @$cmd, $param->{service};
	    }

	    PVE::Ceph::Services::ceph_service_cmd(@$cmd);
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
		default => 'ceph.target',
		pattern => '(ceph|mon|mds|osd|mgr)(\.'.PVE::Ceph::Services::SERVICE_REGEX.')?',
	    },
	},
    },
    returns => { type => 'string' },
    code => sub {
	my ($param) = @_;

	my $rpcenv = PVE::RPCEnvironment::get();

	my $authuser = $rpcenv->get_user();

	PVE::Ceph::Tools::check_ceph_inited();

	my $cfg = cfs_read_file('ceph.conf');
	scalar(keys %$cfg) || die "no configuration\n";

	my $worker = sub {
	    my $upid = shift;

	    my $cmd = ['start'];
	    if ($param->{service}) {
		push @$cmd, $param->{service};
	    }

	    PVE::Ceph::Services::ceph_service_cmd(@$cmd);
	};

	return $rpcenv->fork_worker('srvstart', $param->{service} || 'ceph',
				    $authuser, $worker);
    }});

__PACKAGE__->register_method ({
    name => 'restart',
    path => 'restart',
    method => 'POST',
    description => "Restart ceph services.",
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
		default => 'ceph.target',
		pattern => '(mon|mds|osd|mgr)(\.'.PVE::Ceph::Services::SERVICE_REGEX.')?',
	    },
	},
    },
    returns => { type => 'string' },
    code => sub {
	my ($param) = @_;

	my $rpcenv = PVE::RPCEnvironment::get();

	my $authuser = $rpcenv->get_user();

	PVE::Ceph::Tools::check_ceph_inited();

	my $cfg = cfs_read_file('ceph.conf');
	scalar(keys %$cfg) || die "no configuration\n";

	my $worker = sub {
	    my $upid = shift;

	    my $cmd = ['restart'];
	    if ($param->{service}) {
		push @$cmd, $param->{service};
	    }

	    PVE::Ceph::Services::ceph_service_cmd(@$cmd);
	};

	return $rpcenv->fork_worker('srvrestart', $param->{service} || 'ceph',
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

	PVE::Ceph::Tools::check_ceph_inited();

	return PVE::Ceph::Tools::ceph_cluster_status();
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

	PVE::Ceph::Tools::check_ceph_inited();

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
		default => 128,
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
		description => "Configure VM and CT storage using the new pool.",
		type => 'boolean',
		optional => 1,
	    },
	},
    },
    returns => { type => 'string' },
    code => sub {
	my ($param) = @_;

	PVE::Cluster::check_cfs_quorum();
	PVE::Ceph::Tools::check_ceph_configured();

	my $pool = $param->{name};
	my $rpcenv = PVE::RPCEnvironment::get();
	my $user = $rpcenv->get_user();

	if ($param->{add_storages}) {
	    $rpcenv->check($user, '/storage', ['Datastore.Allocate']);
	    die "pool name contains characters which are illegal for storage naming\n"
		if !PVE::JSONSchema::parse_storage_id($pool);
	}

	my $pg_num = $param->{pg_num} || 128;
	my $size = $param->{size} || 3;
	my $min_size = $param->{min_size} || 2;
	my $application = $param->{application} // 'rbd';

	my $worker = sub {

	    PVE::Ceph::Tools::create_pool($pool, $param);

	    if ($param->{add_storages}) {
		my $err;
		eval { $add_storage->($pool, "${pool}"); };
		if ($@) {
		    warn "failed to add storage: $@";
		    $err = 1;
		}
		die "adding storage for pool '$pool' failed, check log and add manually!\n"
		    if $err;
	    }
	};

	return $rpcenv->fork_worker('cephcreatepool', $pool,  $user, $worker);
    }});

my $possible_flags = PVE::Ceph::Tools::get_possible_osd_flags();
my $possible_flags_list = [ sort keys %$possible_flags ];

# FIXME: Remove with PVE 7.0
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

	PVE::Ceph::Tools::check_ceph_configured();

	my $rados = PVE::RADOS->new();

	my $stat = $rados->mon_command({ prefix => 'osd dump' });

	return $stat->{flags} // '';
    }});

# FIXME: Remove with PVE 7.0
__PACKAGE__->register_method ({
    name => 'set_flag',
    path => 'flags/{flag}',
    method => 'POST',
    description => "Set a specific ceph flag",
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
		description => 'The ceph flag to set',
		type => 'string',
		enum => $possible_flags_list,
	    },
	},
    },
    returns => { type => 'null' },
    code => sub {
	my ($param) = @_;

	PVE::Ceph::Tools::check_ceph_configured();

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
		description => 'The ceph flag to unset',
		type => 'string',
		enum => $possible_flags_list,
	    },
	},
    },
    returns => { type => 'null' },
    code => sub {
	my ($param) = @_;

	PVE::Ceph::Tools::check_ceph_configured();

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

	PVE::Ceph::Tools::check_ceph_inited();

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

	    PVE::Ceph::Tools::destroy_pool($pool);

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

	PVE::Ceph::Tools::check_ceph_inited();

	# this produces JSON (difficult to read for the user)
	# my $txt = &$run_ceph_cmd_text(['osd', 'crush', 'dump'], quiet => 1);

	my $txt = '';

	my $mapfile = "/var/tmp/ceph-crush.map.$$";
	my $mapdata = "/var/tmp/ceph-crush.txt.$$";

	my $rados = PVE::RADOS->new();

	eval {
	    my $bindata = $rados->mon_command({ prefix => 'osd getcrushmap', format => 'plain' });
	    file_set_contents($mapfile, $bindata);
	    run_command(['crushtool', '-d', $mapfile, '-o', $mapdata]);
	    $txt = file_get_contents($mapdata);
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

	PVE::Ceph::Tools::check_ceph_inited();

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

	PVE::Ceph::Tools::check_ceph_inited();

	my $rados = PVE::RADOS->new();

	my $rules = $rados->mon_command({ prefix => 'osd crush rule ls' });

	my $res = [];

	foreach my $rule (@$rules) {
	    push @$res, { name => $rule };
	}

	return $res;
    }});

1;
