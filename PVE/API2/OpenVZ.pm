package PVE::API2::OpenVZ;

use strict;
use warnings;
use File::Basename;
use File::Path;
use POSIX qw (LONG_MAX);

use PVE::SafeSyslog;
use PVE::Tools qw(extract_param run_command);
use PVE::Exception qw(raise raise_param_exc);
use PVE::INotify;
use PVE::Cluster qw(cfs_lock_file cfs_read_file cfs_write_file);
use PVE::AccessControl;
use PVE::Storage;
use PVE::RESTHandler;
use PVE::RPCEnvironment;
use PVE::OpenVZ;
use PVE::OpenVZMigrate;
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

my $get_container_storage = sub {
    my ($stcfg, $vmid, $veconf) = @_;

    my $path = PVE::OpenVZ::get_privatedir($veconf, $vmid);
    my ($vtype, $volid) = PVE::Storage::path_to_volume_id($stcfg, $path);
    my ($sid, $volname) = PVE::Storage::parse_volume_id($volid, 1) if $volid;
    return wantarray ? ($sid, $volname, $path) : $sid;
};

my $check_ct_modify_config_perm = sub {
    my ($rpcenv, $authuser, $vmid, $pool, $key_list) = @_;
    
    return 1 if $authuser ne 'root@pam';

    foreach my $opt (@$key_list) {

	if ($opt eq 'cpus' || $opt eq 'cpuunits' || $opt eq 'cpulimit') {
	    $rpcenv->check_vm_perm($authuser, $vmid, $pool, ['VM.Config.CPU']);
	} elsif ($opt eq 'disk' || $opt eq 'quotatime' || $opt eq 'quotaugidlimit') {
	    $rpcenv->check_vm_perm($authuser, $vmid, $pool, ['VM.Config.Disk']);
	} elsif ($opt eq 'memory' || $opt eq 'swap') {
	    $rpcenv->check_vm_perm($authuser, $vmid, $pool, ['VM.Config.Memory']);
	} elsif ($opt eq 'netif' || $opt eq 'ip_address' || $opt eq 'nameserver' || 
		 $opt eq 'searchdomain' || $opt eq 'hostname') {
	    $rpcenv->check_vm_perm($authuser, $vmid, $pool, ['VM.Config.Network']);
	} else {
	    $rpcenv->check_vm_perm($authuser, $vmid, $pool, ['VM.Config.Options']);
	}
    }

    return 1;
};

__PACKAGE__->register_method({
    name => 'vmlist', 
    path => '', 
    method => 'GET',
    description => "OpenVZ container index (per node).",
    permissions => {
	description => "Only list VMs where you have VM.Audit permissons on /vms/<vmid>.",
	user => 'all',
    },
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

	my $rpcenv = PVE::RPCEnvironment::get();
	my $authuser = $rpcenv->get_user();

	my $vmstatus = PVE::OpenVZ::vmstatus();

	my $res = [];
	foreach my $vmid (keys %$vmstatus) {
	    next if !$rpcenv->check($authuser, "/vms/$vmid", [ 'VM.Audit' ], 1);

	    my $data = $vmstatus->{$vmid};
	    $data->{vmid} = $vmid;
	    push @$res, $data;
	}

	return $res;
  
    }});

my $restore_openvz = sub {
    my ($private, $archive, $vmid, $force) = @_;

    my $vzconf = PVE::OpenVZ::read_global_vz_config();
    my $conffile = PVE::OpenVZ::config_file($vmid);
    my $cfgdir = dirname($conffile);

    my $root = $vzconf->{rootdir};
    $root =~ s/\$VEID/$vmid/;

    print "you choose to force overwriting VPS config file, private and root directories.\n" if $force;

    die "unable to create CT $vmid - container already exists\n"
	if !$force && -f $conffile;
 
    die "unable to create CT $vmid - directory '$private' already exists\n"
	if !$force && -d $private;
   
    die "unable to create CT $vmid - directory '$root' already exists\n"
	if !$force && -d $root;

    my $conf;

    eval {
	if ($force && -f $conffile) {
	    my $conf = PVE::OpenVZ::load_config($vmid);

	    my $oldprivate = PVE::OpenVZ::get_privatedir($conf, $vmid);
	    rmtree $oldprivate if -d $oldprivate;
	   
	    my $oldroot = $conf->{ve_root} ? $conf->{ve_root}->{value} : $root;
	    rmtree $oldroot if -d $oldroot;
	};

	mkpath $private || die "unable to create private dir '$private'";
	mkpath $root || die "unable to create root dir '$root'";
	
	my $cmd = ['tar', 'xpf', $archive, '--totals', '--sparse', '-C', $private];

	if ($archive eq '-') {
	    print "extracting archive from STDIN\n";
	    run_command($cmd, input => "<&STDIN");
	} else {
	    print "extracting archive '$archive'\n";
	    run_command($cmd);
	}

	my $backup_cfg = "$private/etc/vzdump/vps.conf";
	if (-f $backup_cfg) {
	    print "restore configuration to '$conffile'\n";

	    my $conf = PVE::Tools::file_get_contents($backup_cfg);

	    $conf =~ s/VE_ROOT=.*/VE_ROOT=\"$root\"/;
	    $conf =~ s/VE_PRIVATE=.*/VE_PRIVATE=\"$private\"/;
	    $conf =~ s/host_ifname=veth[0-9]+\./host_ifname=veth${vmid}\./g;

	    PVE::Tools::file_set_contents($conffile, $conf);
		
	    foreach my $s (PVE::OpenVZ::SCRIPT_EXT) {
		my $tfn = "$cfgdir/${vmid}.$s";
		my $sfn = "$private/etc/vzdump/vps.$s";
		if (-f $sfn) {
		    my $sc = PVE::Tools::file_get_contents($sfn);
		    PVE::Tools::file_set_contents($tfn, $sc);
		}
	    }
	}

	rmtree "$private/etc/vzdump";
    };

    my $err = $@;

    if ($err) {
	rmtree $private;
	rmtree $root;
	unlink $conffile;
	foreach my $s (PVE::OpenVZ::SCRIPT_EXT) {
	    unlink "$cfgdir/${vmid}.$s";
	}
	die $err;
    }

    return $conf;
};

# create_vm is also used by vzrestore
__PACKAGE__->register_method({
    name => 'create_vm', 
    path => '', 
    method => 'POST',
    description => "Create or restore a container.",
    permissions => {
	user => 'all', # check inside
 	description => "You need 'VM.Allocate' permissions on /vms/{vmid} or on the VM pool /pool/{pool}. " .
	    "For restore, it is enough if the user has 'VM.Backup' permission and the VM already exists. " .
	    "You also need 'Datastore.AllocateSpace' permissions on the storage.",
    },
    protected => 1,
    proxyto => 'node',
    parameters => {
    	additionalProperties => 0,
	properties => PVE::OpenVZ::json_config_properties({
	    node => get_standard_option('pve-node'),
	    vmid => get_standard_option('pve-vmid'),
	    ostemplate => {
		description => "The OS template or backup file.",
		type => 'string', 
		maxLength => 255,
	    },
	    password => { 
		optional => 1, 
		type => 'string',
		description => "Sets root password inside container.",
	    },
	    storage => get_standard_option('pve-storage-id', {
		description => "Target storage.",
		default => 'local',
		optional => 1,
	    }),
	    force => {
		optional => 1, 
		type => 'boolean',
		description => "Allow to overwrite existing container.",
	    },
	    restore => {
		optional => 1, 
		type => 'boolean',
		description => "Mark this as restore task.",
	    },
	    pool => { 
		optional => 1,
		type => 'string', format => 'pve-poolid',
		description => "Add the VM to the specified pool.",
	    },
	}),
    },
    returns => { 
	type => 'string',
    },
    code => sub {
	my ($param) = @_;

	my $rpcenv = PVE::RPCEnvironment::get();

	my $authuser = $rpcenv->get_user();

	my $node = extract_param($param, 'node');

	my $vmid = extract_param($param, 'vmid');

	my $password = extract_param($param, 'password');

	my $storage = extract_param($param, 'storage') || 'local';

	my $pool = extract_param($param, 'pool');
	
	my $storage_cfg = cfs_read_file("storage.cfg");

	my $scfg = PVE::Storage::storage_check_node($storage_cfg, $storage, $node);

	raise_param_exc({ storage => "storage '$storage' does not support openvz root directories"})
	    if !$scfg->{content}->{rootdir};

	my $private = PVE::Storage::get_private_dir($storage_cfg, $storage, $vmid);

	my $basecfg_fn = PVE::OpenVZ::config_file($vmid);

	if (defined($pool)) {
	    $rpcenv->check_pool_exist($pool);
	    $rpcenv->check_perm_modify($authuser, "/pool/$pool");
	} 

	$rpcenv->check($authuser, "/storage/$storage", ['Datastore.AllocateSpace']);

	if ($rpcenv->check($authuser, "/vms/$vmid", ['VM.Allocate'], 1)) {
	    # OK
	} elsif ($pool && $rpcenv->check($authuser, "/pool/$pool", ['VM.Allocate'], 1)) {
	    # OK
	} elsif ($param->{restore} && $param->{force} && (-f $basecfg_fn) &&
		 $rpcenv->check($authuser, "/vms/$vmid", ['VM.Backup'], 1)) {
	    # OK: user has VM.Backup permissions, and want to restore an existing VM
	} else {
	    raise_perm_exc();
	}

	&$check_ct_modify_config_perm($rpcenv, $authuser, $vmid, $pool, [ keys %$param]);

	PVE::Storage::activate_storage($storage_cfg, $storage);

	my $conf = PVE::OpenVZ::parse_ovz_config("/tmp/openvz/$vmid.conf", $pve_base_ovz_config);

	my $ostemplate = extract_param($param, 'ostemplate');

	my $archive;

	if ($ostemplate eq '-') {
	    die "pipe requires cli environment\n" 
		if $rpcenv->{type} ne 'cli'; 
	    die "pipe can only be used with restore tasks\n" 
		if !$param->{restore};
	    $archive = '-';
	} else {
	    $rpcenv->check_volume_access($authuser, $storage_cfg, $vmid, $ostemplate);
	    $archive = PVE::Storage::abs_filesystem_path($storage_cfg, $ostemplate);
	}

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

	# try to append domain to hostmane
	if ($param->{hostname} && $param->{hostname} !~ m/\./ &&
	    $param->{searchdomain}) {

	    $param->{hostname} .= ".$param->{searchdomain}";
	}

	my $check_vmid_usage = sub {
	    if ($param->{force}) {
		die "cant overwrite mounted container\n" 
		    if PVE::OpenVZ::check_mounted($conf, $vmid);
	    } else {
		die "CT $vmid already exists\n" if -f $basecfg_fn;
	    }
	};

	my $code = sub {

	    &$check_vmid_usage(); # final check after locking

	    PVE::OpenVZ::update_ovz_config($vmid, $conf, $param);

	    my $rawconf = PVE::OpenVZ::generate_raw_config($pve_base_ovz_config, $conf);

	    PVE::Cluster::check_cfs_quorum();

	    if ($param->{restore}) {
		&$restore_openvz($private, $archive, $vmid, $param->{force});

		# is this really needed?
		my $cmd = ['vzctl', '--skiplock', '--quiet', 'set', $vmid, 
			   '--applyconfig_map', 'name', '--save'];
		run_command($cmd);

		# reload config
		$conf = PVE::OpenVZ::load_config($vmid);

		# and initialize quota
		my $disk_quota = $conf->{disk_quota}->{value};
		if (!defined($disk_quota) || ($disk_quota != 0)) {
		    $cmd = ['vzctl', '--skiplock', 'quotainit', $vmid];
		    run_command($cmd);
		}

	    } else {
		PVE::Tools::file_set_contents($basecfg_fn, $rawconf);
		my $cmd = ['vzctl', '--skiplock', 'create', $vmid,
			   '--ostemplate', $archive, '--private', $private];
		run_command($cmd);
		
		# hack: vzctl '--userpasswd' starts the CT, but we want 
		# to avoid that for create
		PVE::OpenVZ::set_rootpasswd($private, $password) 
		    if defined($password);
	    }

	    PVE::AccessControl::add_vm_to_pool($vmid, $pool) if $pool;
	};

	my $realcmd = sub { PVE::OpenVZ::lock_container($vmid, 1, $code); };

	&$check_vmid_usage(); # first check before locking

	return $rpcenv->fork_worker($param->{restore} ? 'vzrestore' : 'vzcreate', 
				    $vmid, $authuser, $realcmd);
    }});

my $vm_config_perm_list = [
	    'VM.Config.Disk', 
	    'VM.Config.CPU', 
	    'VM.Config.Memory', 
	    'VM.Config.Network', 
	    'VM.Config.Options',
    ];

__PACKAGE__->register_method({
    name => 'update_vm', 
    path => '{vmid}/config', 
    method => 'PUT',
    protected => 1,
    proxyto => 'node',
    description => "Set virtual machine options.",
    permissions => {
	check => ['perm', '/vms/{vmid}', $vm_config_perm_list, any => 1],
    },
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

	my $authuser = $rpcenv->get_user();

	my $node = extract_param($param, 'node');

	my $vmid = extract_param($param, 'vmid');

	my $digest = extract_param($param, 'digest');

	die "no options specified\n" if !scalar(keys %$param);

	&$check_ct_modify_config_perm($rpcenv, $authuser, $vmid, undef, [keys %$param]);

	my $code = sub {

	    my $conf = PVE::OpenVZ::load_config($vmid);
	    die "checksum missmatch (file change by other user?)\n" 
		if $digest && $digest ne $conf->{digest};

	    my $changes = PVE::OpenVZ::update_ovz_config($vmid, $conf, $param);

	    return if scalar (@$changes) <= 0;

	    my $cmd = ['vzctl', '--skiplock', 'set', $vmid, @$changes, '--save'];

	    PVE::Cluster::log_msg('info', $authuser, "update CT $vmid: " . join(' ', @$changes));
 
	    run_command($cmd);
	};

	PVE::OpenVZ::lock_container($vmid, undef, $code);

	return undef;
    }});

__PACKAGE__->register_method({
    name => 'vmdiridx',
    path => '{vmid}', 
    method => 'GET',
    proxyto => 'node',
    description => "Directory index",
    permissions => {
	user => 'all',
    },
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
	    { subdir => 'spiceproxy' },
	    { subdir => 'migrate' },
	    { subdir => 'initlog' },
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
	check => ['perm', '/vms/{vmid}', [ 'VM.Audit' ]],
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
	check => ['perm', '/vms/{vmid}', [ 'VM.Audit' ]],
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
    name => 'initlog', 
    path => '{vmid}/initlog', 
    method => 'GET',
    protected => 1,
    proxyto => 'node',
    permissions => {
	check => ['perm', '/vms/{vmid}', [ 'VM.Audit' ]],
    },
    description => "Read init log.",
    parameters => {
    	additionalProperties => 0,
	properties => {
	    node => get_standard_option('pve-node'),
	    vmid => get_standard_option('pve-vmid'),
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

	my $vmid = $param->{vmid};

	my $conf = PVE::OpenVZ::load_config($vmid);

	my $privatedir = PVE::OpenVZ::get_privatedir($conf, $vmid);

	my $logfn = "$privatedir/var/log/init.log";

	my ($count, $lines) = PVE::Tools::dump_logfile($logfn, $param->{start}, $param->{limit});

	$rpcenv->set_result_attrib('total', $count);
	    
	return $lines; 
    }});

__PACKAGE__->register_method({
    name => 'vm_config', 
    path => '{vmid}/config', 
    method => 'GET',
    proxyto => 'node',
    description => "Get container configuration.",
    permissions => {
	check => ['perm', '/vms/{vmid}', [ 'VM.Audit' ]],
    },
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

	my $stcfg = cfs_read_file("storage.cfg");

	my ($sid, undef, $path) = &$get_container_storage($stcfg, $param->{vmid}, $veconf);
	$conf->{storage} = $sid || $path;

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

	($conf->{memory}, $conf->{swap}) = PVE::OpenVZ::ovz_config_extract_mem_swap($veconf, 1024*1024);

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
    permissions => {
	check => [ 'perm', '/vms/{vmid}', ['VM.Allocate']],
    },
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

	my $authuser = $rpcenv->get_user();

	my $vmid = $param->{vmid};

	# test if VM exists
	my $conf = PVE::OpenVZ::load_config($param->{vmid});

	my $realcmd = sub {
	    my $cmd = ['vzctl', 'destroy', $vmid ];

	    run_command($cmd);

	    PVE::AccessControl::remove_vm_from_pool($vmid);
	};

	return $rpcenv->fork_worker('vzdestroy', $vmid, $authuser, $realcmd);
    }});

my $sslcert;

__PACKAGE__->register_method ({
    name => 'vncproxy', 
    path => '{vmid}/vncproxy', 
    method => 'POST',
    protected => 1,
    permissions => {
	check => ['perm', '/vms/{vmid}', [ 'VM.Console' ]],
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

	my $authuser = $rpcenv->get_user();

	my $vmid = $param->{vmid};
	my $node = $param->{node};

	my $authpath = "/vms/$vmid";

	my $ticket = PVE::AccessControl::assemble_vnc_ticket($authuser, $authpath);

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

	my $shcmd = [ '/usr/bin/dtach', '-A', 
		      "/var/run/dtach/vzctlconsole$vmid", 
		      '-r', 'winch', '-z', 
		      '/usr/sbin/vzctl', 'console', $vmid ];

	my $realcmd = sub {
	    my $upid = shift;

	    syslog ('info', "starting openvz vnc proxy $upid\n");

	    my $timeout = 10; 

	    my $cmd = ['/usr/bin/vncterm', '-rfbport', $port,
		       '-timeout', $timeout, '-authpath', $authpath, 
		       '-perm', 'VM.Console', '-c', @$remcmd, @$shcmd];

	    run_command($cmd);

	    return;
	};

	my $upid = $rpcenv->fork_worker('vncproxy', $vmid, $authuser, $realcmd);

	PVE::Tools::wait_for_vnc_port($port);

	return {
	    user => $authuser,
	    ticket => $ticket,
	    port => $port, 
	    upid => $upid, 
	    cert => $sslcert, 
	};
    }});

__PACKAGE__->register_method ({
    name => 'spiceproxy', 
    path => '{vmid}/spiceproxy', 
    method => 'POST',
    protected => 1,
    proxyto => 'node',
    permissions => {
	check => ['perm', '/vms/{vmid}', [ 'VM.Console' ]],
    },
    description => "Returns a SPICE configuration to connect to the CT.",
    parameters => {
    	additionalProperties => 0,
	properties => {
	    node => get_standard_option('pve-node'),
	    vmid => get_standard_option('pve-vmid'),
	    proxy => {
		description => "This can be used by the client to specify the proxy server. All nodes in a cluster runs 'spiceproxy', so it is up to the client to choose one. By default, we return the node where the VM is currently running. As resonable setting is to use same node you use to connect to the API (This is window.location.hostname for the JS GUI).",
		type => 'string', format => 'dns-name',
		optional => 1,
	    },
	},
    },
    returns => {
	description => "Returned values can be directly passed to the 'remote-viewer' application.",
    	additionalProperties => 1,
	properties => {
	    type => { type => 'string' },
	    password => { type => 'string' },
	    proxy => { type => 'string' },
	    host => { type => 'string' },
	    'tls-port' => { type => 'integer' },
	},
    },
    code => sub {
	my ($param) = @_;

	my $rpcenv = PVE::RPCEnvironment::get();

	my $authuser = $rpcenv->get_user();

	my $vmid = $param->{vmid};
	my $node = $param->{node};
	my $proxy = $param->{proxy};
	if (!$proxy) {
	    my $host = `hostname -f` || PVE::INotify::nodename();
	    chomp $host;
	    $proxy = $host;
	}

	my $authpath = "/vms/$vmid";

	my ($ticket, $proxyticket) = PVE::AccessControl::assemble_spice_ticket($authuser, $vmid, $node);

	my $filename = "/etc/pve/local/pve-ssl.pem";
	my $subject = PVE::QemuServer::read_x509_subject_spice($filename);

	my $cacert = PVE::Tools::file_get_contents("/etc/pve/pve-root-ca.pem", 8192);
	$cacert =~ s/\n/\\n/g;

	my $port = PVE::Tools::next_spice_port();

	my $remip;
	
	my $shcmd = [ '/usr/bin/dtach', '-A', 
		      "/var/run/dtach/vzctlconsole$vmid", 
		      '-r', 'winch', '-z', 
		      '/usr/sbin/vzctl', 'console', $vmid ];

	my $realcmd = sub {
	    my $upid = shift;

	    syslog('info', "starting openvz vnc proxy $upid\n");

	    my $timeout = 10; 

	    eval { 
		foreach my $k (keys %ENV) {
		    next if $k eq 'PATH' || $k eq 'TERM' || $k eq 'USER' || $k eq 'HOME';
		    delete $ENV{$k};
		}
		$ENV{PWD} = '/';
		$ENV{SPICE_TICKET} = $ticket;
	    
		my $cmd = ['/usr/bin/spiceterm', '--port', $port, '--addr', '127.0.0.1',
			   '--timeout', $timeout, '--authpath', $authpath, 
			   '--permissions', 'VM.Console', '--', @$shcmd];

		run_command($cmd, errmsg => "spiceterm failed");
	    };
	    if (my $err = $@) {
		syslog ('err', $err);
	    }

	    return;
	};

	my $upid = $rpcenv->fork_worker('spiceproxy', $vmid, $authuser, $realcmd);

	PVE::Tools::wait_for_vnc_port($port);

	return {
	    type => 'spice',
	    title => "Shell on '$node'",
	    host => $proxyticket, # this break tls hostname verification, so we need to use 'host-subject'
	    proxy => "http://$proxy:3128",
	    'tls-port' => $port,
	    'host-subject' => $subject,
	    ca => $cacert,
	    password => $ticket,
	    'delete-this-file' => 1,
	};
    }});

__PACKAGE__->register_method({
    name => 'vmcmdidx',
    path => '{vmid}/status', 
    method => 'GET',
    proxyto => 'node',
    description => "Directory index",
    permissions => {
	user => 'all',
    },
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

my $vm_is_ha_managed = sub {
    my ($vmid) = @_;

    my $cc = PVE::Cluster::cfs_read_file('cluster.conf');
    if (PVE::Cluster::cluster_conf_lookup_pvevm($cc, 0, $vmid, 1)) {
	return 1;
    } 
    return 0;
};

__PACKAGE__->register_method({
    name => 'vm_status', 
    path => '{vmid}/status/current',
    method => 'GET',
    proxyto => 'node',
    protected => 1, # openvz /proc entries are only readable by root
    description => "Get virtual machine status.",
    permissions => {
	check => ['perm', '/vms/{vmid}', [ 'VM.Audit' ]],
    },
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
	my $status = $vmstatus->{$param->{vmid}};

	$status->{ha} = &$vm_is_ha_managed($param->{vmid});

	return $status;
    }});

__PACKAGE__->register_method({
    name => 'vm_user_beancounters', 
    path => '{vmid}/status/ubc',
    method => 'GET',
    proxyto => 'node',
    protected => 1, # openvz /proc entries are only readable by root
    description => "Get container user_beancounters.",
    permissions => {
	check => ['perm', '/vms/{vmid}', [ 'VM.Audit' ]],
    },
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
    permissions => {
	check => ['perm', '/vms/{vmid}', [ 'VM.PowerMgmt' ]],
    },
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

	my $authuser = $rpcenv->get_user();

	my $node = extract_param($param, 'node');

	my $vmid = extract_param($param, 'vmid');

	die "CT $vmid already running\n" if PVE::OpenVZ::check_running($vmid);

	if (&$vm_is_ha_managed($vmid) && $rpcenv->{type} ne 'ha') {

	    my $hacmd = sub {
		my $upid = shift;

		my $service = "pvevm:$vmid";

		my $cmd = ['clusvcadm', '-e', $service, '-m', $node];

		print "Executing HA start for CT $vmid\n";

		PVE::Tools::run_command($cmd);

		return;
	    };

	    return $rpcenv->fork_worker('hastart', $vmid, $authuser, $hacmd);

	} else {

	    my $realcmd = sub {
		my $upid = shift;

		syslog('info', "starting CT $vmid: $upid\n");

		my $veconf = PVE::OpenVZ::load_config($vmid);
		my $stcfg = cfs_read_file("storage.cfg");
		if (my $sid = &$get_container_storage($stcfg, $vmid, $veconf)) {
		    PVE::Storage::activate_storage($stcfg, $sid);
		}

		my $vzconf = PVE::OpenVZ::read_global_vz_config();
		
		# make sure mount point is there (see bug #276)
		my $root = PVE::OpenVZ::get_rootdir($veconf, $vmid);
		mkpath $root || die "unable to create root dir '$root'";

		my $cmd = ['vzctl', 'start', $vmid];
	    
		run_command($cmd);

		return;
	    };

	    return $rpcenv->fork_worker('vzstart', $vmid, $authuser, $realcmd);
	}
    }});

__PACKAGE__->register_method({
    name => 'vm_stop', 
    path => '{vmid}/status/stop',
    method => 'POST',
    protected => 1,
    proxyto => 'node',
    description => "Stop the container.",
    permissions => {
	check => ['perm', '/vms/{vmid}', [ 'VM.PowerMgmt' ]],
    },
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

	my $authuser = $rpcenv->get_user();

	my $node = extract_param($param, 'node');

	my $vmid = extract_param($param, 'vmid');

	die "CT $vmid not running\n" if !PVE::OpenVZ::check_running($vmid);

	if (&$vm_is_ha_managed($vmid) && $rpcenv->{type} ne 'ha') {

	    my $hacmd = sub {
		my $upid = shift;

		my $service = "pvevm:$vmid";

		my $cmd = ['clusvcadm', '-d', $service];

		print "Executing HA stop for CT $vmid\n";

		PVE::Tools::run_command($cmd);

		return;
	    };

	    return $rpcenv->fork_worker('hastop', $vmid, $authuser, $hacmd);

	} else {

	    my $realcmd = sub {
		my $upid = shift;

		syslog('info', "stoping CT $vmid: $upid\n");

		my $cmd = ['vzctl', 'stop', $vmid, '--fast'];
		run_command($cmd);
	    
		return;
	    };

	    return $rpcenv->fork_worker('vzstop', $vmid, $authuser, $realcmd);
	}
    }});

__PACKAGE__->register_method({
    name => 'vm_mount', 
    path => '{vmid}/status/mount',
    method => 'POST',
    protected => 1,
    proxyto => 'node',
    description => "Mounts container private area.",
    permissions => {
	check => ['perm', '/vms/{vmid}', [ 'VM.PowerMgmt' ]],
    },
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

	my $authuser = $rpcenv->get_user();

	my $node = extract_param($param, 'node');

	my $vmid = extract_param($param, 'vmid');

	die "CT $vmid is running\n" if PVE::OpenVZ::check_running($vmid);

	my $realcmd = sub {
	    my $upid = shift;

	    syslog('info', "mount CT $vmid: $upid\n");

	    my $cmd = ['vzctl', 'mount', $vmid];
	    
	    run_command($cmd);

	    return;
	};

	return $rpcenv->fork_worker('vzmount', $vmid, $authuser, $realcmd);
    }});

__PACKAGE__->register_method({
    name => 'vm_umount', 
    path => '{vmid}/status/umount',
    method => 'POST',
    protected => 1,
    proxyto => 'node',
    description => "Unmounts container private area.",
    permissions => {
	check => ['perm', '/vms/{vmid}', [ 'VM.PowerMgmt' ]],
    },
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

	my $authuser = $rpcenv->get_user();

	my $node = extract_param($param, 'node');

	my $vmid = extract_param($param, 'vmid');

	die "CT $vmid is running\n" if PVE::OpenVZ::check_running($vmid);

	my $realcmd = sub {
	    my $upid = shift;

	    syslog('info', "umount CT $vmid: $upid\n");

	    my $cmd = ['vzctl', 'umount', $vmid];
	    
	    run_command($cmd);

	    return;
	};

	return $rpcenv->fork_worker('vzumount', $vmid, $authuser, $realcmd);
    }});

__PACKAGE__->register_method({
    name => 'vm_shutdown', 
    path => '{vmid}/status/shutdown',
    method => 'POST',
    protected => 1,
    proxyto => 'node',
    description => "Shutdown the container.",
    permissions => {
	check => ['perm', '/vms/{vmid}', [ 'VM.PowerMgmt' ]],
    },
    parameters => {
    	additionalProperties => 0,
	properties => {
	    node => get_standard_option('pve-node'),
	    vmid => get_standard_option('pve-vmid'),
	    timeout => {
		description => "Wait maximal timeout seconds.",
		type => 'integer',
		minimum => 0,
		optional => 1,
		default => 60,
	    },
	    forceStop => {
		description => "Make sure the Container stops.",
		type => 'boolean',
		optional => 1,
		default => 0,
	    }
	},
    },
    returns => { 
	type => 'string',
    },
    code => sub {
	my ($param) = @_;

	my $rpcenv = PVE::RPCEnvironment::get();

	my $authuser = $rpcenv->get_user();

	my $node = extract_param($param, 'node');

	my $vmid = extract_param($param, 'vmid');

	my $timeout = extract_param($param, 'timeout');

	die "CT $vmid not running\n" if !PVE::OpenVZ::check_running($vmid);

	my $realcmd = sub {
	    my $upid = shift;

	    syslog('info', "shutdown CT $vmid: $upid\n");

	    my $cmd = ['vzctl', 'stop', $vmid];

	    $timeout = 60 if !defined($timeout);

	    eval { run_command($cmd, timeout => $timeout); };
	    my $err = $@;
	    return if !$err;

	    die $err if !$param->{forceStop};

	    warn "shutdown failed - forcing stop now\n";

	    push @$cmd, '--fast';
	    run_command($cmd);
	    
	    return;
	};

	my $upid = $rpcenv->fork_worker('vzshutdown', $vmid, $authuser, $realcmd);

	return $upid;
    }});

__PACKAGE__->register_method({
    name => 'migrate_vm', 
    path => '{vmid}/migrate',
    method => 'POST',
    protected => 1,
    proxyto => 'node',
    description => "Migrate the container to another node. Creates a new migration task.",
    permissions => {
	check => ['perm', '/vms/{vmid}', [ 'VM.Migrate' ]],
    },
    parameters => {
    	additionalProperties => 0,
	properties => {
	    node => get_standard_option('pve-node'),
	    vmid => get_standard_option('pve-vmid'),
	    target => get_standard_option('pve-node', { description => "Target node." }),
	    online => {
		type => 'boolean',
		description => "Use online/live migration.",
		optional => 1,
	    },
	},
    },
    returns => { 
	type => 'string',
	description => "the task ID.",
    },
    code => sub {
	my ($param) = @_;

	my $rpcenv = PVE::RPCEnvironment::get();

	my $authuser = $rpcenv->get_user();

	my $target = extract_param($param, 'target');

	my $localnode = PVE::INotify::nodename();
	raise_param_exc({ target => "target is local node."}) if $target eq $localnode;

	PVE::Cluster::check_cfs_quorum();

	PVE::Cluster::check_node_exists($target);

	my $targetip = PVE::Cluster::remote_node_ip($target);

	my $vmid = extract_param($param, 'vmid');

	# test if VM exists
	PVE::OpenVZ::load_config($vmid);

	# try to detect errors early
	if (PVE::OpenVZ::check_running($vmid)) {
	    die "cant migrate running container without --online\n" 
		if !$param->{online};
	}

	if (&$vm_is_ha_managed($vmid) && $rpcenv->{type} ne 'ha') {

	    my $hacmd = sub {
		my $upid = shift;

		my $service = "pvevm:$vmid";

		my $cmd = ['clusvcadm', '-M', $service, '-m', $target];

		print "Executing HA migrate for CT $vmid to node $target\n";

		PVE::Tools::run_command($cmd);

		return;
	    };

	    return $rpcenv->fork_worker('hamigrate', $vmid, $authuser, $hacmd);

	} else {

	    my $realcmd = sub {
		my $upid = shift;

		PVE::OpenVZMigrate->migrate($target, $targetip, $vmid, $param);

		return;
	    };

	    return $rpcenv->fork_worker('vzmigrate', $vmid, $authuser, $realcmd);
	}
    }});

1;
