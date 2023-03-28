package PVE::API2::Cluster;

use strict;
use warnings;

use JSON;

use PVE::API2Tools;
use PVE::Cluster qw(cfs_register_file cfs_lock_file cfs_read_file cfs_write_file);
use PVE::DataCenterConfig;
use PVE::Exception qw(raise_param_exc);
use PVE::Firewall;
use PVE::GuestHelpers;
use PVE::HA::Config;
use PVE::HA::Env::PVE2;
use PVE::INotify;
use PVE::JSONSchema qw(get_standard_option);
use PVE::RESTHandler;
use PVE::RPCEnvironment;
use PVE::SafeSyslog;
use PVE::Storage;
use PVE::Tools qw(extract_param);

use PVE::API2::ACMEAccount;
use PVE::API2::ACMEPlugin;
use PVE::API2::Backup;
use PVE::API2::Cluster::BackupInfo;
use PVE::API2::Cluster::Ceph;
use PVE::API2::Cluster::Jobs;
use PVE::API2::Cluster::MetricServer;
use PVE::API2::ClusterConfig;
use PVE::API2::Firewall::Cluster;
use PVE::API2::HAConfig;
use PVE::API2::ReplicationConfig;

my $have_sdn;
eval {
    require PVE::API2::Network::SDN;
    $have_sdn = 1;
};

use base qw(PVE::RESTHandler);

__PACKAGE__->register_method ({
    subclass => "PVE::API2::ReplicationConfig",
    path => 'replication',
});

__PACKAGE__->register_method ({
    subclass => "PVE::API2::Cluster::MetricServer",
    path => 'metrics',
});

__PACKAGE__->register_method ({
    subclass => "PVE::API2::ClusterConfig",
    path => 'config',
});

__PACKAGE__->register_method ({
    subclass => "PVE::API2::Firewall::Cluster",
    path => 'firewall',
});

__PACKAGE__->register_method ({
    subclass => "PVE::API2::Backup",
    path => 'backup',
});

__PACKAGE__->register_method ({
    subclass => "PVE::API2::Cluster::BackupInfo",
    path => 'backup-info',
});

__PACKAGE__->register_method ({
    subclass => "PVE::API2::HAConfig",
    path => 'ha',
});

__PACKAGE__->register_method ({
    subclass => "PVE::API2::ACMEAccount",
    path => 'acme',
});

__PACKAGE__->register_method ({
    subclass => "PVE::API2::Cluster::Ceph",
    path => 'ceph',
});

__PACKAGE__->register_method ({
    subclass => "PVE::API2::Cluster::Jobs",
    path => 'jobs',
});
if ($have_sdn) {
    __PACKAGE__->register_method ({
       subclass => "PVE::API2::Network::SDN",
       path => 'sdn',
    });
}

my $dc_schema = PVE::DataCenterConfig::get_datacenter_schema();
my $dc_properties = {
    delete => {
	type => 'string', format => 'pve-configid-list',
	description => "A list of settings you want to delete.",
	optional => 1,
    }
};
foreach my $opt (keys %{$dc_schema->{properties}}) {
    $dc_properties->{$opt} = $dc_schema->{properties}->{$opt};
}

__PACKAGE__->register_method ({
    name => 'index',
    path => '',
    method => 'GET',
    description => "Cluster index.",
    permissions => { user => 'all' },
    parameters => {
    	additionalProperties => 0,
	properties => {},
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
	    { name => 'acme' },
	    { name => 'backup' },
	    { name => 'backup-info' },
	    { name => 'ceph' },
	    { name => 'config' },
	    { name => 'firewall' },
	    { name => 'ha' },
	    { name => 'jobs' },
	    { name => 'log' },
	    { name => 'metrics' },
	    { name => 'nextid' },
	    { name => 'options' },
	    { name => 'replication' },
	    { name => 'resources' },
	    { name => 'status' },
	    { name => 'tasks' },
	];

	if ($have_sdn) {
	    push(@{$result}, { name => 'sdn' });
	}

	return $result;
    }});

__PACKAGE__->register_method({
    name => 'log',
    path => 'log',
    method => 'GET',
    description => "Read cluster log",
    permissions => { user => 'all' },
    parameters => {
    	additionalProperties => 0,
	properties => {
	    max => {
		type => 'integer',
		description => "Maximum number of entries.",
		optional => 1,
		minimum => 1,
	    }
	},
    },
    returns => {
	type => 'array',
	items => {
	    type => "object",
	    properties => {},
	},
    },
    code => sub {
	my ($param) = @_;

	my $rpcenv = PVE::RPCEnvironment::get();

	my $max = $param->{max} || 0;
	my $user = $rpcenv->get_user();

	my $admin = $rpcenv->check($user, "/", [ 'Sys.Syslog' ], 1);

	my $loguser = $admin ? '' : $user;

	my $res = decode_json(PVE::Cluster::get_cluster_log($loguser, $max));

	foreach my $entry (@{$res->{data}}) {
	    $entry->{id} = "$entry->{uid}:$entry->{node}";
	}

	return $res->{data};
    }});

__PACKAGE__->register_method({
    name => 'resources',
    path => 'resources',
    method => 'GET',
    description => "Resources index (cluster wide).",
    permissions => { user => 'all' },
    parameters => {
    	additionalProperties => 0,
	properties => {
	    type => {
		type => 'string',
		optional => 1,
		enum => ['vm', 'storage', 'node', 'sdn'],
	    },
	},
    },
    returns => {
	type => 'array',
	items => {
	    type => "object",
	    properties => {
		id => {
		    description => "Resource id.",
		    type => 'string',
		},
		type => {
		    description => "Resource type.",
		    type => 'string',
		    enum => ['node', 'storage', 'pool', 'qemu', 'lxc', 'openvz', 'sdn'],
		},
		status => {
		    description => "Resource type dependent status.",
		    type => 'string',
		    optional => 1,
		},
		name => {
		    description => "Name of the resource.",
		    type => 'string',
		    optional => 1,
		},
		node => get_standard_option('pve-node', {
		    description => "The cluster node name (when type in node,storage,qemu,lxc).",
		    optional => 1,
		}),
		storage => get_standard_option('pve-storage-id', {
		    description => "The storage identifier (when type == storage).",
		    optional => 1,
		}),
		pool => {
		    description => "The pool name (when type in pool,qemu,lxc).",
		    type => 'string',
		    optional => 1,
		},
		cpu => {
		    description => "CPU utilization (when type in node,qemu,lxc).",
		    type => 'number',
		    optional => 1,
		    minimum => 0,
		    renderer => 'fraction_as_percentage',
		},
		maxcpu => {
		    description => "Number of available CPUs (when type in node,qemu,lxc).",
		    type => 'number',
		    optional => 1,
		    minimum => 0,
		},
		mem => {
		    description => "Used memory in bytes (when type in node,qemu,lxc).",
		    type => 'integer',
		    optional => 1,
		    renderer => 'bytes',
		    minimum => 0,
		},
		maxmem => {
		    description => "Number of available memory in bytes (when type in node,qemu,lxc).",
		    type => 'integer',
		    optional => 1,
		    renderer => 'bytes',
		},
		level => {
		    description => "Support level (when type == node).",
		    type => 'string',
		    optional => 1,
		},
		uptime => {
		    description => "Node uptime in seconds (when type in node,qemu,lxc).",
		    type => 'integer',
		    optional => 1,
		    renderer => 'duration',
		},
		hastate => {
		    description => "HA service status (for HA managed VMs).",
		    type => 'string',
		    optional => 1,
		},
		disk => {
		    description => "Used disk space in bytes (when type in storage), used root image spave for VMs (type in qemu,lxc).",
		    type => 'integer',
		    optional => 1,
		    renderer => 'bytes',
		    minimum => 0,
		},
		maxdisk => {
		    description => "Storage size in bytes (when type in storage), root image size for VMs (type in qemu,lxc).",
		    type => 'integer',
		    optional => 1,
		    renderer => 'bytes',
		    minimum => 0,
		},
		content => {
		    description => "Allowed storage content types (when type == storage).",
		    type => 'string',
		    format => 'pve-storage-content-list',
		    optional => 1,
		},
		plugintype => {
		    description => "More specific type, if available.",
		    type => 'string',
		    optional => 1,
		},
		vmid => {
		    description => "The numerical vmid (when type in qemu,lxc).",
		    type => 'integer',
		    optional => 1,
		    minimum => 1,
		},
		'cgroup-mode' => {
		    description => "The cgroup mode the node operates under (when type == node).",
		    type => 'integer',
		    optional => 1,
		},
	    },
	},
    },
    code => sub {
	my ($param) = @_;

	my $rpcenv = PVE::RPCEnvironment::get();
	my $authuser = $rpcenv->get_user();
	my $usercfg = $rpcenv->{user_cfg};

	my $res = [];

	my $nodelist = PVE::Cluster::get_nodelist();
	my $members = PVE::Cluster::get_members();

	my $rrd = PVE::Cluster::rrd_dump();

	my $vmlist = PVE::Cluster::get_vmlist() || {};
	my $idlist = $vmlist->{ids} || {};

	my $hastatus = PVE::HA::Config::read_manager_status();
	my $haresources = PVE::HA::Config::read_resources_config();
	my $hatypemap = {
	    'qemu' => 'vm',
	    'lxc' => 'ct'
	};

	my $pooldata = {};
	if (!$param->{type} || $param->{type} eq 'pool') {
	    for my $pool (sort keys %{$usercfg->{pools}}) {
		my $d = $usercfg->{pools}->{$pool};

		next if !$rpcenv->check($authuser, "/pool/$pool", [ 'Pool.Audit' ], 1);

		my $entry = {
		    id => "/pool/$pool",
		    pool => $pool,
		    type => 'pool',
		};

		$pooldata->{$pool} = $entry;

		push @$res, $entry;
	    }
	}

	# we try to generate 'numbers' by using "$X + 0"
	if (!$param->{type} || $param->{type} eq 'vm') {
	    my $prop_list = [qw(lock tags)];
	    my $props = PVE::Cluster::get_guest_config_properties($prop_list);

	    for my $vmid (sort keys %$idlist) {

		my $data = $idlist->{$vmid};
		my $entry = PVE::API2Tools::extract_vm_stats($vmid, $data, $rrd);

		if (my $pool = $usercfg->{vms}->{$vmid}) {
		    $entry->{pool} = $pool;
		    if (my $pe = $pooldata->{$pool}) {
			if ($entry->{uptime}) {
			    $pe->{uptime} = $entry->{uptime} if !$pe->{uptime} || $entry->{uptime} > $pe->{uptime};
			    $pe->{mem} = 0 if !$pe->{mem};
			    $pe->{mem} += $entry->{mem};
			    $pe->{maxmem} = 0 if !$pe->{maxmem};
			    $pe->{maxmem} += $entry->{maxmem};
			    $pe->{cpu} = 0 if !$pe->{cpu};
			    $pe->{maxcpu} = 0 if !$pe->{maxcpu};
			    # explanation:
			    # we do not know how much cpus there are in the cluster at this moment
			    # so we calculate the current % of the cpu
			    # but we had already the old cpu % before this vm, so:
			    # new% = (old%*oldmax + cur%*curmax) / (oldmax+curmax)
			    $pe->{cpu} = (($pe->{cpu} * $pe->{maxcpu}) + ($entry->{cpu} * $entry->{maxcpu})) / ($pe->{maxcpu} + $entry->{maxcpu});
			    $pe->{maxcpu} += $entry->{maxcpu};
			}
		    }
		}

		# only skip now to next to ensure that the pool stats above are filled, if eligible
		next if !$rpcenv->check($authuser, "/vms/$vmid", [ 'VM.Audit' ], 1);

		for my $prop (@$prop_list) {
		    if (defined(my $value = $props->{$vmid}->{$prop})) {
			$entry->{$prop} = $value;
		    }
		}

		if (defined($entry->{pool}) &&
		    !$rpcenv->check($authuser, "/pool/$entry->{pool}", ['Pool.Audit'], 1)) {
		    delete $entry->{pool};
		}

		# get ha status
		if (my $hatype = $hatypemap->{$entry->{type}}) {
		    my $sid = "$hatype:$vmid";
		    my $service;
		    if ($service = $hastatus->{service_status}->{$sid}) {
			$entry->{hastate} = $service->{state};
		    } elsif ($service = $haresources->{ids}->{$sid}) {
			$entry->{hastate} = $service->{state};
		    }
		}

		push @$res, $entry;
	    }
	}

	my $static_node_info = PVE::Cluster::get_node_kv("static-info");

	if (!$param->{type} || $param->{type} eq 'node') {
	    foreach my $node (@$nodelist) {
		my $can_audit = $rpcenv->check($authuser, "/nodes/$node", [ 'Sys.Audit' ], 1);
		my $entry = PVE::API2Tools::extract_node_stats($node, $members, $rrd, !$can_audit);

		my $info = eval { decode_json($static_node_info->{$node}); };
		if (defined(my $mode = $info->{'cgroup-mode'})) {
		    $entry->{'cgroup-mode'} = int($mode);
		}

		push @$res, $entry;
	    }
	}

	if (!$param->{type} || $param->{type} eq 'storage') {

	    my $cfg = PVE::Storage::config();
	    my @sids =  PVE::Storage::storage_ids ($cfg);

	    foreach my $storeid (@sids) {
		next if !$rpcenv->check($authuser, "/storage/$storeid", [ 'Datastore.Audit' ], 1);

		my $scfg =  PVE::Storage::storage_config($cfg, $storeid);
		# we create a entry for each node
		foreach my $node (@$nodelist) {
		    next if !PVE::Storage::storage_check_enabled($cfg, $storeid, $node, 1);

		    my $entry = PVE::API2Tools::extract_storage_stats($storeid, $scfg, $node, $rrd);
		    push @$res, $entry;
		}
	    }
	}

	if ($have_sdn) {
	    if (!$param->{type} || $param->{type} eq 'sdn') {

		my $nodes = PVE::Cluster::get_node_kv("sdn");

		for my $node (sort keys %{$nodes}) {
		    my $sdns = decode_json($nodes->{$node});

		    for my $id (sort keys %{$sdns}) {
			next if !$rpcenv->check($authuser, "/sdn/zones/$id", [ 'SDN.Audit' ], 1);
			my $sdn = $sdns->{$id};
			my $entry = {
			    id => "sdn/$node/$id",
			    sdn => $id,
			    node => $node,
			    type => 'sdn',
			    status => $sdn->{'status'},
			};
			push @$res, $entry;
		    }
	        }
	    }
	}

	return $res;
    }});

__PACKAGE__->register_method({
    name => 'tasks',
    path => 'tasks',
    method => 'GET',
    description => "List recent tasks (cluster wide).",
    permissions => { user => 'all' },
    parameters => {
    	additionalProperties => 0,
	properties => {},
    },
    returns => {
	type => 'array',
	items => {
	    type => "object",
	    properties => {
		upid => { type => 'string' },
	    },
	},
    },
    code => sub {
	my ($param) = @_;

	my $rpcenv = PVE::RPCEnvironment::get();
	my $authuser = $rpcenv->get_user();

	my $tlist = PVE::Cluster::get_tasklist();
	return [] if !$tlist;

	my $all = $rpcenv->check($authuser, "/", [ 'Sys.Audit' ], 1);

	my $res = [];
	foreach my $task (@$tlist) {
	    if (PVE::AccessControl::pve_verify_tokenid($task->{user}, 1)) {
		($task->{user}, $task->{tokenid}) = PVE::AccessControl::split_tokenid($task->{user});
	    }
	    push @$res, $task if $all || ($task->{user} eq $authuser);
	}

	return $res;
    }});

__PACKAGE__->register_method({
    name => 'get_options',
    path => 'options',
    method => 'GET',
    description => "Get datacenter options. Without 'Sys.Audit' on '/' not all options are returned.",
    permissions => {
	user => 'all',
	check => ['perm', '/', [ 'Sys.Audit' ]],
    },
    parameters => {
    	additionalProperties => 0,
	properties => {},
    },
    returns => {
	type => "object",
	properties => {},
    },
    code => sub {
	my ($param) = @_;

	my $res = {};

	my $rpcenv = PVE::RPCEnvironment::get();
	my $authuser = $rpcenv->get_user();

	my $datacenter_config = eval { PVE::Cluster::cfs_read_file('datacenter.cfg') } // {};

	if ($rpcenv->check($authuser, '/', ['Sys.Audit'], 1)) {
	    $res = $datacenter_config;
	} else {
	    for my $k (qw(console tag-style)) {
		$res->{$k} = $datacenter_config->{$k} if exists $datacenter_config->{$k};
	    }
	}

	my $tags = PVE::GuestHelpers::get_allowed_tags($rpcenv, $authuser);
	$res->{'allowed-tags'} = [sort keys $tags->%*];

	return $res;
    }});

__PACKAGE__->register_method({
    name => 'set_options',
    path => 'options',
    method => 'PUT',
    description => "Set datacenter options.",
    permissions => {
	check => ['perm', '/', [ 'Sys.Modify' ]],
    },
    protected => 1,
    parameters => {
    	additionalProperties => 0,
	properties => $dc_properties,
    },
    returns => { type => "null" },
    code => sub {
	my ($param) = @_;

	my $delete = extract_param($param, 'delete');

	cfs_lock_file('datacenter.cfg', undef, sub {
	    my $conf = cfs_read_file('datacenter.cfg');

	    $conf->{$_} = $param->{$_} for keys $param->%*;

	    delete $conf->{$_} for PVE::Tools::split_list($delete);

	    cfs_write_file('datacenter.cfg', $conf);
	});
	die $@ if $@;

	return undef;
    }});

__PACKAGE__->register_method({
    name => 'get_status',
    path => 'status',
    method => 'GET',
    description => "Get cluster status information.",
    permissions => {
	check => ['perm', '/', [ 'Sys.Audit' ]],
    },
    protected => 1,
    parameters => {
    	additionalProperties => 0,
	properties => {},
    },
    returns => {
	type => 'array',
	items => {
	    type => "object",
	    properties => {
		type => {
		    type => 'string',
		    enum => ['cluster', 'node'],
		    description => 'Indicates the type, either cluster or node. The type defines the object properties e.g. quorate available for type cluster.'
		},
		id => {
		    type => 'string',
		},
		name => {
		    type => 'string',
		},
		nodes => {
		    type => 'integer',
		    optional => 1,
		    description => '[cluster] Nodes count, including offline nodes.',
		},
		version => {
		    type => 'integer',
		    optional => 1,
		    description => '[cluster] Current version of the corosync configuration file.',
		},
		quorate => {
		    type => 'boolean',
		    optional => 1,
		    description => '[cluster] Indicates if there is a majority of nodes online to make decisions',
		},
		nodeid => {
		    type => 'integer',
		    optional => 1,
		    description => '[node] ID of the node from the corosync configuration.',
		},
		ip => {
		    type => 'string',
		    optional => 1,
		    description => '[node] IP of the resolved nodename.',
		},
		'local' => {
		    type => 'boolean',
		    optional => 1,
		    description => '[node] Indicates if this is the responding node.',
		},
		online => {
		    type => 'boolean',
		    optional => 1,
		    description => '[node] Indicates if the node is online or offline.',
		},
		level => {
		    type => 'string',
		    optional => 1,
		    description => '[node] Proxmox VE Subscription level, indicates if eligible for enterprise support as well as access to the stable Proxmox VE Enterprise Repository.',
		}
	    },
	},
    },
    code => sub {
	my ($param) = @_;

	# make sure we get current info
	PVE::Cluster::cfs_update();

	# we also add info from pmxcfs
	my $clinfo = PVE::Cluster::get_clinfo();
	my $members = PVE::Cluster::get_members();
	my $nodename = PVE::INotify::nodename();
	my $rrd = PVE::Cluster::rrd_dump();

	if ($members) {
	    my $res = [];

	    if (my $d = $clinfo->{cluster}) {
		push @$res, {
		    type => 'cluster',
		    id => 'cluster',
		    nodes => $d->{nodes},
		    version => $d->{version},
		    name => $d->{name},
		    quorate => $d->{quorate},
		};
	    }

	    foreach my $node (keys %$members) {
		my $d = $members->{$node};
		my $entry = {
		    type => 'node',
		    id => "node/$node",
		    name => $node,
		    nodeid => $d->{id},
		    'local' => ($node eq $nodename) ? 1 : 0,
		    online => $d->{online},
		};

		if (defined($d->{ip})) {
		    $entry->{ip} = $d->{ip};
		}

		if (my $d = PVE::API2Tools::extract_node_stats($node, $members, $rrd)) {
		    $entry->{level} = $d->{level} || '';
		}

		push @$res, $entry;
	    }
	    return $res;
	} else {
	    # fake entry for local node if no cluster defined
	    my $pmxcfs = ($clinfo && $clinfo->{version}) ? 1 : 0; # pmxcfs online ?

	    my $subinfo = PVE::API2::Subscription::read_etc_subscription();
	    my $sublevel = $subinfo->{level} || '';

	    return [{
		type => 'node',
		id => "node/$nodename",
		name => $nodename,
		ip => scalar(PVE::Cluster::remote_node_ip($nodename)),
		'local' => 1,
		nodeid => 0,
		online => 1,
		level => $sublevel,
	    }];
	}
    }});

__PACKAGE__->register_method({
    name => 'nextid',
    path => 'nextid',
    method => 'GET',
    description => "Get next free VMID. Pass a VMID to assert that its free (at time of check).",
    permissions => { user => 'all' },
    parameters => {
    	additionalProperties => 0,
	properties => {
	    vmid => get_standard_option('pve-vmid', {
		    optional => 1,
	    }),
	},
    },
    returns => {
	type => 'integer',
	description => "The next free VMID.",
    },
    code => sub {
	my ($param) = @_;

	my $vmlist = PVE::Cluster::get_vmlist() || {};
	my $idlist = $vmlist->{ids} || {};

	if (my $vmid = $param->{vmid}) {
	    return $vmid if !defined($idlist->{$vmid});
	    raise_param_exc({ vmid => "VM $vmid already exists" });
	}

	my $dc_conf = PVE::Cluster::cfs_read_file('datacenter.cfg');
	my $next_id = $dc_conf->{'next-id'} // {};

	my $lower = $next_id->{lower} // 100;
	my $upper = $next_id->{upper} // (1000 * 1000); # note, lower than the schema-maximum

	for (my $i = $lower; $i < $upper; $i++) {
	    return $i if !defined($idlist->{$i});
	}

	die "unable to get any free VMID in range [$lower, $upper]\n";
    }});

1;
