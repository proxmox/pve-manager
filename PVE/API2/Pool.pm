package PVE::API2::Pool;

use strict;
use warnings;
use PVE::Exception qw(raise_param_exc);
use PVE::INotify;
use PVE::Cluster qw (cfs_read_file cfs_write_file);
use PVE::AccessControl;
use PVE::Storage;

use PVE::SafeSyslog;

use Data::Dumper; # fixme: remove

use PVE::API2Tools;
use PVE::RESTHandler;

use base qw(PVE::RESTHandler);

__PACKAGE__->register_method ({
    name => 'index', 
    path => '', 
    method => 'GET',
    description => "Pool index.",
    permissions => { 
	description => "List all pools where you have Pool.Allocate or VM.Allocate permissions on /pool/<pool>.",
	user => 'all',
    },
    parameters => {
	additionalProperties => 0,
	properties => {},
    },
    returns => {
	type => 'array',
	items => {
	    type => "object",
	    properties => {
		poolid => { type => 'string' },
	    },
	},
	links => [ { rel => 'child', href => "{poolid}" } ],
    },
    code => sub {
	my ($param) = @_;
    
	my $rpcenv = PVE::RPCEnvironment::get();
	my $authuser = $rpcenv->get_user();

	my $res = [];

	my $usercfg = $rpcenv->{user_cfg};

	foreach my $pool (keys %{$usercfg->{pools}}) {
	    next if !$rpcenv->check_any($authuser, "/pool/$pool", [ 'Pool.Allocate', 'VM.Allocate' ], 1);

	    my $entry = { poolid => $pool };
	    my $data = $usercfg->{pools}->{$pool};
	    $entry->{comment} = $data->{comment} if defined($data->{comment});
	    push @$res, $entry;
	}

	return $res;
    }});

__PACKAGE__->register_method ({
    name => 'create_pool', 
    protected => 1,
    path => '', 
    method => 'POST',
    permissions => { 
	check => ['perm', '/pool/{poolid}', ['Pool.Allocate']],
    },
    description => "Create new pool.",
    parameters => {
   	additionalProperties => 0,
	properties => {
	    poolid => { type => 'string', format => 'pve-poolid' },
	    comment => { type => 'string', optional => 1 },
	},
    },
    returns => { type => 'null' },
    code => sub {
	my ($param) = @_;

	PVE::AccessControl::lock_user_config(
	    sub {
			
		my $usercfg = cfs_read_file("user.cfg");

		my $pool = $param->{poolid};

		die "pool '$pool' already exists\n" 
		    if $usercfg->{pools}->{$pool};

		$usercfg->{pools}->{$pool} = { vms => {}, storage => {} };

		$usercfg->{pools}->{$pool}->{comment} = $param->{comment} if $param->{comment};

		cfs_write_file("user.cfg", $usercfg);
	    }, "create pool failed");

	return undef;
    }});

__PACKAGE__->register_method ({
    name => 'update_pool', 
    protected => 1,
    path => '{poolid}', 
    method => 'PUT',
    permissions => { 
	description => "You also need the right to modify permissions on any object you add/delete.",
	check => ['perm', '/pool/{poolid}', ['Pool.Allocate']],
    },
    description => "Update pool data.",
    parameters => {
   	additionalProperties => 0,
	properties => {
	    poolid => { type => 'string', format => 'pve-poolid' },
	    comment => { type => 'string', optional => 1 },
	    vms => { 
		description => "List of virtual machines.",
		type => 'string',  format => 'pve-vmid-list',  
		optional => 1,
	    },
	    storage => { 
		description => "List of storage IDs.",
		type => 'string',  format => 'pve-storage-id-list',  
		optional => 1,
	    },
	    delete => {
		description => "Remove vms/storage (instead of adding it).",
		type => 'boolean', 
		optional => 1,
	    },
	},
    },
    returns => { type => 'null' },
    code => sub {
	my ($param) = @_;

	my $rpcenv = PVE::RPCEnvironment::get();
	my $authuser = $rpcenv->get_user();

	PVE::AccessControl::lock_user_config(
	    sub {
			
		my $usercfg = cfs_read_file("user.cfg");

		my $pool = $param->{poolid};
	
		my $data = $usercfg->{pools}->{$pool};

		die "pool '$pool' does not exist\n" 
		    if !$data;

		$data->{comment} = $param->{comment} if defined($param->{comment});
		
		if (defined($param->{vms})) {
		    foreach my $vmid (PVE::Tools::split_list($param->{vms})) {
			$rpcenv->check_perm_modify($authuser, "/vms/$vmid");
			if ($param->{delete}) {
			    die "VM $vmid is not a pool member\n"
				if !$data->{vms}->{$vmid};
			    delete $data->{vms}->{$vmid};
			    delete $usercfg->{vms}->{$vmid};
			} else {
			    die "VM $vmid is already a pool member\n"
				if $data->{vms}->{$vmid};
			    die "VM $vmid belongs to pool '$usercfg->{vms}->{$vmid}'\n"
				if $usercfg->{vms}->{$vmid};

			    $data->{vms}->{$vmid} = 1;
			    $usercfg->{vms}->{$vmid} = $pool;
			}
		    }
		}

		if (defined($param->{storage})) {
		    foreach my $storeid (PVE::Tools::split_list($param->{storage})) {
			$rpcenv->check_perm_modify($authuser, "/storage/$storeid");
			if ($param->{delete}) {
			    die "Storage '$storeid' is not a pool member\n"
				if !$data->{storage}->{$storeid};
			    delete $data->{storage}->{$storeid};
			} else {
			    die "Storage '$storeid' is already a pool member\n"
				if $data->{storage}->{$storeid};

			    $data->{storage}->{$storeid} = 1;
			}
		    }
		}

		cfs_write_file("user.cfg", $usercfg);
	    }, "update pools failed");

	return undef;
    }});

__PACKAGE__->register_method ({
    name => 'read_pool', 
    path => '{poolid}', 
    method => 'GET',
    permissions => { 
	check => ['perm', '/pool/{poolid}', ['Pool.Allocate']],
    },
    description => "Get pool configuration.",
    parameters => {
   	additionalProperties => 0,
	properties => {
	    poolid => {type => 'string', format => 'pve-poolid' },
	},
    },
    returns => {
	type => "object",
	additionalProperties => 0,
	properties => {
	    comment => { type => 'string', optional => 1 },
	    members => {
		type => 'array',
		items => {
		    type => "object",
		    additionalProperties => 1,
		    properties => {
			type => { type => 'string', enum => ['qemu', 'lxc', 'openvz', 'storage'] },
			id => { type => 'string' },
			node => { type => 'string' },
			vmid => { type => 'integer', optional => 1 },
			storage => { type => 'string', optional => 1 },
		    },
		},
	    },
	},
    },
    code => sub {
	my ($param) = @_;

	my $usercfg = cfs_read_file("user.cfg");

	my $vmlist = PVE::Cluster::get_vmlist() || {};
	my $idlist = $vmlist->{ids} || {};

	my $rrd = PVE::Cluster::rrd_dump();

	my $pool = $param->{poolid};
	
	my $data = $usercfg->{pools}->{$pool};

	die "pool '$pool' does not exist\n" 
	    if !$data;
 
	my $members = [];

	foreach my $vmid (keys %{$data->{vms}}) {
	    my $vmdata = $idlist->{$vmid};
	    next if !$vmdata;
	    my $entry = PVE::API2Tools::extract_vm_stats($vmid, $vmdata, $rrd);
	    push @$members, $entry;
	}

	my $nodename = PVE::INotify::nodename();
	my $cfg = PVE::Storage::config();
	foreach my $storeid (keys %{$data->{storage}}) {
	    my $scfg = PVE::Storage::storage_config ($cfg, $storeid, 1);
	    next if !$scfg;

	    my $node = $nodename;
	    if ($scfg->{nodes}) {
		if (!$scfg->{nodes}->{$node}) {
		    foreach my $n (sort keys(%{$scfg->{nodes}})) {
			$node = $n;
			last;
		    }
		}
	    }

	    my $entry = PVE::API2Tools::extract_storage_stats($storeid, $scfg, $node, $rrd);
	    push @$members, $entry;
	}

	my $res = { members => $members	};
	$res->{comment} = $data->{comment} if defined($data->{comment});

	return $res;
    }});


__PACKAGE__->register_method ({
    name => 'delete_pool', 
    protected => 1,
    path => '{poolid}', 
    method => 'DELETE',
    permissions => { 
	description => "You can only delete empty pools (no members).",
	check => ['perm', '/pool/{poolid}', ['Pool.Allocate']],
    },
    description => "Delete pool.",
    parameters => {
   	additionalProperties => 0,
	properties => {
	    poolid => { type => 'string', format => 'pve-poolid' },
	}
    },
    returns => { type => 'null' },
    code => sub {
	my ($param) = @_;

	my $rpcenv = PVE::RPCEnvironment::get();
	my $authuser = $rpcenv->get_user();

	PVE::AccessControl::lock_user_config(
	    sub {

		my $vmlist = PVE::Cluster::get_vmlist() || {};
		my $idlist = $vmlist->{ids} || {};

		my $storecfg = PVE::Storage::config();

		my $usercfg = cfs_read_file("user.cfg");

		my $pool = $param->{poolid};
	
		my $data = $usercfg->{pools}->{$pool};
		
		die "pool '$pool' does not exist\n" 
		    if !$data;

		foreach my $vmid (keys %{$data->{vms}}) {
		    next if !$idlist->{$vmid};
		    die "pool '$pool' is not empty (contains VM $vmid)\n";
		}

		foreach my $storeid (keys %{$data->{storage}}) {
		    next if !PVE::Storage::storage_config ($storecfg, $storeid, 1);
		    die "pool '$pool' is not empty (contains storage '$storeid')\n";
		}

		delete ($usercfg->{pools}->{$pool});

		PVE::AccessControl::delete_pool_acl($pool, $usercfg);

		cfs_write_file("user.cfg", $usercfg);
	    }, "delete pool failed");
	
	return undef;
    }});

1;
