package PVE::API2::VZDump;

use strict;
use warnings;
use PVE::Exception qw(raise_param_exc);
use PVE::Tools qw(extract_param);
use PVE::Cluster qw(cfs_register_file cfs_read_file);
use PVE::INotify;
use PVE::RPCEnvironment;
use PVE::AccessControl;
use PVE::JSONSchema qw(get_standard_option);
use PVE::Storage;
use PVE::VZDump;

use Data::Dumper; # fixme: remove


use base qw(PVE::RESTHandler);

__PACKAGE__->register_method ({
    name => 'vzdump', 
    path => '',
    method => 'POST',
    description => "Create backup.",
    permissions => {
	description => "The user needs 'VM.Backup' permissions on any VM, and 'Datastore.AllocateSpace' on the backup storage. The 'maxfiles', 'tmpdir', 'dumpdir', 'script', 'bwlimit' and 'ionice' parameters are restricted to the 'root\@pam' user.",
	user => 'all',
    },
    protected => 1,
    proxyto => 'node',
    parameters => {
    	additionalProperties => 0,
	properties => PVE::VZDump::json_config_properties({
	    stdout => {
		type => 'boolean',
		description => "Write tar to stdout, not to a file.",
		optional => 1,
	    },
        }),
    },
    returns => { type => 'string' },
    code => sub {
	my ($param) = @_;

	my $rpcenv = PVE::RPCEnvironment::get();

	my $user = $rpcenv->get_user();

	my $nodename = PVE::INotify::nodename();

	if ($rpcenv->{type} ne 'cli') {
	    raise_param_exc({ node => "option is only allowed on the command line interface."})
		if $param->{node} && $param->{node} ne $nodename;

	    raise_param_exc({ stdout => "option is only allowed on the command line interface."})
		if $param->{stdout};
	}

	foreach my $key (qw(maxfiles tmpdir dumpdir script bwlimit ionice)) {
	    raise_param_exc({ $key => "Only root may set this option."})
		if defined($param->{$key}) && ($user ne 'root@pam');
	}

	# by default we set --rsyncable for gzip
	local $ENV{GZIP} = "--rsyncable" if !$ENV{GZIP};

	PVE::VZDump::verify_vzdump_parameters($param, 1);

	# silent exit if we run on wrong node
	return 'OK' if $param->{node} && $param->{node} ne $nodename;
	
	my $cmdline = PVE::VZDump::command_line($param);

	# convert string lists to arrays
	my @vmids = PVE::Tools::split_list(extract_param($param, 'vmid'));

	if($param->{stop}){
	    PVE::VZDump::stop_running_backups();
	    return 'OK' if !scalar(@vmids);
	}

	my $skiplist = [];
	if (!$param->{all}) {
	    if (!$param->{node}) {
		my $vmlist = PVE::Cluster::get_vmlist();
		my @localvmids = ();
		foreach my $vmid (@vmids) {
		    my $d = $vmlist->{ids}->{$vmid};
		    if ($d && ($d->{node} ne $nodename)) {
			push @$skiplist, $vmid;
		    } else {
			push @localvmids, $vmid;
		    }
		}
		@vmids = @localvmids;
		# silent exit if specified VMs run on other nodes
		return "OK" if !scalar(@vmids);
	    }

	    $param->{vmids} = PVE::VZDump::check_vmids(@vmids)
	}

	my @exclude = PVE::Tools::split_list(extract_param($param, 'exclude'));
	$param->{exclude} = PVE::VZDump::check_vmids(@exclude);

	# exclude-path list need to be 0 separated
	if (defined($param->{'exclude-path'})) {
	    my @expaths = split(/\0/, $param->{'exclude-path'} || '');
	    $param->{'exclude-path'} = [ @expaths ];
	}

	if (defined($param->{mailto})) {
	    my @mailto = PVE::Tools::split_list(extract_param($param, 'mailto'));
	    $param->{mailto} = [ @mailto ];
	}

	die "you can only backup a single VM with option --stdout\n"
	    if $param->{stdout} && scalar(@vmids) != 1;

	$rpcenv->check($user, "/storage/$param->{storage}", [ 'Datastore.AllocateSpace' ])
	    if $param->{storage};

	my $worker = sub {
	    my $upid = shift;

	    $SIG{INT} = $SIG{TERM} = $SIG{QUIT} = $SIG{HUP} = $SIG{PIPE} = sub {
		die "interrupted by signal\n";
	    };

	    my $vzdump = PVE::VZDump->new($cmdline, $param, $skiplist);

	    eval {
		$vzdump->getlock($upid); # only one process allowed
	    };
	    if (my $err = $@) {
		$vzdump->sendmail([], 0, $err);
		exit(-1);
	    }

	    if (defined($param->{ionice})) {
		if ($param->{ionice} > 7) {
		    PVE::VZDump::run_command(undef, "ionice -c3 -p $$");
		} else {
		    PVE::VZDump::run_command(undef, "ionice -c2 -n$param->{ionice} -p $$");
		}
	    }
	    $vzdump->exec_backup($rpcenv, $user); 
	}; 

	open STDOUT, '>/dev/null' if $param->{quiet} && !$param->{stdout};
	open STDERR, '>/dev/null' if $param->{quiet};

	if ($rpcenv->{type} eq 'cli') {
	    if ($param->{stdout}) {

		open my $saved_stdout, ">&STDOUT"
		    || die "can't dup STDOUT: $!\n";

		open STDOUT, '>&STDERR' ||
		    die "unable to redirect STDOUT: $!\n";

		$param->{stdout} = $saved_stdout;
	    }
	}

	return $rpcenv->fork_worker('vzdump', undef, $user, $worker);
   }});

__PACKAGE__->register_method ({
    name => 'extractconfig',
    path => 'extractconfig',
    method => 'GET',
    description => "Extract configuration from vzdump backup archive.",
    permissions => {
	description => "The user needs 'VM.Backup' permissions on the backed up guest ID, and 'Datastore.AllocateSpace' on the backup storage.",
	user => 'all',
    },
    protected => 1,
    proxyto => 'node',
    parameters => {
	additionalProperties => 0,
	properties => {
	    node => get_standard_option('pve-node'),
	    volume => {
		description => "Volume identifier",
		type => 'string',
		completion => \&PVE::Storage::complete_volume,
	    },
	},
    },
    returns => { type => 'string' },
    code => sub {
	my ($param) = @_;

	my $volume = extract_param($param, 'volume');

	my $rpcenv = PVE::RPCEnvironment::get();
	my $authuser = $rpcenv->get_user();

	my $storage_cfg = PVE::Storage::config();
	PVE::Storage::check_volume_access($rpcenv, $authuser, $storage_cfg, undef, $volume);

	return PVE::Storage::extract_vzdump_config($storage_cfg, $volume);
    }});

1;
