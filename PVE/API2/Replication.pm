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

my $extract_job_status = sub {
    my ($jobcfg, $jobid) = @_;

    # Note: we modify $jobcfg
    my $state = delete $jobcfg->{state};
    my $data = $jobcfg;

    $data->{id} = $jobid;

    foreach my $k (qw(last_sync last_try fail_count error duration)) {
	$data->{$k} = $state->{$k} if defined($state->{$k});
    }

    if ($state->{pid} && $state->{ptime}) {
	if (PVE::ProcFSTools::check_process_running($state->{pid}, $state->{ptime})) {
	    $data->{pid} = $state->{pid};
	}
    }

    return $data;
};

__PACKAGE__->register_method ({
    name => 'status',
    path => '',
    method => 'GET',
    description => "List status of all replication jobs on this node.",
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
	    guest => get_standard_option('pve-vmid', {
		optional => 1,
		description => "Only list replication jobs for this guest.",
	    }),
	},
    },
    returns => {
	type => 'array',
	items => {
	    type => "object",
	    properties => {
		id => { type => 'string' },
	    },
	},
	links => [ { rel => 'child', href => "{id}" } ],
    },
    code => sub {
	my ($param) = @_;

	my $rpcenv = PVE::RPCEnvironment::get();
	my $authuser = $rpcenv->get_user();

	my $jobs = PVE::Replication::job_status();

	my $res = [];
	foreach my $id (sort keys %$jobs) {
	    my $data = $extract_job_status->($jobs->{$id}, $id);
	    my $guest = $data->{guest};
	    next if defined($param->{guest}) && $guest != $param->{guest};
	    next if !$rpcenv->check($authuser, "/vms/$guest", [ 'VM.Audit' ]);
	    push @$res, $data;
	}

	return $res;
    }});

__PACKAGE__->register_method ({
    name => 'index',
    path => '{id}',
    method => 'GET',
    permissions => { user => 'all' },
    description => "Directory index.",
    parameters => {
	additionalProperties => 0,
	properties => {
	    id => get_standard_option('pve-replication-id'),
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
	    { name => 'log' },
	    { name => 'status' },
	    ];
    }});


__PACKAGE__->register_method ({
    name => 'job_status',
    path => '{id}/status',
    method => 'GET',
    description => "Get replication job status.",
    permissions => {
	description => "Requires the VM.Audit permission on /vms/<vmid>.",
	user => 'all',
    },
    protected => 1,
    proxyto => 'node',
    parameters => {
	additionalProperties => 0,
	properties => {
	    id => get_standard_option('pve-replication-id'),
	    node => get_standard_option('pve-node'),
	},
    },
    returns => {
	type => "object",
	properties => {},
    },
    code => sub {
	my ($param) = @_;

	my $rpcenv = PVE::RPCEnvironment::get();
	my $authuser = $rpcenv->get_user();

	my $jobs = PVE::Replication::job_status();
	my $jobid = $param->{id};
	my $jobcfg = $jobs->{$jobid};

	die "no such replication job '$jobid'\n" if !defined($jobcfg);

	my $data = $extract_job_status->($jobcfg, $jobid);
	my $guest = $data->{guest};

	raise_perm_exc() if !$rpcenv->check($authuser, "/vms/$guest", [ 'VM.Audit' ]);

	return $data;
    }});

__PACKAGE__->register_method({
    name => 'read_job_log',
    path => '{id}/log',
    method => 'GET',
    permissions => {
	description => "Requires the VM.Audit permission on /vms/<vmid>, or 'Sys.Audit' on '/nodes/<node>'",
	user => 'all',
    },
    protected => 1,
    description => "Read replication job log.",
    proxyto => 'node',
    parameters => {
	additionalProperties => 0,
	properties => {
	    id => get_standard_option('pve-replication-id'),
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
	my $authuser = $rpcenv->get_user();

	my $jobid = $param->{id};
	my $filename = PVE::Replication::job_logfile_name($jobid);

	my $cfg = PVE::ReplicationConfig->new();
	my $data = $cfg->{ids}->{$jobid};

	die "no such replication job '$jobid'\n" if !defined($data);

	my $node = $param->{node};

	my $vmid = $data->{guest};
	raise_perm_exc() if (!($rpcenv->check($authuser, "/vms/$vmid", [ 'VM.Audit' ]) ||
			       $rpcenv->check($authuser, "/nodes/$node", [ 'Sys.Audit' ])));

	my ($count, $lines) = PVE::Tools::dump_logfile($filename, $param->{start}, $param->{limit});

	$rpcenv->set_result_attrib('total', $count);

	return $lines;
    }});

1;
