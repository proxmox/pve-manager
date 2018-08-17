package PVE::API2::Cluster;

use strict;
use warnings;

use XML::Parser;

use PVE::SafeSyslog;
use PVE::Tools qw(extract_param);
use PVE::Exception qw(raise_param_exc);
use PVE::INotify;
use PVE::Cluster qw(cfs_register_file cfs_lock_file cfs_read_file cfs_write_file);
use PVE::Storage;
use PVE::API2Tools;
use PVE::API2::Backup;
use PVE::API2::HAConfig;
use PVE::HA::Env::PVE2;
use PVE::HA::Config;
use PVE::API2::ClusterConfig;
use JSON;
use PVE::RESTHandler;
use PVE::RPCEnvironment;
use PVE::JSONSchema qw(get_standard_option);
use PVE::Firewall;
use PVE::API2::Firewall::Cluster;
use PVE::API2::ReplicationConfig;
use PVE::API2::ACMEAccount;

use base qw(PVE::RESTHandler);

__PACKAGE__->register_method ({
    subclass => "PVE::API2::ReplicationConfig",
    path => 'replication',
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
    subclass => "PVE::API2::HAConfig",  
    path => 'ha',
});

__PACKAGE__->register_method ({
    subclass => "PVE::API2::ACMEAccount",
    path => 'acme',
});

my $dc_schema = PVE::Cluster::get_datacenter_schema();
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
	    { name => 'log' },
	    { name => 'options' },
	    { name => 'resources' },
	    { name => 'replication' },
	    { name => 'tasks' },
	    { name => 'backup' },
	    { name => 'ha' },
	    { name => 'status' },
	    { name => 'nextid' },
	    { name => 'firewall' },
	    { name => 'config' },
	    { name => 'acme' },
	    ];

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
		enum => ['vm', 'storage', 'node'],
	    },
	},
    },
    returns => {
	type => 'array',
	items => {
	    type => "object",
	    properties => {
		id => { type => 'string' },
		type => {
		    description => "Resource type.",
		    type => 'string',
		    enum => ['node', 'storage', 'pool', 'qemu', 'lxc', 'openvz'],
		},
		status => {
		    description => "Resource type dependent status.",
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
		    renderer => 'fraction_as_percentage',
		},
		maxcpu => {
		    description => "Number of available CPUs (when type in node,qemu,lxc).",
		    type => 'number',
		    optional => 1,
		},
		mem => {
		    description => "Used memory in bytes (when type in node,qemu,lxc).",
		    type => 'string',
		    optional => 1,
		    renderer => 'bytes',
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
		    type => 'string',
		    optional => 1,
		    renderer => 'bytes',
		},
		maxdisk => {
		    description => "Storage size in bytes (when type in storage), root image size for VMs (type in qemu,lxc).",
		    type => 'integer',
		    optional => 1,
		    renderer => 'bytes',
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
	    foreach my $pool (keys %{$usercfg->{pools}}) {
		my $d = $usercfg->{pools}->{$pool};

		next if !$rpcenv->check($authuser, "/pool/$pool", [ 'Pool.Allocate' ], 1);

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
	    foreach my $vmid (keys %$idlist) {

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
		
		next if !$rpcenv->check($authuser, "/vms/$vmid", [ 'VM.Audit' ], 1);

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

	if (!$param->{type} || $param->{type} eq 'node') {
	    foreach my $node (@$nodelist) {
		my $entry = PVE::API2Tools::extract_node_stats($node, $members, $rrd);
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

	my $res = [];

	return $res if !$tlist;

	my $all = $rpcenv->check($authuser, "/", [ 'Sys.Audit' ], 1);

	foreach my $task (@$tlist) {
	    push @$res, $task if $all || ($task->{user} eq $authuser);
	}
   
	return $res;
    }});

__PACKAGE__->register_method({
    name => 'get_options', 
    path => 'options', 
    method => 'GET',
    description => "Get datacenter options.",
    permissions => {
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

	return PVE::Cluster::cfs_read_file('datacenter.cfg');
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

	my $filename = 'datacenter.cfg';

	my $delete = extract_param($param, 'delete');

	my $code = sub {

	    my $conf = cfs_read_file($filename);

	    foreach my $opt (keys %$param) {
		$conf->{$opt} = $param->{$opt};
	    }

	    foreach my $opt (PVE::Tools::split_list($delete)) {
		delete $conf->{$opt};
	    };

	    cfs_write_file($filename, $conf);
	};

	cfs_lock_file($filename, undef, $code);
	die $@ if $@;

	return undef;
    }});

__PACKAGE__->register_method({
    name => 'get_status', 
    path => 'status', 
    method => 'GET',
    description => "Get cluster status informations.",
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
		    type => 'string'
		},
	    },
	},
    },
    code => sub {
	my ($param) = @_;

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
		    ip => $d->{ip},
		    'local' => ($node eq $nodename) ? 1 : 0,
		    online => $d->{online},
		};
		
		if (my $d = PVE::API2Tools::extract_node_stats($node, $members, $rrd)) {
		    $entry->{level} = $d->{level};
		}
		
		push @$res, $entry;
	    }
	    return $res;
	} else {
	    # fake entry for local node if no cluster defined
	    my $pmxcfs = ($clinfo && $clinfo->{version}) ? 1 : 0; # pmxcfs online ?

	    my $subinfo = PVE::INotify::read_file('subscription');
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
    description => "Get next free VMID. If you pass an VMID it will raise an error if the ID is already used.",
    permissions => { user => 'all' },
    parameters => {
    	additionalProperties => 0,
	properties => {
	    vmid => get_standard_option('pve-vmid', {optional => 1}),
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

	for (my $i = 100; $i < 10000; $i++) {
	    return $i if !defined($idlist->{$i});
	}

	die "unable to get any free VMID\n";
    }});

1;
