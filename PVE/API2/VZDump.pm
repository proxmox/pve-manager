package PVE::API2::VZDump;

use strict;
use warnings;
use PVE::Exception qw(raise_param_exc);;
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
    parameters => {
    	additionalProperties => 0,
	properties => {
	    vmid => {
		type => 'string', format => 'pve-vmid-list',		
		description => "The ID of the VM you want to backup.",
		optional => 1,
	    },
	    node => get_standard_option('pve-node', { 
		description => "Only run if executed on this node.",
		optional => 1,
	    }),
	    all => {
		type => 'boolean',
		description => "Backup all known VMs on this host.",
		optional => 1,
		default => 0,
	    },
	    stdexcludes => {
		type => 'boolean',
		description => "Exclude temorary files and logs.",
		optional => 1,
		default => 1,
	    },
	    compress => {
		type => 'boolean',
		description => "Compress dump file (gzip).",
		optional => 1,
		default => 0,
	    },
	    quiet => {
		type => 'boolean',
		description => "Be quiet.",
		optional => 1,
		default => 0,
	    },
	    stop => {
		type => 'boolean',
		description => "Stop/Restart VM when running.",
		optional => 1,
	    },
	    snapshot => {
		type => 'boolean',
		description => "Try to use (LVM) snapshots when running.",
		optional => 1,
	    },
	    suspend => {
		type => 'boolean',
		description => "Suspend/resume VM when running",
		optional => 1,
	    },
	    stdout => {
		type => 'boolean',
		description => "Write tar to stdout, not to a file.",
		optional => 1,
	    },
	    exclude => {
		type => 'string', format => 'pve-vmid-list',
		description => "exclude specified VMs (assumes --all)",
		optional => 1,
	    },
	    'exclude-path' => {
		type => 'string', format => 'string-list',
		description => "exclude certain files/directories (regex).",
		optional => 1,
	    },
	    mailto => {
		type => 'string', format => 'string-list',
		description => "",
		optional => 1,
	    },
	    tmpdir => {
		type => 'string',
		description => "Store temporary files to specified directory.",
		optional => 1,
	    },
	    dumpdir => {
		type => 'string',
		description => "Store resulting files to specified directory.",
		optional => 1,
	    },
	    script => {
		type => 'string',
		description => "Use specified hook script.",
		optional => 1,
	    },
	    storage => get_standard_option('pve-storage-id', {
		description => "Store resulting file to this storage.",
		optional => 1,
	    }),
	    size => {
		type => 'integer',
		description => "LVM snapshot size im MB.",
		optional => 1,
		minimum => 500,
	    },
	    bwlimit => {
		type => 'integer',
		description => "Limit I/O bandwidth (KBytes per second).",
		optional => 1,
		minimum => 0,
	    },
	    ionice => {
		type => 'integer',
		description => "Set CFQ ionice priority.",
		optional => 1,
		minimum => 0,
		maximum => 8,
	    },
	    lockwait => {
		type => 'integer',
		description => "Maximal time to wait for the global lock (minutes).",
		optional => 1,
		minimum => 0,
	    },
	    stopwait => {
		type => 'integer',
		description => "Maximal time to wait until a VM is stopped (minutes).",
		optional => 1,
		minimum => 0,
	    },
	    maxfiles => {
		type => 'integer',
		description => "Maximal number of backup files per VM.",
		optional => 1,
		minimum => 1,
	    },
	},
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

	# by default we set --rsyncable for gzip
	local $ENV{GZIP} = "--rsyncable" if !$ENV{GZIP};

	$param->{all} = 1 if defined($param->{exclude});

	raise_param_exc({ all => "option conflicts with option 'vmid'"})
	    if $param->{all} && $param->{vmid};

	raise_param_exc({ vmid => "property is missing"})
	    if !$param->{all} && !$param->{vmid};

	# silent exit if we run on wrong node
	exit(0) if $param->{node} && $param->{node} ne $nodename;

	# convert string lists to arrays
	my @vmids = PVE::Tools::split_list(extract_param($param, 'vmid'));

	my $cmdline = 'vzdump';
	$cmdline .= ' ' . join(' ', @vmids) if scalar(@vmids);
	foreach my $p (keys %$param) {
	    $cmdline .= " --$p $param->{$p}";
	}

	$param->{vmids} = PVE::VZDump::check_vmids(@vmids) if !$param->{all};
	my @exclude = PVE::Tools::split_list(extract_param($param, 'exclude'));
	$param->{exclude} = PVE::VZDump::check_vmids(@exclude);
	
	# exclude-path list need to be 0 separated
	my @expaths = split(/\0/, $param->{'exclude-path'} || '');
	$param->{'exclude-path'} = @expaths;

	my @mailto = PVE::Tools::split_list(extract_param($param, 'mailto'));
	$param->{mailto} = [ @mailto ];

	die "you can only backup a single VM with option --stdout\n"
	    if $param->{stdout} && scalar(@vmids) != 1;

	my $vzdump = PVE::VZDump->new($cmdline, $param);

	my $worker = sub {
	    $SIG{INT} = $SIG{TERM} = $SIG{QUIT} = $SIG{HUP} = $SIG{PIPE} = sub {
		die "interrupted by signal\n";
	    };

	    $vzdump->getlock (); # only one process allowed

	    if (defined($param->{ionice})) {
		if ($param->{ionice} > 7) {
		    PVE::VZDump::run_command(undef, "ionice -c3 -p $$");
		} else {
		    PVE::VZDump::run_command(undef, "ionice -c2 -n$param->{ionice} -p $$");
		}
	    }
	    $vzdump->exec_backup(); 
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
