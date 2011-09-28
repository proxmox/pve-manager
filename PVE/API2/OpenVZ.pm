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
    returns => { type => 'null'},
    code => sub {
	my ($param) = @_;

	my $node = extract_param($param, 'node');

	# fixme: fork worker?

	my $vmid = extract_param($param, 'vmid');

	my $password = extract_param($param, 'password');

	my $stcfg = cfs_read_file("storage.cfg");

	my $conf = PVE::OpenVZ::parse_ovz_config("/tmp/openvz/$vmid.conf", $pve_base_ovz_config);

	my $code = sub {

	    my $basecfg_fn = PVE::OpenVZ::get_config_path($vmid);

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

	    PVE::OpenVZ::update_ovz_config($conf, $param);

	    my $rawconf = PVE::OpenVZ::generate_raw_config($pve_base_ovz_config, $conf);

	    PVE::Tools::file_set_contents($basecfg_fn, $rawconf);

	    my $cmd = ['vzctl', '--skiplock', 'create', $vmid, '--ostemplate', $tpath ];

	    PVE::Tools::run_command($cmd);

	    # hack: vzctl '--userpasswd' starts the CT, but we want 
	    # to avoid that for create
	    PVE::OpenVZ::set_rootpasswd($vmid, $password) if defined($password);
	};

	PVE::OpenVZ::lock_container($vmid, $code);

	return undef;
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

	    PVE::Tools::run_command($cmd);
	};

	PVE::OpenVZ::lock_container($vmid, $code);

	return undef;
    }});

__PACKAGE__->register_method({
    name => 'vm_config', 
    path => '{vmid}/config', 
    method => 'GET',
    proxyto => 'node',
    description => "Get virtual machine configuration.",
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

	my $properties = PVE::OpenVZ::json_config_properties();

	foreach my $k (keys %$properties) {
	    next if $k eq 'memory';
	    next if $k eq 'swap';
	    next if $k eq 'disk';
	    $conf->{$k} = $veconf->{$k}->{value} if $veconf->{$k} && defined($veconf->{$k}->{value});
	}

	$conf->{memory} = $veconf->{physpages}->{lim} ? 
	    int($veconf->{physpages}->{lim} * 4096) : 512*1024*1024;
	$conf->{swap} = $veconf->{swappages}->{lim} ? 
	    int($veconf->{swappages}->{lim} * 4096) : 0;
	my $diskspace = $veconf->{diskspace}->{bar} || LONG_MAX;
	if ($diskspace == LONG_MAX) {
	    $conf->{disk} = 0;
	} else {
	    $conf->{disk} = int($diskspace*1024);
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
    returns => { type => 'null' },
    code => sub {
	my ($param) = @_;

	my $rpcenv = PVE::RPCEnvironment::get();

	my $user = $rpcenv->get_user();

	my $vmid = $param->{vmid};

	my $cmd = ['vzctl', 'destroy', $vmid ];

	PVE::Tools::run_command($cmd);

	return undef;
    }});

1;
