package PVE::API2::OpenVZ;

use strict;
use warnings;
use File::Basename;

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


my $get_config_path = sub {
    my $vmid = shift;
    return "/etc/pve/openvz/${vmid}.conf";
};

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

	    my $basecfg_fn = &$get_config_path($vmid);

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

	    return undef;
	};

	PVE::OpenVZ::lock_container($vmid, $code);
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
