package PVE::API2::Cluster;

use strict;
use warnings;

use XML::Parser;

use PVE::SafeSyslog;
use PVE::Tools qw(extract_param);
use PVE::INotify;
use PVE::Cluster qw(cfs_register_file cfs_lock_file cfs_read_file cfs_write_file);
use PVE::Storage;
use PVE::API2Tools;
use PVE::API2::Backup;
use PVE::API2::HAConfig;
use JSON;
use PVE::RESTHandler;
use PVE::RPCEnvironment;

use base qw(PVE::RESTHandler);

__PACKAGE__->register_method ({
    subclass => "PVE::API2::Backup",  
    path => 'backup',
});

__PACKAGE__->register_method ({
    subclass => "PVE::API2::HAConfig",  
    path => 'ha',
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
	    { name => 'tasks' },
	    { name => 'backup' },
	    { name => 'ha' },
	    { name => 'status' },
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
		if (defined($entry->{uptime})) {
		    if (my $pool = $usercfg->{vms}->{$vmid}) {
			if (my $pe = $pooldata->{$pool}) {
			    $pe->{uptime} = $entry->{uptime} if !$pe->{uptime} || $entry->{uptime} > $pe->{uptime};
			    $pe->{mem} = 0 if !$pe->{mem};
			    $pe->{mem} += $entry->{mem};
			    $pe->{maxmem} = 0 if !$pe->{maxmem};
			    $pe->{maxmem} += $entry->{maxmem};
			    $pe->{cpu} = 0 if !$pe->{cpu};
			    $pe->{cpu} += $entry->{cpu};
			    $pe->{maxcpu} = 0 if !$pe->{maxcpu};
			    $pe->{maxcpu} += $entry->{maxcpu};
			}
		    }
		}
		
		next if !$rpcenv->check($authuser, "/vms/$vmid", [ 'VM.Audit' ], 1);

		push @$res, $entry;
	    }
	}

	if (!$param->{type} || $param->{type} eq 'node') {
	    foreach my $node (@$nodelist) {
		my $entry = {
		    id => "node/$node",
		    node => $node,
		    type => "node",
		};
		if (my $d = $rrd->{"pve2-node/$node"}) {
		    
		    if (!$members || # no cluster
			($members->{$node} && $members->{$node}->{online})) {
			$entry->{uptime} = ($d->[0] || 0) + 0;
			$entry->{cpu} = ($d->[4] || 0) + 0;
			$entry->{mem} = ($d->[7] || 0) + 0;
			$entry->{disk} = ($d->[11] || 0) + 0;
		    }

		    $entry->{maxcpu} = ($d->[3] || 0) + 0;
		    $entry->{maxmem} = ($d->[6] || 0) + 0;
		    $entry->{maxdisk} = ($d->[10] || 0) + 0;
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

my $parse_clustat = sub {
    my ($clinfo, $members, $nodename, $raw) = @_;

    my $createNode = sub {
	my ($expat, $tag, %attrib) = @_; 
	my $node = { type => $tag, %attrib };

	if ($tag eq 'node') {
	    my $name = $node->{name};
	    return if !$name; # just to be sure

	    foreach my $key (qw(estranged local qdisk rgmanager rgmanager_master state)) {
		$node->{$key} = int($node->{$key}) if defined($node->{$key});
	    }
	    $node->{nodeid} = hex($node->{nodeid}) if defined($node->{nodeid});

	    # unique ID for GUI
	    $node->{id} = "node/$node->{name}";

	    my $pmxcfs = 0;
	    if (!$members) { # no cluster
		if ($name eq $nodename) {
		    $pmxcfs = ($clinfo && $clinfo->{version}) ? 1 : 0; # pmxcfs online ?
		}
	    } elsif ($members->{$name}) {
		$pmxcfs = $members->{$name}->{online} ? 1 : 0
	    }
	    $node->{pmxcfs} = $pmxcfs;

	    if ($members && $members->{$name}) {
		if (my $ip = $members->{$name}->{ip}) {
		    $node->{ip} = $ip;
		}
	    }
	} elsif ($tag eq 'group') {
	    my $name = $node->{name};
	    return if !$name; # just to be sure
	    # unique ID for GUI
	    $node->{id} = "group/$node->{name}";
	} else {
	    $node->{id} = $tag;
	}

	return $node;
    }; 

    my $extract_tags = {
	cluster => 1,
	quorum => 1,
	node => 1,
	group => 1,
    };

    my $handlers = {
	Init => sub {
	    my $expat = shift;
	    $expat->{NodeList} = [];
	},
	Final => sub {
	    my $expat = shift;
	    $expat->{NodeList};
	},
	Start => sub {
	    my $expat = shift;
	    my $tag = shift;
	    if ($extract_tags->{$tag}) { 
		my $node = &$createNode($expat, $tag, @_);
		push @{$expat->{NodeList}}, $node;
	    }
	},
    };
 
    my $data = [];
    if ($raw) {
	my $parser = new XML::Parser(Handlers => $handlers);
	$data = $parser->parse($raw);
    }
    return $data;
};

__PACKAGE__->register_method({
    name => 'get_status', 
    path => 'status', 
    method => 'GET',
    description => "Get cluster status informations.",
    permissions => { user => 'all' },
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

	if ($members) {
	    my $cmd = ['clustat', '-x'];
	    my $out = '';
	    PVE::Tools::run_command($cmd, outfunc => sub { $out .= shift; });
	    return &$parse_clustat($clinfo, $members, $nodename, $out);
	} else {
	    # fake entry for local node if no cluster defined
	    my $pmxcfs = ($clinfo && $clinfo->{version}) ? 1 : 0; # pmxcfs online ?
	    return [{
		type => 'node',
		id => "node/$nodename",
		name => $nodename,
		'local' => 1,
		nodeid => 0,
		pmxcfs => $pmxcfs,
		state => 1
	    }];
	}
    }});

1;
