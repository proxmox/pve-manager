package PVE::API2::Services;

use strict;
use warnings;

use PVE::Tools;
use PVE::SafeSyslog;
use PVE::Cluster;
use PVE::INotify;
use PVE::Exception qw(raise_param_exc);
use PVE::RESTHandler;
use PVE::RPCEnvironment;
use PVE::JSONSchema qw(get_standard_option);
use PVE::AccessControl;
use IO::File;

use base qw(PVE::RESTHandler);

my $service_name_list = [
    'pveproxy', 
    'pvedaemon',
    'spiceproxy',
    'pvestatd',
    'pve-cluster',
    'corosync',
    'pve-firewall',
    'pvefw-logger',
    'pve-ha-crm',
    'pve-ha-lrm',
    'sshd',
    'syslog',
    'cron',
    'postfix',
    'ksmtuned',
    'systemd-timesyncd',
    ];

# since postfix package 3.1.0-3.1 the postfix unit is only here to
# manage subinstances, of which the  default is called "-".
# This is where we look for the daemon status
my $unit_extra_names = {
    postfix => 'postfix@-'
};

my $get_full_service_state = sub {
    my ($service) = @_;
    $service = $unit_extra_names->{$service} if $unit_extra_names->{$service};
    my $res;
    
    my $parser = sub {
	my $line = shift;
	if ($line =~ m/^([^=\s]+)=(.*)$/) {
	    $res->{$1} = $2;
	}
    };

    PVE::Tools::run_command(['systemctl', 'show', $service], outfunc => $parser); 
    
    return $res;
};

my $static_service_list;

sub get_service_list {

    return $static_service_list if $static_service_list;
    
    my $list = {};
    foreach my $name (@$service_name_list) {
	my $ss;
	eval { $ss = &$get_full_service_state($name); };
	warn $@ if $@;
	next if !$ss;
	next if !defined($ss->{Description});
	$list->{$name} = { name => $name, desc =>  $ss->{Description} };
    }

    $static_service_list = $list;
    
    return $static_service_list;
}


my $service_prop_desc = {
    description => "Service ID",
    type => 'string',
    enum => $service_name_list,
};

my $service_cmd = sub {
    my ($service, $cmd) = @_;

    my $initd_cmd;

    die "unknown service command '$cmd'\n"
	if $cmd !~ m/^(start|stop|restart|reload)$/;

    if ($service eq 'pvecluster' || $service eq 'pvedaemon' || $service eq 'pveproxy') {
	if ($cmd eq 'restart') {    
	    # OK
	} else {
	    die "invalid service cmd '$service $cmd': ERROR";
	}
    }
    
    PVE::Tools::run_command(['systemctl', $cmd, $service]);
};

my $service_state = sub {
    my ($service) = @_;

    my $ss;
    eval { $ss = &$get_full_service_state($service); };
    if (my $err = $@) {
	return 'unknown';
    }

    return $ss->{SubState} if $ss->{SubState};

    return 'unknown';
};

__PACKAGE__->register_method ({
    name => 'index', 
    path => '', 
    method => 'GET',
    permissions => {
	check => ['perm', '/nodes/{node}', [ 'Sys.Audit' ]],
    },
    description => "Service list.",
    proxyto => 'node',
    protected => 1,
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
	links => [ { rel => 'child', href => "{service}" } ],
    },
    code => sub {
	my ($param) = @_;
  
	my $res = [];

	my $service_list = get_service_list();
	
	foreach my $id (keys %{$service_list}) {
	    push @$res, { 
		service => $id,
		name => $service_list->{$id}->{name},
		desc => $service_list->{$id}->{desc},
		state => &$service_state($id),
	    };
	}

	return $res;
    }});

__PACKAGE__->register_method({
    name => 'srvcmdidx',
    path => '{service}', 
    method => 'GET',
    description => "Directory index",
    permissions => {
	check => ['perm', '/nodes/{node}', [ 'Sys.Audit' ]],
    },
    parameters => {
    	additionalProperties => 0,
	properties => {
	    node => get_standard_option('pve-node'),
	    service => $service_prop_desc,
	},
    },
    returns => {
	type => 'array',
	items => {
	    type => "object",
	    properties => {
		subdir => { type => 'string' },
	    },
	},
	links => [ { rel => 'child', href => "{subdir}" } ],
    },
    code => sub {
	my ($param) = @_;

	my $res = [
	    { subdir => 'state' },
	    { subdir => 'start' },
	    { subdir => 'stop' },
	    { subdir => 'restart' },
	    { subdir => 'reload' },
	    ];
	
	return $res;
    }});

__PACKAGE__->register_method ({
    name => 'service_state', 
    path => '{service}/state', 
    method => 'GET',
    permissions => {
	check => ['perm', '/nodes/{node}', [ 'Sys.Audit' ]],
    },
    description => "Read service properties",
    proxyto => 'node',
    protected => 1,
    parameters => {
    	additionalProperties => 0,
	properties => {
	    node => get_standard_option('pve-node'),
	    service => $service_prop_desc,
	},
    },
    returns => {
	type => "object",
	properties => {},
    },
    code => sub {
	my ($param) = @_;
  
	my $service_list = get_service_list();
	
	my $si = $service_list->{$param->{service}};
	return {
	    service => $param->{service},
	    name => $si->{name},
	    desc => $si->{desc},
	    state => &$service_state($param->{service}),
	};
    }});

__PACKAGE__->register_method ({
    name => 'service_start', 
    path => '{service}/start', 
    method => 'POST',
    description => "Start service.",
    permissions => {
	check => ['perm', '/nodes/{node}', [ 'Sys.Modify' ]],
    },
    proxyto => 'node',
    protected => 1,
    parameters => {
    	additionalProperties => 0,
	properties => {
	    node => get_standard_option('pve-node'),
	    service => $service_prop_desc,
	},
    },
    returns => { 
	type => 'string',
    },
    code => sub {
	my ($param) = @_;
  
	my $rpcenv = PVE::RPCEnvironment::get();

	my $user = $rpcenv->get_user();

	my $realcmd = sub {
	    my $upid = shift;

	    syslog('info', "starting service $param->{service}: $upid\n");

	    &$service_cmd($param->{service}, 'start');

	};

	return $rpcenv->fork_worker('srvstart', $param->{service}, $user, $realcmd);
    }});

__PACKAGE__->register_method ({
    name => 'service_stop', 
    path => '{service}/stop', 
    method => 'POST',
    description => "Stop service.",
    permissions => {
	check => ['perm', '/nodes/{node}', [ 'Sys.Modify' ]],
    },
    proxyto => 'node',
    protected => 1,
    parameters => {
    	additionalProperties => 0,
	properties => {
	    node => get_standard_option('pve-node'),
	    service => $service_prop_desc,
	},
    },
    returns => { 
	type => 'string',
    },
    code => sub {
	my ($param) = @_;
  
	my $rpcenv = PVE::RPCEnvironment::get();

	my $user = $rpcenv->get_user();

	my $realcmd = sub {
	    my $upid = shift;

	    syslog('info', "stoping service $param->{service}: $upid\n");

	    &$service_cmd($param->{service}, 'stop');

	};

	return $rpcenv->fork_worker('srvstop', $param->{service}, $user, $realcmd);
    }});

__PACKAGE__->register_method ({
    name => 'service_restart', 
    path => '{service}/restart', 
    method => 'POST',
    description => "Restart service.",
    permissions => {
	check => ['perm', '/nodes/{node}', [ 'Sys.Modify' ]],
    },
    proxyto => 'node',
    protected => 1,
    parameters => {
    	additionalProperties => 0,
	properties => {
	    node => get_standard_option('pve-node'),
	    service => $service_prop_desc,
	},
    },
    returns => { 
	type => 'string',
    },
    code => sub {
	my ($param) = @_;
  
	my $rpcenv = PVE::RPCEnvironment::get();

	my $user = $rpcenv->get_user();

	my $realcmd = sub {
	    my $upid = shift;

	    syslog('info', "re-starting service $param->{service}: $upid\n");

	    &$service_cmd($param->{service}, 'restart');

	};

	return $rpcenv->fork_worker('srvrestart', $param->{service}, $user, $realcmd);
    }});

__PACKAGE__->register_method ({
    name => 'service_reload', 
    path => '{service}/reload', 
    method => 'POST',
    description => "Reload service.",
    permissions => {
	check => ['perm', '/nodes/{node}', [ 'Sys.Modify' ]],
    },
    proxyto => 'node',
    protected => 1,
    parameters => {
    	additionalProperties => 0,
	properties => {
	    node => get_standard_option('pve-node'),
	    service => $service_prop_desc,
	},
    },
    returns => { 
	type => 'string',
    },
    code => sub {
	my ($param) = @_;
  
	my $rpcenv = PVE::RPCEnvironment::get();

	my $user = $rpcenv->get_user();

	my $realcmd = sub {
	    my $upid = shift;

	    syslog('info', "reloading service $param->{service}: $upid\n");

	    &$service_cmd($param->{service}, 'reload');

	};

	return $rpcenv->fork_worker('srvreload', $param->{service}, $user, $realcmd);
    }});
