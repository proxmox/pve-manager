package PVE::API2::Pool;

use strict;
use warnings;
use PVE::Exception qw(raise_param_exc);
use PVE::Cluster qw (cfs_read_file cfs_write_file);
use PVE::AccessControl;

use PVE::SafeSyslog;

use Data::Dumper; # fixme: remove

use PVE::RESTHandler;

use base qw(PVE::RESTHandler);

__PACKAGE__->register_method ({
    name => 'index', 
    path => '', 
    method => 'GET',
    description => "Pool index.",
    permissions => { 
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

	my $res = [];

	my $usercfg = $rpcenv->{user_cfg};

	foreach my $pool (keys %{$usercfg->{pools}}) {
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
	check => ['perm', '/access', ['Sys.Modify']],
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
	check => ['perm', '/access', ['Sys.Modify']],
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
			    $usercfg->{vms}->{$vmid} = 1;
			}
		    }
		}

		if (defined($param->{storage})) {
		    foreach my $storeid (PVE::Tools::split_list($param->{storage})) {
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
	check => ['perm', '/access', ['Sys.Audit']],
    },
    description => "Get group configuration.",
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
		    additionalProperties => 0,
		    properties => {
			type => { type => 'string', enum => ['vm', 'storage'] },
			id => { type => 'string' },
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

	my $pool = $param->{poolid};
	
	my $data = $usercfg->{pools}->{$pool};

	die "pool '$pool' does not exist\n" 
	    if !$data;
 
	my $members = [];

	foreach my $vmid (keys %{$data->{vms}}) {
	    push @$members, {
		id => "vm/$vmid",
		vmid => $vmid + 0, 
		type => 'vm',
	    };
	}

	foreach my $storage (keys %{$data->{storage}}) {
	    push @$members, {
		id => "storage/$storage",
		storage => $storage, 
		type => 'storage',
	    };
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
	check => ['perm', '/access', ['Sys.Modify']],
    },
    description => "Delete group.",
    parameters => {
   	additionalProperties => 0,
	properties => {
	    poolid => { type => 'string', format => 'pve-poolid' },
	}
    },
    returns => { type => 'null' },
    code => sub {
	my ($param) = @_;

	PVE::AccessControl::lock_user_config(
	    sub {

		my $usercfg = cfs_read_file("user.cfg");

		my $pool = $param->{poolid};
	
		my $data = $usercfg->{pools}->{$pool};
		
		die "pool '$pool' does not exist\n" 
		    if !$data;
	
		delete ($usercfg->{pools}->{$pool});

		PVE::AccessControl::delete_pool_acl($pool, $usercfg);

		cfs_write_file("user.cfg", $usercfg);
	    }, "delete pool failed");
	
	return undef;
    }});

1;
