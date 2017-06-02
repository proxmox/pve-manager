package PVE::API2::Replication;

use warnings;
use strict;

use PVE::JSONSchema qw(get_standard_option);
use PVE::RPCEnvironment;
use PVE::ProcFSTools;
use PVE::ReplicationConfig;
use PVE::Replication;

use PVE::RESTHandler;

use base qw(PVE::RESTHandler);

__PACKAGE__->register_method ({
    name => 'index',
    path => '',
    method => 'GET',
    permissions => { user => 'all' },
    description => "Directory index.",
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

	return [
	    { name => 'status' },
	];
    }});


__PACKAGE__->register_method ({
    name => 'status',
    path => 'status',
    method => 'GET',
    description => "List replication job status.",
    permissions => {
	description => "Requires the VM.Audit permission on /vms/<vmid>.",
	user => 'all',
    },
    protected => 1,
    proxyto => 'node',
    parameters => {
	additionalProperties => 0,
	properties => {
	    node => get_standard_option('pve-node'),
	    vmid => get_standard_option('pve-vmid', {
		optional => 1,
		description => "Only list replication jobs for this vmid.",
	    }),
	},
    },
    returns => {
	type => 'array',
	items => {
	    type => "object",
	    properties => {},
	},
	links => [ { rel => 'child', href => "{vmid}" } ],
    },
    code => sub {
	my ($param) = @_;

	my $rpcenv = PVE::RPCEnvironment::get();
	my $authuser = $rpcenv->get_user();

	my $jobs = PVE::Replication::job_status();

	my $res = [];
	foreach my $id (sort keys %$jobs) {
	    my $d = $jobs->{$id};
	    my $state = delete $d->{state};
	    my $vmid = $d->{guest};
	    next if defined($param->{vmid}) && $vmid != $param->{vmid};
	    next if !$rpcenv->check($authuser, "/vms/$vmid", [ 'VM.Audit' ]);
	    $d->{id} = $id;
	    foreach my $k (qw(last_sync last_try fail_count error duration)) {
		$d->{$k} = $state->{$k} if defined($state->{$k});
	    }
	    if ($state->{pid} && $state->{ptime}) {
		if (PVE::ProcFSTools::check_process_running($state->{pid}, $state->{ptime})) {
		    $d->{pid} = $state->{pid};
		}
	    }
	    push @$res, $d;
	}

	return $res;
    }});

1;
