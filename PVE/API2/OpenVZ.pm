package PVE::API2::OpenVZ;

use strict;
use warnings;
use File::Basename;
use POSIX qw (LONG_MAX);

use PVE::SafeSyslog;
use PVE::Tools qw(extract_param);
use PVE::Cluster qw(cfs_lock_file cfs_read_file);
use PVE::Storage;
use PVE::RESTHandler;
use PVE::RPCEnvironment;
use PVE::OpenVZ;
use PVE::JSONSchema qw(get_standard_option);

use base qw(PVE::RESTHandler);

use Data::Dumper; # fixme: remove

my $pve_base_ovz_config = <<__EOD;
ONBOOT="no"

PHYSPAGES="0:256M"
SWAPPAGES="0:256M"
KMEMSIZE="116M:128M"
DCACHESIZE="58M:64M"
LOCKEDPAGES="128M"
PRIVVMPAGES="unlimited"
SHMPAGES="unlimited"
NUMPROC="unlimited"
VMGUARPAGES="0:unlimited"
OOMGUARPAGES="0:unlimited"
NUMTCPSOCK="unlimited"
NUMFLOCK="unlimited"
NUMPTY="unlimited"
NUMSIGINFO="unlimited"
TCPSNDBUF="unlimited"
TCPRCVBUF="unlimited"
OTHERSOCKBUF="unlimited"
DGRAMRCVBUF="unlimited"
NUMOTHERSOCK="unlimited"
NUMFILE="unlimited"
NUMIPTENT="unlimited"

# Disk quota parameters (in form of softlimit:hardlimit)
DISKSPACE="unlimited:unlimited"
DISKINODES="unlimited:unlimited"
QUOTATIME="0"
QUOTAUGIDLIMIT="0"

# CPU fair scheduler parameter
CPUUNITS="1000"
CPUS="1"
__EOD

__PACKAGE__->register_method({
    name => 'vmlist', 
    path => '', 
    method => 'GET',
    description => "OpenVZ container index (per node).",
    proxyto => 'node',
    protected => 1, # openvz proc files are only readable by root
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
	links => [ { rel => 'child', href => "{vmid}" } ],
    },
    code => sub {
	my ($param) = @_;

	my $vmstatus = PVE::OpenVZ::vmstatus();

	return PVE::RESTHandler::hash_to_array($vmstatus, 'vmid');

    }});

__PACKAGE__->register_method({
    name => 'create_vm', 
    path => '', 
    method => 'POST',
    description => "Create new container.",
    protected => 1,
    proxyto => 'node',
    parameters => {
    	additionalProperties => 0,
	properties => PVE::OpenVZ::json_config_properties({
	    node => get_standard_option('pve-node'),
	    vmid => get_standard_option('pve-vmid'),
	    ostemplate => {
		description => "The OS template.",
		type => 'string', 
		maxLength => 255,
	    },
	    password => { 
		optional => 1, 
		type => 'string',
		description => "Sets root password inside container.",
	    },
	}),
    },
    returns => { 
	type => 'string',
    },
    code => sub {
	my ($param) = @_;

	my $rpcenv = PVE::RPCEnvironment::get();

	my $user = $rpcenv->get_user();

	my $node = extract_param($param, 'node');

	my $vmid = extract_param($param, 'vmid');

	my $password = extract_param($param, 'password');

	my $stcfg = cfs_read_file("storage.cfg");

	my $conf = PVE::OpenVZ::parse_ovz_config("/tmp/openvz/$vmid.conf", $pve_base_ovz_config);

	my $code = sub {

	    my $basecfg_fn = PVE::OpenVZ::config_file($vmid);

	    die "container $vmid already exists\n" if -f $basecfg_fn;

	    my $ostemplate = extract_param($param, 'ostemplate');

	    $ostemplate =~ s|^/var/lib/vz/template/cache/|local:vztmpl/|;

	    if ($ostemplate !~ m|^local:vztmpl/|) {
		$ostemplate = "local:vztmpl/${ostemplate}";
	    }

	    my $tpath = PVE::Storage::path($stcfg, $ostemplate);
	    die "can't find OS template '$ostemplate'\n" if ! -f $tpath;

	    # hack: openvz does not support full paths
	    $tpath = basename($tpath);
	    $tpath =~ s/\.tar\.gz$//;

	    if (!defined($param->{searchdomain}) && 
		!defined($param->{nameserver})) {
	
		my $resolv = PVE::INotify::read_file('resolvconf');

		$param->{searchdomain} = $resolv->{search} if $resolv->{search};

		my @ns = ();
		push @ns, $resolv->{dns1} if  $resolv->{dns1};
		push @ns, $resolv->{dns2} if  $resolv->{dns2};
		push @ns, $resolv->{dns3} if  $resolv->{dns3};

		$param->{nameserver} = join(' ', @ns) if scalar(@ns);
	    }

	    PVE::OpenVZ::update_ovz_config($conf, $param);

	    my $rawconf = PVE::OpenVZ::generate_raw_config($pve_base_ovz_config, $conf);

	    my $realcmd = sub {
		PVE::Tools::file_set_contents($basecfg_fn, $rawconf);

		my $cmd = ['vzctl', '--skiplock', 'create', $vmid, '--ostemplate', $tpath ];

		PVE::Tools::run_command($cmd);

		# hack: vzctl '--userpasswd' starts the CT, but we want 
		# to avoid that for create
		PVE::OpenVZ::set_rootpasswd($vmid, $password) if defined($password);
	    };

	    return $rpcenv->fork_worker('vzcreate', $vmid, $user, $realcmd);
	};

	return PVE::OpenVZ::lock_container($vmid, $code);
    }});

__PACKAGE__->register_method({
    name => 'update_vm', 
    path => '{vmid}/config', 
    method => 'PUT',
    protected => 1,
    proxyto => 'node',
    description => "Set virtual machine options.",
    parameters => {
    	additionalProperties => 0,
	properties => PVE::OpenVZ::json_config_properties(
	    {
		node => get_standard_option('pve-node'),
		vmid => get_standard_option('pve-vmid'),
		digest => {
		    type => 'string',
		    description => 'Prevent changes if current configuration file has different SHA1 digest. This can be used to prevent concurrent modifications.',
		    maxLength => 40,
		    optional => 1,		    
		}
	    }),
    },
    returns => { type => 'null'},
    code => sub {
	my ($param) = @_;

	my $rpcenv = PVE::RPCEnvironment::get();

	my $user = $rpcenv->get_user();

	my $node = extract_param($param, 'node');

	my $vmid = extract_param($param, 'vmid');

	my $digest = extract_param($param, 'digest');

	die "no options specified\n" if !scalar(keys %$param);

	my $code = sub {

	    my $conf = PVE::OpenVZ::load_config($vmid);
	    die "checksum missmatch (file change by other user?)\n" 
		if $digest && $digest ne $conf->{digest};

	    my $changes = PVE::OpenVZ::update_ovz_config($conf, $param);

	    return if scalar (@$changes) <= 0;

	    my $cmd = ['vzctl', '--skiplock', 'set', $vmid, @$changes, '--save'];

	    PVE::Cluster::log_msg('info', $user, "update CT $vmid: " . join(' ', @$changes));
 
	    PVE::Tools::run_command($cmd);
	};

	PVE::OpenVZ::lock_container($vmid, $code);

	return undef;
    }});

__PACKAGE__->register_method({
    name => 'vmdiridx',
    path => '{vmid}', 
    method => 'GET',
    proxyto => 'node',
    description => "Directory index",
    parameters => {
    	additionalProperties => 0,
	properties => {
	    node => get_standard_option('pve-node'),
	    vmid => get_standard_option('pve-vmid'),
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

	# test if VM exists
	my $conf = PVE::OpenVZ::load_config($param->{vmid});

	my $res = [
	    { subdir => 'config' },
	    { subdir => 'status' },
	    { subdir => 'vncproxy' },
	    { subdir => 'migrate' },
	    { subdir => 'rrd' },
	    { subdir => 'rrddata' },
	    ];
	
	return $res;
    }});

__PACKAGE__->register_method({
    name => 'rrd', 
    path => '{vmid}/rrd', 
    method => 'GET',
    protected => 1, # fixme: can we avoid that?
    permissions => {
	path => '/vms/{vmid}',
	privs => [ 'VM.Audit' ],
    },
    description => "Read VM RRD statistics (returns PNG)",
    parameters => {
    	additionalProperties => 0,
	properties => {
	    node => get_standard_option('pve-node'),
	    vmid => get_standard_option('pve-vmid'),
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
	    "pve2-vm/$param->{vmid}", $param->{timeframe}, 
	    $param->{ds}, $param->{cf});
					      
    }});

__PACKAGE__->register_method({
    name => 'rrddata', 
    path => '{vmid}/rrddata', 
    method => 'GET',
    protected => 1, # fixme: can we avoid that?
    permissions => {
	path => '/vms/{vmid}',
	privs => [ 'VM.Audit' ],
    },
    description => "Read VM RRD statistics",
    parameters => {
    	additionalProperties => 0,
	properties => {
	    node => get_standard_option('pve-node'),
	    vmid => get_standard_option('pve-vmid'),
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
	    "pve2-vm/$param->{vmid}", $param->{timeframe}, $param->{cf});
    }});

__PACKAGE__->register_method({
    name => 'vm_config', 
    path => '{vmid}/config', 
    method => 'GET',
    proxyto => 'node',
    description => "Get container configuration.",
    parameters => {
    	additionalProperties => 0,
	properties => {
	    node => get_standard_option('pve-node'),
	    vmid => get_standard_option('pve-vmid'),
	},
    },
    returns => { 
	type => "object",
	properties => {
	    digest => {
		type => 'string',
		description => 'SHA1 digest of configuration file. This can be used to prevent concurrent modifications.',
	    }
	},
    },
    code => sub {
	my ($param) = @_;

	my $veconf = PVE::OpenVZ::load_config($param->{vmid});

	# we only return selected/converted values
	my $conf = { digest => $veconf->{digest} };

	if ($veconf->{ostemplate} && $veconf->{ostemplate}->{value}) {
	    $conf->{ostemplate} = $veconf->{ostemplate}->{value};
	}

	my $properties = PVE::OpenVZ::json_config_properties();

	foreach my $k (keys %$properties) {
	    next if $k eq 'memory';
	    next if $k eq 'swap';
	    next if $k eq 'disk';

	    next if !$veconf->{$k};
	    next if !defined($veconf->{$k}->{value});

	    if ($k eq 'description') {
		$conf->{$k} = PVE::Tools::decode_text($veconf->{$k}->{value});
	    } else {
		$conf->{$k} = $veconf->{$k}->{value};
	    }
	}

	$conf->{memory} = $veconf->{physpages}->{lim} ? 
	    int(($veconf->{physpages}->{lim} * 4)/ 1024) : 512;
	$conf->{swap} = $veconf->{swappages}->{lim} ? 
	    int(($veconf->{swappages}->{lim} * 4)/1024) : 0;

	my $diskspace = $veconf->{diskspace}->{bar} || LONG_MAX;
	if ($diskspace == LONG_MAX) {
	    $conf->{disk} = 0;
	} else {
	    $conf->{disk} = $diskspace/(1024*1024);
	}
	return $conf;
    }});

__PACKAGE__->register_method({
    name => 'destroy_vm', 
    path => '{vmid}', 
    method => 'DELETE',
    protected => 1,
    proxyto => 'node',
    description => "Destroy the container (also delete all uses files).",
    parameters => {
    	additionalProperties => 0,
	properties => {
	    node => get_standard_option('pve-node'),
	    vmid => get_standard_option('pve-vmid'),
	},
    },
    returns => { 
	type => 'string',
    },
    code => sub {
	my ($param) = @_;

	my $rpcenv = PVE::RPCEnvironment::get();

	my $user = $rpcenv->get_user();

	my $vmid = $param->{vmid};

	# test if VM exists
	my $conf = PVE::OpenVZ::load_config($param->{vmid});

	my $realcmd = sub {
	    my $cmd = ['vzctl', 'destroy', $vmid ];

	    PVE::Tools::run_command($cmd);
	};

	return $rpcenv->fork_worker('vzdestroy', $vmid, $user, $realcmd);
    }});

my $sslcert;

__PACKAGE__->register_method ({
    name => 'vncproxy', 
    path => '{vmid}/vncproxy', 
    method => 'POST',
    protected => 1,
    permissions => {
	path => '/vms/{vmid}',
	privs => [ 'VM.Console' ],
    },
    description => "Creates a TCP VNC proxy connections.",
    parameters => {
    	additionalProperties => 0,
	properties => {
	    node => get_standard_option('pve-node'),
	    vmid => get_standard_option('pve-vmid'),
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

	my $user = $rpcenv->get_user();
	my $ticket = PVE::AccessControl::assemble_ticket($user);

	my $vmid = $param->{vmid};
	my $node = $param->{node};

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
	    ['/usr/bin/ssh', '-c', 'blowfish-cbc', '-t', $remip] : [];

	my $shcmd = [ '/usr/sbin/vzctl', 'enter', $vmid ];

	my $realcmd = sub {
	    my $upid = shift;

	    syslog ('info', "starting openvz vnc proxy $upid\n");

	    my $timeout = 10; 

	    my $cmd = ['/usr/bin/vncterm', '-rfbport', $port,
		       '-timeout', $timeout, '-authpath', "/vms/$vmid", 
		       '-perm', 'VM.Console', '-c', @$remcmd, @$shcmd];

	    PVE::Tools::run_command($cmd);

	    return;
	};

	my $upid = $rpcenv->fork_worker('vncproxy', $vmid, $user, $realcmd);

	return {
	    user => $user,
	    ticket => $ticket,
	    port => $port, 
	    upid => $upid, 
	    cert => $sslcert, 
	};
    }});

__PACKAGE__->register_method({
    name => 'vmcmdidx',
    path => '{vmid}/status', 
    method => 'GET',
    proxyto => 'node',
    description => "Directory index",
    parameters => {
    	additionalProperties => 0,
	properties => {
	    node => get_standard_option('pve-node'),
	    vmid => get_standard_option('pve-vmid'),
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

	# test if VM exists
	my $conf = PVE::OpenVZ::load_config($param->{vmid});

	my $res = [
	    { subdir => 'current' },
	    { subdir => 'ubc' },
	    { subdir => 'start' },
	    { subdir => 'stop' },
	    ];
	
	return $res;
    }});

__PACKAGE__->register_method({
    name => 'vm_status', 
    path => '{vmid}/status/current',
    method => 'GET',
    proxyto => 'node',
    protected => 1, # openvz /proc entries are only readable by root
    description => "Get virtual machine status.",
    parameters => {
    	additionalProperties => 0,
	properties => {
	    node => get_standard_option('pve-node'),
	    vmid => get_standard_option('pve-vmid'),
	},
    },
    returns => { type => 'object' },
    code => sub {
	my ($param) = @_;

	# test if VM exists
	my $conf = PVE::OpenVZ::load_config($param->{vmid});

	my $vmstatus =  PVE::OpenVZ::vmstatus($param->{vmid});

	return $vmstatus->{$param->{vmid}};
    }});

__PACKAGE__->register_method({
    name => 'vm_user_beancounters', 
    path => '{vmid}/status/ubc',
    method => 'GET',
    proxyto => 'node',
    protected => 1, # openvz /proc entries are only readable by root
    description => "Get container user_beancounters.",
    parameters => {
    	additionalProperties => 0,
	properties => {
	    node => get_standard_option('pve-node'),
	    vmid => get_standard_option('pve-vmid'),
	},
    },
    returns => {
	type => 'array',
	items => {
	    type => "object",
	    properties => {
		id => { type => 'string' },
		held => { type => 'number' },
		maxheld => { type => 'number' },
		bar => { type => 'number' },
		lim => { type => 'number' },
		failcnt => { type => 'number' },
	    },
	},
    },
    code => sub {
	my ($param) = @_;

	# test if VM exists
	my $conf = PVE::OpenVZ::load_config($param->{vmid});

	my $ubchash = PVE::OpenVZ::read_user_beancounters();
	my $ubc = $ubchash->{$param->{vmid}} || {};
	delete $ubc->{failcntsum};

	return PVE::RESTHandler::hash_to_array($ubc, 'id');
    }});

__PACKAGE__->register_method({
    name => 'vm_start', 
    path => '{vmid}/status/start',
    method => 'POST',
    protected => 1,
    proxyto => 'node',
    description => "Start the container.",
    parameters => {
    	additionalProperties => 0,
	properties => {
	    node => get_standard_option('pve-node'),
	    vmid => get_standard_option('pve-vmid'),
	},
    },
    returns => { 
	type => 'string',
    },
    code => sub {
	my ($param) = @_;

	my $rpcenv = PVE::RPCEnvironment::get();

	my $user = $rpcenv->get_user();

	my $node = extract_param($param, 'node');

	my $vmid = extract_param($param, 'vmid');

	my $realcmd = sub {
	    my $upid = shift;

	    syslog('info', "starting container $vmid: $upid\n");

	    my $cmd = ['vzctl', 'start', $vmid];
	    
	    PVE::Tools::run_command($cmd);
	    
	    return;
	};

	my $upid = $rpcenv->fork_worker('vzstart', $vmid, $user, $realcmd);

	return $upid;
    }});

__PACKAGE__->register_method({
    name => 'vm_stop', 
    path => '{vmid}/status/stop',
    method => 'POST',
    protected => 1,
    proxyto => 'node',
    description => "Stop the container.",
    parameters => {
    	additionalProperties => 0,
	properties => {
	    node => get_standard_option('pve-node'),
	    vmid => get_standard_option('pve-vmid'),
	    fast => {
		type => 'boolean',
		description => "This is faster but can lead to unclean container shutdown.",
		optional => 1,
	    }
	},
    },
    returns => { 
	type => 'string',
    },
    code => sub {
	my ($param) = @_;

	my $rpcenv = PVE::RPCEnvironment::get();

	my $user = $rpcenv->get_user();

	my $node = extract_param($param, 'node');

	my $vmid = extract_param($param, 'vmid');

	my $realcmd = sub {
	    my $upid = shift;

	    syslog('info', "stoping container $vmid: $upid\n");

	    my $cmd = ['vzctl', 'stop', $vmid];

	    push @$cmd, '--fast' if $param->{fast};
	    
	    PVE::Tools::run_command($cmd);
	    
	    return;
	};

	my $upid = $rpcenv->fork_worker('vzstop', $vmid, $user, $realcmd);

	return $upid;
    }});

1;
