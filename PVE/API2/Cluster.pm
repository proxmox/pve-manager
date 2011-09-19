package PVE::API2::Cluster;

use strict;
use warnings;

use PVE::SafeSyslog;
use PVE::Tools qw(extract_param);
use PVE::Cluster qw(cfs_lock_file cfs_read_file cfs_write_file);
use PVE::Storage;
use JSON;

use Data::Dumper; # fixme: remove

use Apache2::Const qw(:http);

use PVE::RESTHandler;
use PVE::RPCEnvironment;

use base qw(PVE::RESTHandler);

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

	my $admin = $rpcenv->check($user, "/", [ 'Sys.Syslog' ]);

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
	properties => {},
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
	my $user = $rpcenv->get_user();

	my $res = [];

	my $nodelist = PVE::Cluster::get_nodelist();
	my $members = PVE::Cluster::get_members();

	my $rrd = PVE::Cluster::rrd_dump();

	my $vmlist = PVE::Cluster::get_vmlist() || {};
	my $idlist = $vmlist->{ids} || {};


	# we try to generate 'numbers' by using "$X + 0"
	foreach my $vmid (keys %$idlist) {
	    my $data = $idlist->{$vmid};

	    next if !$rpcenv->check($user, "/vms/$vmid", [ 'VM.Audit' ]);

	    my $entry = {
		id => "$data->{type}/$vmid",
		vmid => $vmid + 0, 
		node => $data->{node},
		type => $data->{type},
	    };

	    if (my $d = $rrd->{"pve2-vm/$vmid"}) {

		$entry->{uptime} = ($d->[0] || 0) + 0;
		$entry->{name} = $d->[1];

		$entry->{maxcpu} = ($d->[3] || 0) + 0;
		$entry->{cpu} = ($d->[4] || 0) + 0;
		$entry->{maxmem} = ($d->[5] || 0) + 0;
		$entry->{mem} = ($d->[6] || 0) + 0;
		$entry->{maxdisk} = ($d->[7] || 0) + 0;
		$entry->{disk} = ($d->[8] || 0) + 0;
	    }

	    push @$res, $entry;
	}

	foreach my $node (@$nodelist) {
	    my $entry = {
		id => "node/$node",
		node => $node,
		type => "node",
	    };
	    if (my $d = $rrd->{"pve2-node/$node"}) {

		if ($members->{$node} && $members->{$node}->{online}) {
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

	my $cfg = PVE::Storage::config();
	my @sids =  PVE::Storage::storage_ids ($cfg);

	foreach my $storeid (@sids) {
	    my $scfg =  PVE::Storage::storage_config($cfg, $storeid);
	    next if !$rpcenv->check($user, "/storage/$storeid", [ 'Datastore.Audit' ]);
	    # we create a entry for each node
	    foreach my $node (@$nodelist) {
		next if !PVE::Storage::storage_check_enabled($cfg, $storeid, $node, 1);
		my $entry = {
		    id => "storage/$node/$storeid",
		    storage => $storeid, 
		    node => $node, 
		    type => 'storage', 
		}; 

		if (my $d = $rrd->{"pve2-storage/$node/$storeid"}) {
		    $entry->{maxdisk} = ($d->[1] || 0) + 0;
		    $entry->{disk} = ($d->[2] || 0) + 0;
		}

		push @$res, $entry;

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
	my $user = $rpcenv->get_user();

	my $tlist = PVE::Cluster::get_tasklist();

	my $res = [];

	return $res if !$tlist;

	my $all = $rpcenv->check($user, "/", [ 'Sys.Audit' ]);

	foreach my $task (@$tlist) {
	    push @$res, $task if $all || ($task->{user} eq $user);
	}
   
	return $res;
    }});

__PACKAGE__->register_method({
    name => 'get_options', 
    path => 'options', 
    method => 'GET',
    description => "Get datacenter options.",
    permissions => {
	path => '/',
	privs => [ 'Sys.Audit' ],
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
	path => '/',
	privs => [ 'Sys.Modify' ],
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

1;
