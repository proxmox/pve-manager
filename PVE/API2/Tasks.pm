package PVE::API2::Tasks;

use strict;
use warnings;
use POSIX;
use IO::File;
use File::ReadBackwards;
use PVE::Tools;
use PVE::SafeSyslog;
use PVE::RESTHandler;
use PVE::ProcFSTools;
use PVE::RPCEnvironment;
use PVE::JSONSchema qw(get_standard_option);
use PVE::AccessControl;

use base qw(PVE::RESTHandler);

__PACKAGE__->register_method({
    name => 'node_tasks', 
    path => '', 
    method => 'GET',
    permissions => { 
	description => "List task associated with the current user, or all task the user has 'Sys.Audit' permissions on /nodes/<node> (the <node> the task runs on).",
	user => 'all' 
    },
    description => "Read task list for one node (finished tasks).",
    proxyto => 'node',
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
	    userfilter => {
		type => 'string',
		optional => 1,
	    },
	    vmid => get_standard_option('pve-vmid', {
		description => "Only list tasks for this VM.",
		optional => 1 
	    }),
	    errors => {
		type => 'boolean',
		optional => 1,
	    },
	},
    },
    returns => {
	type => 'array',
	items => {
	    type => "object",
	    properties => {
		upid => { type => 'string' },
	    },
	},
	links => [ { rel => 'child', href => "{upid}" } ],
    },
    code => sub {
	my ($param) = @_;

	my $rpcenv = PVE::RPCEnvironment::get();
	my $user = $rpcenv->get_user();

	my $res = [];

	my $filename = "/var/log/pve/tasks/index";

	my $node = $param->{node};
	my $start = $param->{start} || 0;
	my $limit = $param->{limit} || 50;
	my $userfilter = $param->{userfilter};
	my $errors = $param->{errors};

	my $count = 0;
	my $line;

	my $auditor = $rpcenv->check($user, "/nodes/$node", [ 'Sys.Audit' ], 1);

	my $parse_line = sub {
	    if ($line =~ m/^(\S+)(\s([0-9A-Za-z]{8})(\s(\S.*))?)?$/) {
		my $upid = $1;
		my $endtime = $3;
		my $status = $5;
		if ((my $task = PVE::Tools::upid_decode($upid, 1))) {
		    return if $userfilter && $task->{user} !~ m/\Q$userfilter\E/i;
		    return if !($auditor || $user eq $task->{user});

		    return if $errors && $status && $status eq 'OK';

		    return if $param->{vmid} && (!$task->{id} || $task->{id} ne $param->{vmid}); 

		    return if $count++ < $start;
		    return if $limit <= 0;

		    $task->{upid} = $upid;
		    $task->{endtime} = hex($endtime) if $endtime;
		    $task->{status} = $status if $status;
		    push @$res, $task;
		    $limit--;
		}
	    }
	};

	if (my $bw = File::ReadBackwards->new($filename)) {	
	    while (defined ($line = $bw->readline)) {
		&$parse_line();
	    }
	    $bw->close();
	}
	if (my $bw = File::ReadBackwards->new("$filename.1")) {	
	    while (defined ($line = $bw->readline)) {
		&$parse_line();
	    }
	    $bw->close();
	}

	$rpcenv->set_result_attrib('total', $count);

	return $res;
    }});

__PACKAGE__->register_method({
    name => 'upid_index', 
    path => '{upid}', 
    method => 'GET',
    description => '', # index helper
    permissions => { user => 'all' },
    parameters => {
    	additionalProperties => 0,
	properties => {
	    node => get_standard_option('pve-node'),
	    upid => { type => 'string' },
	}
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
	    { name => 'status' }
	    ];
    }});

__PACKAGE__->register_method({
    name => 'stop_task', 
    path => '{upid}', 
    method => 'DELETE',
    description => 'Stop a task.',
    permissions => { 
	description => "The user needs 'Sys.Modify' permissions on '/nodes/<node>' if the task does not belong to him.",
	user => 'all', 
    },
    protected => 1,
    proxyto => 'node',
    parameters => {
    	additionalProperties => 0,
	properties => {
	    node => get_standard_option('pve-node'),
	    upid => { type => 'string' },
	}
    },
    returns => { type => 'null' },
    code => sub {
	my ($param) = @_;

	my ($task, $filename) = PVE::Tools::upid_decode($param->{upid}, 1);
	raise_param_exc({ upid => "unable to parse worker upid" }) if !$task;
	raise_param_exc({ upid => "no such task" }) if ! -f $filename;

	my $rpcenv = PVE::RPCEnvironment::get();
	my $user = $rpcenv->get_user();
	my $node = $param->{node};

	if ($user ne $task->{user}) {
	    $rpcenv->check($user, "/nodes/$node", [ 'Sys.Modify' ]);
	}

	PVE::RPCEnvironment->check_worker($param->{upid}, 1);

	return undef;
    }});

__PACKAGE__->register_method({
    name => 'read_task_log', 
    path => '{upid}/log', 
    method => 'GET',
    permissions => { 
	description => "The user needs 'Sys.Audit' permissions on '/nodes/<node>' if the task does not belong to him.",
	user => 'all',
    },
    protected => 1,
    description => "Read task log.",
    proxyto => 'node',
    parameters => {
    	additionalProperties => 0,
	properties => {
	    node => get_standard_option('pve-node'),
	    upid => { type => 'string' },
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

	my ($task, $filename) = PVE::Tools::upid_decode($param->{upid}, 1);
	raise_param_exc({ upid => "unable to parse worker upid" }) if !$task;

	my $rpcenv = PVE::RPCEnvironment::get();
	my $user = $rpcenv->get_user();
	my $node = $param->{node};

	if ($user ne $task->{user})  {
	    $rpcenv->check($user, "/nodes/$node", [ 'Sys.Audit' ]);
	}

	my ($count, $lines) = PVE::Tools::dump_logfile($filename, $param->{start}, $param->{limit});

	$rpcenv->set_result_attrib('total', $count);
	    
	return $lines;
    }});


my $exit_status_cache = {};

__PACKAGE__->register_method({
    name => 'read_task_status', 
    path => '{upid}/status', 
    method => 'GET',
    permissions => { 
	description => "The user needs 'Sys.Audit' permissions on '/nodes/<node>' if the task does not belong to him.",
	user => 'all',
    },
    protected => 1,
    description => "Read task status.",
    proxyto => 'node',
    parameters => {
    	additionalProperties => 0,
	properties => {
	    node => get_standard_option('pve-node'),
	    upid => { type => 'string' },
	},
    },
    returns => {
	type => "object",
	properties => {
	    pid => { 
		type => 'integer'
	    },
	    status => { 
		type => 'string', enum => ['running', 'stopped'], 
	    },
	},
    },
    code => sub {
	my ($param) = @_;

	my ($task, $filename) = PVE::Tools::upid_decode($param->{upid}, 1);
	raise_param_exc({ upid => "unable to parse worker upid" }) if !$task;
	raise_param_exc({ upid => "no such task" }) if ! -f $filename;

	my $lines = [];

	my $rpcenv = PVE::RPCEnvironment::get();
	my $user = $rpcenv->get_user();
	my $node = $param->{node};

	if ($user ne $task->{user}) {
	    $rpcenv->check($user, "/nodes/$node", [ 'Sys.Audit' ]);
	}

	my $pstart = PVE::ProcFSTools::read_proc_starttime($task->{pid});
	$task->{status} = ($pstart && ($pstart == $task->{pstart})) ?
	    'running' : 'stopped';

	$task->{upid} = $param->{upid}; # include upid

	if ($task->{status} eq 'stopped') {
	    if (!defined($exit_status_cache->{$task->{upid}})) {
		$exit_status_cache->{$task->{upid}} = 
		    PVE::Tools::upid_read_status($task->{upid});
	    }
	    $task->{exitstatus} = $exit_status_cache->{$task->{upid}};
	}

	return $task;
    }});

1;
