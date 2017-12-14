package PVE::API2::Replication;

use warnings;
use strict;

use PVE::JSONSchema qw(get_standard_option);
use PVE::RPCEnvironment;
use PVE::ProcFSTools;
use PVE::ReplicationConfig;
use PVE::ReplicationState;
use PVE::Replication;
use PVE::QemuConfig;
use PVE::QemuServer;
use PVE::LXC::Config;
use PVE::LXC;

use PVE::RESTHandler;

use base qw(PVE::RESTHandler);

our $pvesr_lock_path = "/var/lock/pvesr.lck";

our $lookup_guest_class = sub {
    my ($vmtype) = @_;

    if ($vmtype eq 'qemu') {
	return 'PVE::QemuConfig';
    } elsif ($vmtype eq 'lxc') {
	return 'PVE::LXC::Config';
    } else {
	die "unknown guest type '$vmtype' - internal error";
    }
};

# passing $now is useful for regression testing
sub run_single_job {
    my ($jobid, $now, $logfunc) = @_;

    my $local_node = PVE::INotify::nodename();

    my $code = sub {
	$now //= time();

	my $cfg = PVE::ReplicationConfig->new();

	my $jobcfg = $cfg->{ids}->{$jobid};
	die "no such job '$jobid'\n" if !$jobcfg;

	die "internal error - not implemented" if $jobcfg->{type} ne 'local';

	die "job '$jobid' is disabled\n" if $jobcfg->{disable};

	my $vms = PVE::Cluster::get_vmlist();
	my $vmid = $jobcfg->{guest};

	die "no such guest '$vmid'\n" if !$vms->{ids}->{$vmid};

	die "guest '$vmid' is not on local node\n"
	    if $vms->{ids}->{$vmid}->{node} ne $local_node;

	die "unable to sync to local node\n" if $jobcfg->{target} eq $local_node;

	my $vmtype = $vms->{ids}->{$vmid}->{type};

	my $guest_class = $lookup_guest_class->($vmtype);
	PVE::Replication::run_replication($guest_class, $jobcfg, $now, $now, $logfunc);
    };

    my $res = PVE::Tools::lock_file($pvesr_lock_path, 60, $code);
    die $@ if $@;
}

# passing $now and $verbose is useful for regression testing
sub run_jobs {
    my ($now, $logfunc, $verbose, $mail) = @_;

    my $iteration = $now // time();

    my $code = sub {
	my $start_time = $now // time();

	PVE::ReplicationState::purge_old_states();

	while (my $jobcfg = PVE::ReplicationState::get_next_job($iteration, $start_time)) {
	    my $guest_class = $lookup_guest_class->($jobcfg->{vmtype});

	    eval {
		PVE::Replication::run_replication($guest_class, $jobcfg, $iteration, $start_time, $logfunc, $verbose);
	    };
	    if (my $err = $@) {
		warn "$jobcfg->{id}: got unexpected replication job error - $err";
		my $state = PVE::ReplicationState::read_state();
		my $jobstate = PVE::ReplicationState::extract_job_state($state, $jobcfg);
		eval {
		    PVE::Tools::sendmail('root', "Replication Job: $jobcfg->{id} failed", $err)
			if $jobstate->{fail_count} == 1 && $mail;
		};
		warn ": $@" if $@;
	    }

	    $start_time = $now // time();
	}
    };

    my $res = PVE::Tools::lock_file($pvesr_lock_path, 60, $code);
    die $@ if $@;
}

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

	my $jobs = PVE::ReplicationState::job_status(1);

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
	    { name => 'schedule_now' },
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

	my $jobs = PVE::ReplicationState::job_status();
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
	my $filename = PVE::ReplicationState::job_logfile_name($jobid);

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

__PACKAGE__->register_method ({
    name => 'schedule_now',
    path => '{id}/schedule_now',
    method => 'POST',
    description => "Schedule replication job to start as soon as possible.",
    proxyto => 'node',
    protected => 1,
    permissions => {
	check => ['perm', '/storage', ['Datastore.Allocate']],
    },
    parameters => {
	additionalProperties => 0,
	properties => {
	    id => get_standard_option('pve-replication-id'),
	    node => get_standard_option('pve-node'),
	},
    },
    returns => {
	type => 'string',
    },
    code => sub {
	my ($param) = @_;

	my $jobid = $param->{id};

	my $cfg = PVE::ReplicationConfig->new();
	my $jobcfg = $cfg->{ids}->{$jobid};

	die "no such replication job '$jobid'\n" if !defined($jobcfg);

	PVE::ReplicationState::schedule_job_now($jobcfg);

    }});

1;
