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

my $service_list = {
    apache => { name => 'WWW', desc => 'Web/API server' },
    postfix => { name => 'SMTP', desc => 'Simple Mail Tranfer Protocol' },
    ntpd => { name => 'NTP', desc => 'Network time protocol' },
    sshd => { name => 'SSH', desc => 'Secure shell daemon' },
    syslog => { name => 'Syslog', desc => 'Syslog daemon' },
    cron => { name => 'CRON', desc => 'Daemon to execute scheduled commands' },
    pvedaemon => { name => 'NodeManager', desc => 'PVE node manager daemon' },
    corosync => { name => 'CMan', desc => 'CMan/Corosync cluster daemon' },
    # clvm => { name => 'CLVM', desc => 'LVM cluster locking daemon' },
    rgmanager => { name => 'RGManager', desc => 'Resource Group Manager daemon' },
    pvecluster => { name => 'PVECluster', desc => 'Proxmox VE cluster file system' },
};

my $service_prop_desc = {
    description => "Service ID",
    type => 'string',
    enum => [ keys %{$service_list} ],
};

my $service_cmd = sub {
    my ($service, $cmd) = @_;

    my $initd_cmd;

    die "unknown service command '$cmd'\n"
	if $cmd !~ m/^(start|stop|restart|reload)$/;

    if ($service eq 'postfix') {
	$initd_cmd = '/etc/init.d/postfix';
    } elsif ($service eq 'pvecluster') {
	if ($cmd eq 'restart') {    
	    $initd_cmd = '/etc/init.d/pve-cluster';
	} else {
	    die "invalid service cmd 'pve-cluster $cmd': ERROR";
	}
    } elsif ($service eq 'pvedaemon') {
	if ($cmd eq 'restart') {    
	    $initd_cmd = '/etc/init.d/pvedaemon';
	} else {
	    die "invalid service cmd '$service $cmd': ERROR";
	}
    } elsif  ($service eq 'apache') {
	if ($cmd eq 'restart') {    
	    print "graceful apache restart\n";
	    $initd_cmd = '/usr/sbin/apache2ctl';
	    $cmd = 'graceful';
	} else {
	    die "invalid service cmd '$service $cmd': ERROR";
	}
    } elsif  ($service eq 'ntpd') {
	# debian start/stop scripts does not work for us
	if ($cmd eq 'stop') {
	    system ('/etc/init.d/ntp stop');
	    #system ('/usr/bin/killall /usr/sbin/ntpd'); 
	} elsif ($cmd eq 'start') {
	    system ('/etc/init.d/ntp start');
	    system ('/sbin/hwclock --systohc');
	} elsif ($cmd eq 'restart') {
	    system ('/etc/init.d/ntp restart');
	    system ('/sbin/hwclock --systohc');
	    # restart cron/syslog to get right schedules and log time/dates
	    system ('/etc/init.d/rsyslog restart');
	    system ('/etc/init.d/cron restart');
	}
	return 0;
    } elsif  ($service eq 'syslog') {
	$initd_cmd = '/etc/init.d/rsyslog';
    } elsif  ($service eq 'cron') {
	$initd_cmd = '/etc/init.d/cron';
    } elsif  ($service eq 'corosync') {
	$cmd = 'start' if $cmd eq 'restart';
	$initd_cmd = '/etc/init.d/cman';
    } elsif  ($service eq 'clvm') {
	$initd_cmd = '/etc/init.d/clvm';
    } elsif  ($service eq 'rgmanager') {
	$initd_cmd = '/etc/init.d/rgmanager';
    } elsif  ($service eq 'sshd') {
	$initd_cmd = '/etc/init.d/ssh';
    } else {
	die "unknown service '$service': ERROR";
    }    

    PVE::Tools::run_command ([$initd_cmd, $cmd]);
};

my $service_state = sub {
    my ($service) = @_;

    my $pid_file;

    if ($service eq 'postfix') {
	$pid_file = '/var/spool/postfix/pid/master.pid';
    } elsif  ($service eq 'apache') {
	$pid_file = '/var/run/apache2.pid';
    } elsif  ($service eq 'pvedaemon') {
	$pid_file = '/var/run/pvedaemon.pid';
    } elsif  ($service eq 'pvecluster') {
	$pid_file = '/var/run/pve-cluster.pid';
    } elsif  ($service eq 'ntpd') {
	$pid_file = '/var/run/ntpd.pid';
    } elsif  ($service eq 'sshd') {
	$pid_file = '/var/run/sshd.pid';
    } elsif  ($service eq 'cron') {
	$pid_file = '/var/run/crond.pid';
    } elsif  ($service eq 'corosync') {
	$pid_file = '/var/run/corosync.pid';
    } elsif  ($service eq 'clvm') {
	$pid_file = '/var/run/clvmd.pid';
    } elsif  ($service eq 'rgmanager') {
	$pid_file = '/var/run/rgmanager.pid';
    } elsif  ($service eq 'syslog') {
	$pid_file = '/var/run/rsyslogd.pid';
    } else {
	die "unknown service '$service': ERROR";
    }    

    my $pid;
    if (my $fh = IO::File->new ($pid_file, "r")) {
	my $line = <$fh>;
	chomp $line;
	    
	if ($line  && ($line =~ m/^\s*(\d+)\s*$/)) {
	    $pid = $1;
	}
    }

    return 'running' if ($pid && kill (0, $pid));

    return 'stopped';
};

__PACKAGE__->register_method ({
    name => 'index', 
    path => '', 
    method => 'GET',
    permissions => {
	path => '/nodes/{node}',
	privs => [ 'Sys.Audit' ],
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
	path => '/nodes/{node}',
	privs => [ 'Sys.Audit' ],
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

	my $si = $service_list->{$param->{service}};

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

	my $si = $service_list->{$param->{service}};

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

	my $si = $service_list->{$param->{service}};

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

	my $si = $service_list->{$param->{service}};

	my $realcmd = sub {
	    my $upid = shift;

	    syslog('info', "reloading service $param->{service}: $upid\n");

	    &$service_cmd($param->{service}, 'reload');

	};

	return $rpcenv->fork_worker('srvreload', $param->{service}, $user, $realcmd);
    }});
