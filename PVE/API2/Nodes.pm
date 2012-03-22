package PVE::API2::Nodes::Nodeinfo;

use strict;
use warnings;
use POSIX;
use Filesys::Df;
use Time::Local qw(timegm_nocheck);
use PVE::pvecfg;
use PVE::Tools;
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
use PVE::OpenVZ;
use PVE::APLInfo;
use PVE::API2::Subscription;
use PVE::API2::Services;
use PVE::API2::Network;
use PVE::API2::Tasks;
use PVE::API2::Storage::Scan;
use PVE::API2::Storage::Status;
use PVE::API2::Qemu;
use PVE::API2::OpenVZ;
use PVE::API2::VZDump;
use JSON;

use base qw(PVE::RESTHandler);

__PACKAGE__->register_method ({
    subclass => "PVE::API2::Qemu",  
    path => 'qemu',
});

__PACKAGE__->register_method ({
    subclass => "PVE::API2::OpenVZ",  
    path => 'openvz',
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
	    { name => 'version' },
	    { name => 'syslog' },
	    { name => 'status' },
	    { name => 'subscription' },
	    { name => 'tasks' },
	    { name => 'rrd' }, # fixme: remove?
	    { name => 'rrddata' },# fixme: remove?
	    { name => 'vncshell' },
	    { name => 'time' },
	    { name => 'dns' },
	    { name => 'services' },
	    { name => 'scan' },
	    { name => 'storage' },
	    { name => 'qemu' },
	    { name => 'openvz' },
	    { name => 'vzdump' },
	    { name => 'ubcfailcnt' },
	    { name => 'network' },
	    { name => 'aplinfo' },
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
    name => 'beancounters_failcnt', 
    path => 'ubcfailcnt',
    permissions => {
	check => ['perm', '/nodes/{node}', [ 'Sys.Audit' ]],
    },
    method => 'GET',
    proxyto => 'node',
    protected => 1, # openvz /proc entries are only readable by root
    description => "Get user_beancounters failcnt for all active containers.",
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
	    properties => {
		id => { type => 'string' },
		failcnt => { type => 'number' },
	    },
	},
    },
    code => sub {
	my ($param) = @_;

	my $ubchash = PVE::OpenVZ::read_user_beancounters();

	my $res = [];
	foreach my $vmid (keys %$ubchash) {
	    next if !$vmid;
	    push @$res, { id => $vmid, failcnt => $ubchash->{$vmid}->{failcntsum} };

	}
	return $res;
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
	    ['/usr/bin/ssh', '-c', 'blowfish-cbc', '-t', $remip] : [];

	my $shcmd = $user eq 'root@pam' ? [ "/bin/bash", "-l" ] : [ "/bin/login" ];

	my $timeout = 10; 

	my @cmd = ('/usr/bin/vncterm', '-rfbport', $port,
		   '-timeout', $timeout, '-authpath', $authpath, 
		   '-perm', 'Sys.Console', '-c', @$remcmd, @$shcmd);

	my $realcmd = sub {
	    my $upid = shift;

	    syslog ('info', "starting vnc proxy $upid\n");

	    my $cmdstr = join (' ', @cmd);
	    syslog ('info', "launch command: $cmdstr");

	    if (system(@cmd) != 0) {
		my $msg = "vncterm failed - $?";
		syslog ('err', $msg);
		return;
	    }

	    return;
	};

	my $upid = $rpcenv->fork_worker('vncshell', "", $user, $realcmd);

	return {
	    user => $user,
	    ticket => $ticket,
	    port => $port, 
	    upid => $upid, 
	    cert => $sslcert, 
	};
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

package PVE::API2::Nodes;

use strict;
use warnings;

use PVE::SafeSyslog;
use PVE::Cluster;
use PVE::RESTHandler;
use PVE::RPCEnvironment;

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
	links => [ { rel => 'child', href => "{name}" } ],
    },
    code => sub {
	my ($param) = @_;
 
	my $clinfo = PVE::Cluster::get_clinfo();
	my $res = [];

	my $nodename = PVE::INotify::nodename();
	my $nodelist = $clinfo->{nodelist};

	my $rrd = PVE::Cluster::rrd_dump();

	my @nodes = $nodelist ? (keys %$nodelist) : $nodename;

	foreach my $node (@nodes) {
	    my $entry = { name => $node };
	    if (my $d = $rrd->{"pve2-node/$node"}) {

		$entry->{uptime} = $d->[0];
		$entry->{maxcpu} = $d->[3];
		$entry->{cpu} = $d->[4];
		$entry->{maxmem} = $d->[6];
		$entry->{mem} = $d->[7];
		$entry->{maxdisk} = $d->[10];
		$entry->{disk} = $d->[11];
	    }

	    push @$res, $entry;
	}

	return $res;
    }});

1;
