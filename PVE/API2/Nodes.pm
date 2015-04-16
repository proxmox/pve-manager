package PVE::API2::Nodes::Nodeinfo;

use strict;
use warnings;
use POSIX qw(LONG_MAX);
use Filesys::Df;
use Time::Local qw(timegm_nocheck);
use HTTP::Status qw(:constants);
use PVE::pvecfg;
use PVE::Tools;
use PVE::API2Tools;
use PVE::ProcFSTools;
use PVE::SafeSyslog;
use PVE::Cluster qw(cfs_read_file);
use PVE::INotify;
use PVE::Exception qw(raise raise_perm_exc);
use PVE::RESTHandler;
use PVE::RPCEnvironment;
use PVE::JSONSchema qw(get_standard_option);
use PVE::AccessControl;
use PVE::Storage;
use PVE::Firewall;
use PVE::APLInfo;
use PVE::HA::Config;
use PVE::QemuServer;
use PVE::API2::Subscription;
use PVE::API2::Services;
use PVE::API2::Network;
use PVE::API2::Tasks;
use PVE::API2::Storage::Scan;
use PVE::API2::Storage::Status;
use PVE::API2::Qemu;
use PVE::API2::VZDump;
use PVE::API2::APT;
use PVE::API2::Ceph;
use PVE::API2::Firewall::Host;
use JSON;

use base qw(PVE::RESTHandler);

__PACKAGE__->register_method ({
    subclass => "PVE::API2::Qemu",  
    path => 'qemu',
});

__PACKAGE__->register_method ({
    subclass => "PVE::API2::Ceph",  
    path => 'ceph',
});

__PACKAGE__->register_method ({
    subclass => "PVE::API2::VZDump",  
    path => 'vzdump',
});

__PACKAGE__->register_method ({
    subclass => "PVE::API2::Services",  
    path => 'services',
});

__PACKAGE__->register_method ({
    subclass => "PVE::API2::Subscription",  
    path => 'subscription',
});

__PACKAGE__->register_method ({
    subclass => "PVE::API2::Network",  
    path => 'network',
});

__PACKAGE__->register_method ({
    subclass => "PVE::API2::Tasks",  
    path => 'tasks',
});

__PACKAGE__->register_method ({
    subclass => "PVE::API2::Storage::Scan",  
    path => 'scan',
});

__PACKAGE__->register_method ({
    subclass => "PVE::API2::Storage::Status",  
    path => 'storage',
});

__PACKAGE__->register_method ({
    subclass => "PVE::API2::APT",  
    path => 'apt',
});

__PACKAGE__->register_method ({
    subclass => "PVE::API2::Firewall::Host",  
    path => 'firewall',
});

__PACKAGE__->register_method ({
    name => 'index', 
    path => '', 
    method => 'GET',
    permissions => { user => 'all' },
    description => "Node index.",
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
    
	my $result = [
	    { name => 'ceph' },
	    { name => 'apt' },
	    { name => 'version' },
	    { name => 'syslog' },
	    { name => 'bootlog' },
	    { name => 'status' },
	    { name => 'subscription' },
	    { name => 'tasks' },
	    { name => 'rrd' }, # fixme: remove?
	    { name => 'rrddata' },# fixme: remove?
	    { name => 'vncshell' },
	    { name => 'spiceshell' },
	    { name => 'time' },
	    { name => 'dns' },
	    { name => 'services' },
	    { name => 'scan' },
	    { name => 'storage' },
	    { name => 'qemu' },
	    { name => 'vzdump' },
	    { name => 'ubcfailcnt' },
	    { name => 'network' },
	    { name => 'aplinfo' },
	    { name => 'startall' },
	    { name => 'stopall' },
	    { name => 'netstat' },
	    { name => 'firewall' },
	    ];

	return $result;
    }});

__PACKAGE__->register_method ({
    name => 'version', 
    path => 'version',
    method => 'GET',
    proxyto => 'node',
    permissions => { user => 'all' },
    description => "API version details",
    parameters => {
    	additionalProperties => 0,
	properties => {
	    node => get_standard_option('pve-node'),
	},
    },
    returns => {
	type => "object",
	properties => {
	    version => { type => 'string' },
	    release => { type => 'string' },
	    repoid => { type => 'string' },
	},
    },
    code => sub {
	my ($resp, $param) = @_;
    
	return PVE::pvecfg::version_info();
    }});

__PACKAGE__->register_method({
    name => 'status', 
    path => 'status', 
    method => 'GET',
    permissions => {
	check => ['perm', '/nodes/{node}', [ 'Sys.Audit' ]],
    },
    description => "Read node status",
    proxyto => 'node',
    parameters => {
    	additionalProperties => 0,
	properties => {
	    node => get_standard_option('pve-node'),
	},
    },
    returns => {
	type => "object",
	properties => {

	},
    },
    code => sub {
	my ($param) = @_;

	my $res = {
	    uptime => 0,
	    idle => 0,
	};

	my ($uptime, $idle) = PVE::ProcFSTools::read_proc_uptime();
	$res->{uptime} = $uptime;
	
	my ($avg1, $avg5, $avg15) = PVE::ProcFSTools::read_loadavg();
	$res->{loadavg} = [ $avg1, $avg5, $avg15];
   
	my ($sysname, $nodename, $release, $version, $machine) = POSIX::uname();

	$res->{kversion} = "$sysname $release $version";

	$res->{cpuinfo} = PVE::ProcFSTools::read_cpuinfo();

	my $stat = PVE::ProcFSTools::read_proc_stat();
	$res->{cpu} = $stat->{cpu};
	$res->{wait} = $stat->{wait};

	my $meminfo = PVE::ProcFSTools::read_meminfo();
	$res->{memory} = {
	    free => $meminfo->{memfree},
	    total => $meminfo->{memtotal},
	    used => $meminfo->{memused},
	};
	
	$res->{ksm} = {
	    shared => $meminfo->{memshared},
	};

	$res->{swap} = {
	    free => $meminfo->{swapfree},
	    total => $meminfo->{swaptotal},
	    used => $meminfo->{swapused},
	};

	$res->{pveversion} = PVE::pvecfg::package() . "/" .
	    PVE::pvecfg::version_text();

	my $dinfo = df('/', 1);     # output is bytes

	$res->{rootfs} = {
	    total => $dinfo->{blocks},
	    avail => $dinfo->{bavail},
	    used => $dinfo->{used},
	    free => $dinfo->{bavail} - $dinfo->{used},
	};

	return $res;
    }});

__PACKAGE__->register_method({
    name => 'netstat',
    path => 'netstat',
    method => 'GET',
    permissions => {
	check => ['perm', '/nodes/{node}', [ 'Sys.Audit' ]],
    },
    description => "Read tap/vm network device interface counters",
    proxyto => 'node',
    parameters => {
	additionalProperties => 0,
	properties => {
	    node => get_standard_option('pve-node'),
	},
    },
    returns => {
        type => "array",
        items => {
            type => "object",
            properties => {},
        },
    },
    code => sub {
	my ($param) = @_;

	my $res = [ ];

	my $netdev = PVE::ProcFSTools::read_proc_net_dev();
	foreach my $dev (keys %$netdev) {
		next if $dev !~ m/^tap([1-9]\d*)i(\d+)$/;
	        my $vmid = $1;
	        my $netid = $2;

                push(
                    @$res,
                    {
                        vmid => $vmid,
                        dev  => "net$netid",
                        in   => $netdev->{$dev}->{transmit},
                        out  => $netdev->{$dev}->{receive},
                    }
                );
	}

	return $res;
    }});

__PACKAGE__->register_method({
    name => 'execute',
    path => 'execute',
    method => 'POST',
    permissions => {
	check => ['perm', '/nodes/{node}', [ 'Sys.Audit' ]],
    },
    description => "Execute multiple commands in order.",
    proxyto => 'node',
    protected => 1, # avoid problems with proxy code
    parameters => {
	additionalProperties => 0,
	properties => {
	    node => get_standard_option('pve-node'),
	    commands => {
		description => "JSON encoded array of commands.",
		type => "string",
	    }
	},
    },
    returns => {
	type => 'array',
	properties => {

	},
    },
    code => sub {
	my ($param) = @_;
	my $res = [];

	my $rpcenv = PVE::RPCEnvironment::get();
	my $user = $rpcenv->get_user();

	my $commands = eval { decode_json($param->{commands}); };

	die "commands param did not contain valid JSON: $@" if $@;
	die "commands is not an array" if ref($commands) ne "ARRAY";

        foreach my $cmd (@$commands) {
	    eval {
		die "$cmd is not a valid command" if (ref($cmd) ne "HASH" || !$cmd->{path} || !$cmd->{method});
	    
		$cmd->{args} //= {};

		my $path = "nodes/$param->{node}/$cmd->{path}";
		
		my $uri_param = {};
		my ($handler, $info) = PVE::API2->find_handler($cmd->{method}, $path, $uri_param);
		if (!$handler || !$info) {
		    die "no handler for '$path'\n";
		}

		foreach my $p (keys %{$cmd->{args}}) {
		    raise_param_exc({ $p => "duplicate parameter" }) if defined($uri_param->{$p});
		    $uri_param->{$p} = $cmd->{args}->{$p};
		}

		# check access permissions
		$rpcenv->check_api2_permissions($info->{permissions}, $user, $uri_param);

		push @$res, {
		    status => HTTP_OK,
		    data => $handler->handle($info, $uri_param),
		};
	    };
	    if (my $err = $@) {
		my $resp = { status => HTTP_INTERNAL_SERVER_ERROR };
		if (ref($err) eq "PVE::Exception") {
		    $resp->{status} = $err->{code} if $err->{code};
		    $resp->{errors} = $err->{errors} if $err->{errors};
		    $resp->{message} = $err->{msg};
		} else {
		    $resp->{message} = $err;
		}
		push @$res, $resp;
	    }
	}

	return $res;
    }});


__PACKAGE__->register_method({
    name => 'node_cmd', 
    path => 'status', 
    method => 'POST',
    permissions => {
	check => ['perm', '/nodes/{node}', [ 'Sys.PowerMgmt' ]],
    },
    protected => 1,
    description => "Reboot or shutdown a node.",
    proxyto => 'node',
    parameters => {
    	additionalProperties => 0,
	properties => {
	    node => get_standard_option('pve-node'),
	    command => {
		description => "Specify the command.",
		type => 'string',
		enum => [qw(reboot shutdown)],
	    },
	},
    },
    returns => { type => "null" },
    code => sub {
	my ($param) = @_;

	if ($param->{command} eq 'reboot') {
	    system ("(sleep 2;/sbin/reboot)&");
	} elsif ($param->{command} eq 'shutdown') {
	    system ("(sleep 2;/sbin/poweroff)&");
	}

	return undef;
    }});


__PACKAGE__->register_method({
    name => 'rrd', 
    path => 'rrd', 
    method => 'GET',
    protected => 1, # fixme: can we avoid that?
    permissions => {
	check => ['perm', '/nodes/{node}', [ 'Sys.Audit' ]],
    },
    description => "Read node RRD statistics (returns PNG)",
    parameters => {
    	additionalProperties => 0,
	properties => {
	    node => get_standard_option('pve-node'),
	    timeframe => {
		description => "Specify the time frame you are interested in.",
		type => 'string',
		enum => [ 'hour', 'day', 'week', 'month', 'year' ],
	    },
	    ds => {
		description => "The list of datasources you want to display.",
 		type => 'string', format => 'pve-configid-list',
	    },
	    cf => {
		description => "The RRD consolidation function",
 		type => 'string',
		enum => [ 'AVERAGE', 'MAX' ],
		optional => 1,
	    },
	},
    },
    returns => {
	type => "object",
	properties => {
	    filename => { type => 'string' },
	},
    },
    code => sub {
	my ($param) = @_;

	return PVE::Cluster::create_rrd_graph(
	    "pve2-node/$param->{node}", $param->{timeframe}, 
	    $param->{ds}, $param->{cf});

    }});

__PACKAGE__->register_method({
    name => 'rrddata', 
    path => 'rrddata', 
    method => 'GET',
    protected => 1, # fixme: can we avoid that?
    permissions => {
	check => ['perm', '/nodes/{node}', [ 'Sys.Audit' ]],
    },
    description => "Read node RRD statistics",
    parameters => {
    	additionalProperties => 0,
	properties => {
	    node => get_standard_option('pve-node'),
	    timeframe => {
		description => "Specify the time frame you are interested in.",
		type => 'string',
		enum => [ 'hour', 'day', 'week', 'month', 'year' ],
	    },
	    cf => {
		description => "The RRD consolidation function",
 		type => 'string',
		enum => [ 'AVERAGE', 'MAX' ],
		optional => 1,
	    },
	},
    },
    returns => {
	type => "array",
	items => {
	    type => "object",
	    properties => {},
	},
    },
    code => sub {
	my ($param) = @_;

	return PVE::Cluster::create_rrd_data(
	    "pve2-node/$param->{node}", $param->{timeframe}, $param->{cf});
    }});

__PACKAGE__->register_method({
    name => 'syslog', 
    path => 'syslog', 
    method => 'GET',
    description => "Read system log",
    proxyto => 'node',
    permissions => {
	check => ['perm', '/nodes/{node}', [ 'Sys.Syslog' ]],
    },
    protected => 1,
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
	my $user = $rpcenv->get_user();
	my $node = $param->{node};

	my ($count, $lines) = PVE::Tools::dump_logfile("/var/log/syslog", $param->{start}, $param->{limit});

	$rpcenv->set_result_attrib('total', $count);
	    
	return $lines; 
    }});

__PACKAGE__->register_method({
    name => 'bootlog', 
    path => 'bootlog', 
    method => 'GET',
    description => "Read boot log",
    proxyto => 'node',
    permissions => {
	check => ['perm', '/nodes/{node}', [ 'Sys.Syslog' ]],
    },
    protected => 1,
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
	my $user = $rpcenv->get_user();
	my $node = $param->{node};

	my ($count, $lines) = PVE::Tools::dump_logfile("/var/log/boot", $param->{start}, $param->{limit});

	$rpcenv->set_result_attrib('total', $count);
	    
	return $lines; 
    }});

my $sslcert;

__PACKAGE__->register_method ({
    name => 'vncshell', 
    path => 'vncshell',  
    method => 'POST',
    protected => 1,
    permissions => {
	description => "Restricted to users on realm 'pam'",
	check => ['perm', '/nodes/{node}', [ 'Sys.Console' ]],
    },
    description => "Creates a VNC Shell proxy.",
    parameters => {
    	additionalProperties => 0,
	properties => {
	    node => get_standard_option('pve-node'),
	    upgrade => {
		type => 'boolean',
		description => "Run 'apt-get dist-upgrade' instead of normal shell.",
		optional => 1,
		default => 0,
	    },
	    websocket => {
		optional => 1,
		type => 'boolean',
		description => "use websocket instead of standard vnc.",
	    },
	},
    },
    returns => { 
    	additionalProperties => 0,
	properties => {
	    user => { type => 'string' },
	    ticket => { type => 'string' },
	    cert => { type => 'string' },
	    port => { type => 'integer' },
	    upid => { type => 'string' },
	},
    },
    code => sub {
	my ($param) = @_;

	my $rpcenv = PVE::RPCEnvironment::get();

	my ($user, undef, $realm) = PVE::AccessControl::verify_username($rpcenv->get_user());

	raise_perm_exc("realm != pam") if $realm ne 'pam'; 

	raise_perm_exc('user != root@pam') if $param->{upgrade} && $user ne 'root@pam';

	my $node = $param->{node};

	my $authpath = "/nodes/$node";

	my $ticket = PVE::AccessControl::assemble_vnc_ticket($user, $authpath);

	$sslcert = PVE::Tools::file_get_contents("/etc/pve/pve-root-ca.pem", 8192)
	    if !$sslcert;

	my $port = PVE::Tools::next_vnc_port();

	my $remip;

	if ($node ne PVE::INotify::nodename()) {
	    $remip = PVE::Cluster::remote_node_ip($node);
	}

	# NOTE: vncterm VNC traffic is already TLS encrypted,
	# so we select the fastest chipher here (or 'none'?)
	my $remcmd = $remip ? 
	    ['/usr/bin/ssh', '-t', $remip] : [];

	my $shcmd;

	if ($user eq 'root@pam') {
	    if ($param->{upgrade}) {
		my $upgradecmd = "pveupgrade --shell";
		$upgradecmd = PVE::Tools::shellquote($upgradecmd) if $remip;
		$shcmd = [ '/bin/bash', '-c', $upgradecmd ];
	    } else {
		$shcmd = [ '/bin/bash', '-l' ];
	    }
	} else {
	    $shcmd = [ '/bin/login' ];
	}

	my $timeout = 10; 

	my $cmd = ['/usr/bin/vncterm', '-rfbport', $port,
		   '-timeout', $timeout, '-authpath', $authpath, 
		   '-perm', 'Sys.Console'];

	if ($param->{websocket}) {
	    $ENV{PVE_VNC_TICKET} = $ticket; # pass ticket to vncterm 
	    push @$cmd, '-notls', '-listen', 'localhost';
	}

	push @$cmd, '-c', @$remcmd, @$shcmd;

	my $realcmd = sub {
	    my $upid = shift;

	    syslog ('info', "starting vnc proxy $upid\n");

	    my $cmdstr = join (' ', @$cmd);
	    syslog ('info', "launch command: $cmdstr");

	    eval { 
		foreach my $k (keys %ENV) {
		    next if $k eq 'PVE_VNC_TICKET';
		    next if $k eq 'PATH' || $k eq 'TERM' || $k eq 'USER' || $k eq 'HOME';
		    delete $ENV{$k};
		}
		$ENV{PWD} = '/';

		PVE::Tools::run_command($cmd, errmsg => "vncterm failed"); 
	    };
	    if (my $err = $@) {
		syslog ('err', $err);
	    }

	    return;
	};

	my $upid = $rpcenv->fork_worker('vncshell', "", $user, $realcmd);
	
	PVE::Tools::wait_for_vnc_port($port);

	return {
	    user => $user,
	    ticket => $ticket,
	    port => $port, 
	    upid => $upid, 
	    cert => $sslcert, 
	};
    }});

__PACKAGE__->register_method({
    name => 'vncwebsocket',
    path => 'vncwebsocket',
    method => 'GET',
    permissions => { 
	description => "Restricted to users on realm 'pam'. You also need to pass a valid ticket (vncticket).",
	check => ['perm', '/nodes/{node}', [ 'Sys.Console' ]],
    },
    description => "Opens a weksocket for VNC traffic.",
    parameters => {
    	additionalProperties => 0,
	properties => {
	    node => get_standard_option('pve-node'),
	    vncticket => {
		description => "Ticket from previous call to vncproxy.",
		type => 'string',
		maxLength => 512,
	    },
	    port => {
		description => "Port number returned by previous vncproxy call.",
		type => 'integer',
		minimum => 5900,
		maximum => 5999,
	    },
	},
    },
    returns => {
	type => "object",
	properties => {
	    port => { type => 'string' },
	},
    },
    code => sub {
	my ($param) = @_;

	my $rpcenv = PVE::RPCEnvironment::get();

	my ($user, undef, $realm) = PVE::AccessControl::verify_username($rpcenv->get_user());

	raise_perm_exc("realm != pam") if $realm ne 'pam'; 

	my $authpath = "/nodes/$param->{node}";

	PVE::AccessControl::verify_vnc_ticket($param->{vncticket}, $user, $authpath);

	my $port = $param->{port};
	
	return { port => $port };
    }});

__PACKAGE__->register_method ({
    name => 'spiceshell', 
    path => 'spiceshell',  
    method => 'POST',
    protected => 1,
    proxyto => 'node',
    permissions => {
	description => "Restricted to users on realm 'pam'",
	check => ['perm', '/nodes/{node}', [ 'Sys.Console' ]],
    },
    description => "Creates a SPICE shell.",
    parameters => {
    	additionalProperties => 0,
	properties => {
	    node => get_standard_option('pve-node'),
	    proxy => get_standard_option('spice-proxy', { optional => 1 }),
	    upgrade => {
		type => 'boolean',
		description => "Run 'apt-get dist-upgrade' instead of normal shell.",
		optional => 1,
		default => 0,
	    },
	},
    },
    returns => get_standard_option('remote-viewer-config'),
    code => sub {
	my ($param) = @_;

	my $rpcenv = PVE::RPCEnvironment::get();
	my $authuser = $rpcenv->get_user();

	my ($user, undef, $realm) = PVE::AccessControl::verify_username($authuser);

	raise_perm_exc("realm != pam") if $realm ne 'pam'; 

	raise_perm_exc('user != root@pam') if $param->{upgrade} && $user ne 'root@pam';

	my $node = $param->{node};
	my $proxy = $param->{proxy};

	my $authpath = "/nodes/$node";
	my $permissions = 'Sys.Console';

	my $shcmd;

	if ($user eq 'root@pam') {
	    if ($param->{upgrade}) {
		my $upgradecmd = "pveupgrade --shell";
		$shcmd = [ '/bin/bash', '-c', $upgradecmd ];
	    } else {
		$shcmd = [ '/bin/bash', '-l' ];
	    }
	} else {
	    $shcmd = [ '/bin/login' ];
	}

	my $title = "Shell on '$node'";

	return PVE::API2Tools::run_spiceterm($authpath, $permissions, 0, $node, $proxy, $title, $shcmd);
    }});

__PACKAGE__->register_method({
    name => 'dns', 
    path => 'dns', 
    method => 'GET',
    permissions => {
	check => ['perm', '/nodes/{node}', [ 'Sys.Audit' ]],
    },
    description => "Read DNS settings.",
    proxyto => 'node',
    parameters => {
    	additionalProperties => 0,
	properties => {
	    node => get_standard_option('pve-node'),
	},
    },
    returns => {
	type => "object",
   	additionalProperties => 0,
	properties => {
	    search => {
		description => "Search domain for host-name lookup.",
		type => 'string',
		optional => 1,
	    },
	    dns1 => {
		description => 'First name server IP address.',
		type => 'string',
		optional => 1,
	    },		
	    dns2 => {
		description => 'Second name server IP address.',
		type => 'string',
		optional => 1,
	    },		
	    dns3 => {
		description => 'Third name server IP address.',
		type => 'string',
		optional => 1,
	    },		
	},
    },
    code => sub {
	my ($param) = @_;

	my $res = PVE::INotify::read_file('resolvconf');

	return $res;
    }});

__PACKAGE__->register_method({
    name => 'update_dns', 
    path => 'dns', 
    method => 'PUT',
    description => "Write DNS settings.",
    permissions => {
	check => ['perm', '/nodes/{node}', [ 'Sys.Modify' ]],
    },
    proxyto => 'node',
    protected => 1,
    parameters => {
    	additionalProperties => 0,
	properties => {
	    node => get_standard_option('pve-node'),
	    search => {
		description => "Search domain for host-name lookup.",
		type => 'string',
	    },
	    dns1 => {
		description => 'First name server IP address.',
		type => 'string', format => 'ipv4',
		optional => 1,
	    },		
	    dns2 => {
		description => 'Second name server IP address.',
		type => 'string', format => 'ipv4',
		optional => 1,
	    },		
	    dns3 => {
		description => 'Third name server IP address.',
		type => 'string', format => 'ipv4',
		optional => 1,
	    },		
	},
    },
    returns => { type => "null" },
    code => sub {
	my ($param) = @_;

	PVE::INotify::update_file('resolvconf', $param);

	return undef;
    }});

__PACKAGE__->register_method({
    name => 'time', 
    path => 'time', 
    method => 'GET',
    permissions => {
	check => ['perm', '/nodes/{node}', [ 'Sys.Audit' ]],
   },
    description => "Read server time and time zone settings.",
    proxyto => 'node',
    parameters => {
    	additionalProperties => 0,
	properties => {
	    node => get_standard_option('pve-node'),
	},
    },
    returns => {
	type => "object",
   	additionalProperties => 0,
	properties => {
	    timezone => {
		description => "Time zone",
		type => 'string',
	    },
	    time => {
		description => "Seconds since 1970-01-01 00:00:00 UTC.",
		type => 'integer',
		minimum => 1297163644,
	    },
	    localtime => {
		description => "Seconds since 1970-01-01 00:00:00 (local time)",
		type => 'integer',
		minimum => 1297163644,
	    },
        },
    },
    code => sub {
	my ($param) = @_;

	my $ctime = time();
	my $ltime = timegm_nocheck(localtime($ctime));
	my $res = {
	    timezone => PVE::INotify::read_file('timezone'),
	    time => time(),
	    localtime => $ltime,
	};

	return $res;
    }});

__PACKAGE__->register_method({
    name => 'set_timezone', 
    path => 'time', 
    method => 'PUT',
    description => "Set time zone.",
    permissions => {
	check => ['perm', '/nodes/{node}', [ 'Sys.Modify' ]],
    },
    proxyto => 'node',
    protected => 1,
    parameters => {
    	additionalProperties => 0,
	properties => {
	    node => get_standard_option('pve-node'),
	    timezone => {
		description => "Time zone. The file '/usr/share/zoneinfo/zone.tab' contains the list of valid names.",
		type => 'string',
	    },
	},
    },
    returns => { type => "null" },
    code => sub {
	my ($param) = @_;

	PVE::INotify::write_file('timezone', $param->{timezone});

	return undef;
    }});

__PACKAGE__->register_method({
    name => 'aplinfo', 
    path => 'aplinfo', 
    method => 'GET',
    permissions => {
	user => 'all',
    },
    description => "Get list of appliances.",
    proxyto => 'node',
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
    },
    code => sub {
	my ($param) = @_;

	my $res = [];

	my $list = PVE::APLInfo::load_data();

	foreach my $template (keys %{$list->{all}}) {
	    my $pd = $list->{all}->{$template};
	    next if $pd->{'package'} eq 'pve-web-news';
	    push @$res, $pd;
	}

	return $res;
    }});

__PACKAGE__->register_method({
    name => 'apl_download', 
    path => 'aplinfo', 
    method => 'POST',
    permissions => {
	check => ['perm', '/storage/{storage}', ['Datastore.AllocateTemplate']],
    },
    description => "Download appliance templates.",
    proxyto => 'node',
    protected => 1,
    parameters => {
    	additionalProperties => 0,
	properties => {
	    node => get_standard_option('pve-node'),
	    storage => get_standard_option('pve-storage-id'),
	    template => { type => 'string', maxLength => 255 },
	},
    },
    returns => { type => "string" },
    code => sub {
	my ($param) = @_;

	my $rpcenv = PVE::RPCEnvironment::get();

	my $user = $rpcenv->get_user();

	my $node = $param->{node};

	my $list = PVE::APLInfo::load_data();

	my $template = $param->{template};
	my $pd = $list->{all}->{$template};

	raise_param_exc({ template => "no such template"}) if !$pd;

	my $cfg = cfs_read_file("storage.cfg");
	my $scfg = PVE::Storage::storage_check_enabled($cfg, $param->{storage}, $node);

	die "cannot download to storage type '$scfg->{type}'" 
	    if !($scfg->{type} eq 'dir' || $scfg->{type} eq 'nfs');

	die "unknown template type '$pd->{type}'\n" if $pd->{type} ne 'openvz';

	die "storage '$param->{storage}' does not support templates\n" 
	    if !$scfg->{content}->{vztmpl};

	my $src = $pd->{location};
	my $tmpldir = PVE::Storage::get_vztmpl_dir($cfg, $param->{storage});
	my $dest = "$tmpldir/$template";
	my $tmpdest = "$tmpldir/${template}.tmp.$$";

	my $worker = sub  {
	    my $upid = shift;
	    
	    print "starting template download from: $src\n";
	    print "target file: $dest\n";

	    eval {

		if (-f $dest) {
		    my $md5 = (split (/\s/, `md5sum '$dest'`))[0];

		    if ($md5 && (lc($md5) eq lc($pd->{md5sum}))) {
			print "file already exists $md5 - no need to download\n";
			return;
		    }
		}

		local %ENV;
		my $dccfg = PVE::Cluster::cfs_read_file('datacenter.cfg');
		if ($dccfg->{http_proxy}) {
		    $ENV{http_proxy} = $dccfg->{http_proxy};
		}

		my @cmd = ('/usr/bin/wget', '--progress=dot:mega', '-O', $tmpdest, $src);
		if (system (@cmd) != 0) {
		    die "download failed - $!\n";
		}

		my $md5 = (split (/\s/, `md5sum '$tmpdest'`))[0];
		
		if (!$md5 || (lc($md5) ne lc($pd->{md5sum}))) {
		    die "wrong checksum: $md5 != $pd->{md5sum}\n";
		}

		if (system ('mv', $tmpdest, $dest) != 0) {
		    die "unable to save file - $!\n";
		}
	    };
	    my $err = $@;

	    unlink $tmpdest;

	    if ($err) {
		print "\n";
		die $err if $err;
	    }

	    print "download finished\n";
	};

	return $rpcenv->fork_worker('download', undef, $user, $worker);
    }});


my $get_start_stop_list = sub {
    my ($nodename, $autostart) = @_;

    my $haconf = PVE::HA::Config::read_resources_config();
    my $vmlist = PVE::Cluster::get_vmlist();

    my $resList = {};
    foreach my $vmid (keys %{$vmlist->{ids}}) {
	my $d = $vmlist->{ids}->{$vmid};
	my $startup;

	eval { 
	    return if $d->{node} ne $nodename;
	    
	    my $bootorder = LONG_MAX;

	    if ($d->{type} eq 'qemu') {
		my $conf = PVE::QemuServer::load_config($vmid);
		return if $autostart && !$conf->{onboot};

		if ($conf->{startup}) {
		    $startup = PVE::QemuServer::parse_startup($conf->{startup});
		    $startup->{order} = $bootorder if !defined($startup->{order});
		} else {
		    $startup = { order => $bootorder };
		}
	    } else {
		die "unknown VM type '$d->{type}'\n";
	    }

	    # skip ha managed VMs (started by pve-ha-manager)
	    return if defined($haconf->{ids}->{"pvevm:$vmid"});
	    
	    $resList->{$startup->{order}}->{$vmid} = $startup;
	    $resList->{$startup->{order}}->{$vmid}->{type} = $d->{type};
	};
	warn $@ if $@;
    }

    return $resList;
};

__PACKAGE__->register_method ({
    name => 'startall', 
    path => 'startall', 
    method => 'POST',
    protected => 1,
    proxyto => 'node',
    description => "Start all VMs and containers (when onboot=1).",
    parameters => {
    	additionalProperties => 0,
	properties => {
	    node => get_standard_option('pve-node'),
	    force => {
		optional => 1,
		type => 'boolean',
		description => "force if onboot=0.",
	    },
	},
    },
    returns => {
	type => 'string',
    },
    code => sub {
	my ($param) = @_;

	my $rpcenv = PVE::RPCEnvironment::get();
	my $authuser = $rpcenv->get_user();

	my $nodename = $param->{node};
	$nodename = PVE::INotify::nodename() if $nodename eq 'localhost';

	my $force = $param->{force};

	my $code = sub {

	    $rpcenv->{type} = 'priv'; # to start tasks in background

	    # wait up to 10 seconds for quorum
	    for (my $i = 10; $i >= 0; $i--) {
		last if PVE::Cluster::check_cfs_quorum($i != 0 ? 1 : 0);
		sleep(1);
	    }
	    my $autostart = $force ? undef : 1;
	    my $startList = &$get_start_stop_list($nodename, $autostart);

	    # Note: use numeric sorting with <=>
	    foreach my $order (sort {$a <=> $b} keys %$startList) {
		my $vmlist = $startList->{$order};

		foreach my $vmid (sort {$a <=> $b} keys %$vmlist) {
		    my $d = $vmlist->{$vmid};

		    PVE::Cluster::check_cfs_quorum(); # abort when we loose quorum
	    
		    eval {
			my $default_delay = 0;
			my $upid;

			if ($d->{type} eq 'qemu') {
			    $default_delay = 3; # to redruce load
			    return if PVE::QemuServer::check_running($vmid, 1);
			    print STDERR "Starting VM $vmid\n";
			    $upid = PVE::API2::Qemu->vm_start({node => $nodename, vmid => $vmid });
			} else {
			    die "unknown VM type '$d->{type}'\n";
			}

			my $res = PVE::Tools::upid_decode($upid);
			while (PVE::ProcFSTools::check_process_running($res->{pid})) {
			    sleep(1);
			}

			my $status = PVE::Tools::upid_read_status($upid);
			if ($status eq 'OK') {
			    # use default delay to reduce load
			    my $delay = defined($d->{up}) ? int($d->{up}) : $default_delay;
			    if ($delay > 0) {
				print STDERR "Waiting for $delay seconds (startup delay)\n" if $d->{up};
				for (my $i = 0; $i < $delay; $i++) {
				    sleep(1);
				}
			    }
			} else {
			    print STDERR "Starting VM $vmid failed: status\n";
			}
		    };
		    warn $@ if $@;
		}
	    }
	    return;
	};

	return $rpcenv->fork_worker('startall', undef, $authuser, $code);
    }});

my $create_stop_worker = sub {
    my ($nodename, $type, $vmid, $down_timeout) = @_;

    my $upid;
    if ($type eq 'qemu') {
	return if !PVE::QemuServer::check_running($vmid, 1);
	my $timeout =  defined($down_timeout) ? int($down_timeout) : 60*3;
	print STDERR "Stopping VM $vmid (timeout = $timeout seconds)\n";
	$upid = PVE::API2::Qemu->vm_shutdown({node => $nodename, vmid => $vmid, 
					      timeout => $timeout, forceStop => 1 });
    } else {
	die "unknown VM type '$type'\n";
    }

    my $res = PVE::Tools::upid_decode($upid);

    return $res->{pid};
};

__PACKAGE__->register_method ({
    name => 'stopall', 
    path => 'stopall', 
    method => 'POST',
    protected => 1,
    proxyto => 'node',
    description => "Stop all VMs and Containers.",
    parameters => {
    	additionalProperties => 0,
	properties => {
	    node => get_standard_option('pve-node'),
	},
    },
    returns => {
	type => 'string',
    },
    code => sub {
	my ($param) = @_;

	my $rpcenv = PVE::RPCEnvironment::get();
	my $authuser = $rpcenv->get_user();

	my $nodename = $param->{node};
	$nodename = PVE::INotify::nodename() if $nodename eq 'localhost';

	my $code = sub {

	    $rpcenv->{type} = 'priv'; # to start tasks in background

	    my $stopList = &$get_start_stop_list($nodename);

	    my $cpuinfo = PVE::ProcFSTools::read_cpuinfo();
	    my $maxWorkers = $cpuinfo->{cpus};

	    foreach my $order (sort {$b <=> $a} keys %$stopList) {
		my $vmlist = $stopList->{$order};
		my $workers = {};
		foreach my $vmid (sort {$b <=> $a} keys %$vmlist) {
		    my $d = $vmlist->{$vmid};
		    my $pid;
		    eval { $pid = &$create_stop_worker($nodename, $d->{type}, $vmid, $d->{down}); };
		    warn $@ if $@;
		    next if !$pid;
		
		    $workers->{$pid} = 1;
		    while (scalar(keys %$workers) >= $maxWorkers) {
			foreach my $p (keys %$workers) {
			    if (!PVE::ProcFSTools::check_process_running($p)) {
				delete $workers->{$p};
			    }
			}
			sleep(1);
		    }
		}
		while (scalar(keys %$workers)) {
		    foreach my $p (keys %$workers) {
			if (!PVE::ProcFSTools::check_process_running($p)) {
			    delete $workers->{$p};
			}
		    }
		    sleep(1);
		}
	    }
	    return;
	};

	return $rpcenv->fork_worker('stopall', undef, $authuser, $code);
	
    }});

my $create_migrate_worker = sub {
    my ($nodename, $type, $vmid, $target) = @_;

    my $upid;
    if ($type eq 'qemu') {
	my $online = PVE::QemuServer::check_running($vmid, 1) ? 1 : 0;
	print STDERR "Migrating VM $vmid\n";
	$upid = PVE::API2::Qemu->migrate_vm({node => $nodename, vmid => $vmid, target => $target,
					      online => $online });
    } else {
	die "unknown VM type '$type'\n";
    }

    my $res = PVE::Tools::upid_decode($upid);

    return $res->{pid};
};

__PACKAGE__->register_method ({
    name => 'migrateall',
    path => 'migrateall',
    method => 'POST',
    proxyto => 'node',
    protected => 1,
    description => "Migrate all VMs and Containers.",
    parameters => {
	additionalProperties => 0,
	properties => {
	    node => get_standard_option('pve-node'),
            target => get_standard_option('pve-node', { description => "Target node." }),
            maxworkers => {
                description => "Max parralel migration job.",
                type => 'integer',
                minimum => 1
            },
	},
    },
    returns => {
	type => 'string',
    },
    code => sub {
	my ($param) = @_;

	my $rpcenv = PVE::RPCEnvironment::get();
	my $authuser = $rpcenv->get_user();

	my $nodename = $param->{node};
	$nodename = PVE::INotify::nodename() if $nodename eq 'localhost';

        my $target = $param->{target};
        my $maxWorkers = $param->{maxworkers};

	my $code = sub {

	    $rpcenv->{type} = 'priv'; # to start tasks in background

	    my $migrateList = &$get_start_stop_list($nodename);

	    foreach my $order (sort {$b <=> $a} keys %$migrateList) {
		my $vmlist = $migrateList->{$order};
		my $workers = {};
		foreach my $vmid (sort {$b <=> $a} keys %$vmlist) {
		    my $d = $vmlist->{$vmid};
		    my $pid;
		    eval { $pid = &$create_migrate_worker($nodename, $d->{type}, $vmid, $target); };
		    warn $@ if $@;
		    next if !$pid;

		    $workers->{$pid} = 1;
		    while (scalar(keys %$workers) >= $maxWorkers) {
			foreach my $p (keys %$workers) {
			    if (!PVE::ProcFSTools::check_process_running($p)) {
				delete $workers->{$p};
			    }
			}
			sleep(1);
		    }
		}
		while (scalar(keys %$workers)) {
		    foreach my $p (keys %$workers) {
			if (!PVE::ProcFSTools::check_process_running($p)) {
			    delete $workers->{$p};
			}
		    }
		    sleep(1);
		}
	    }
	    return;
	};

	return $rpcenv->fork_worker('migrateall', undef, $authuser, $code);

    }});

package PVE::API2::Nodes;

use strict;
use warnings;

use PVE::SafeSyslog;
use PVE::Cluster;
use PVE::RESTHandler;
use PVE::RPCEnvironment;
use PVE::API2Tools;

use base qw(PVE::RESTHandler);

__PACKAGE__->register_method ({
    subclass => "PVE::API2::Nodes::Nodeinfo",  
    path => '{node}',
});

__PACKAGE__->register_method ({
    name => 'index', 
    path => '', 
    method => 'GET',
    permissions => { user => 'all' },
    description => "Cluster node index.",
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
	links => [ { rel => 'child', href => "{node}" } ],
    },
    code => sub {
	my ($param) = @_;
 
	my $clinfo = PVE::Cluster::get_clinfo();
	my $res = [];

	my $nodelist = PVE::Cluster::get_nodelist();
	my $members = PVE::Cluster::get_members();
	my $rrd = PVE::Cluster::rrd_dump();

	foreach my $node (@$nodelist) {
	    my $entry = PVE::API2Tools::extract_node_stats($node, $members, $rrd);
	    push @$res, $entry;
	}

	return $res;
    }});

1;
