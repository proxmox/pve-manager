package PVE::CLI::pvesr;

use strict;
use warnings;
use POSIX qw(strftime);
use JSON;

use PVE::JSONSchema qw(get_standard_option);
use PVE::INotify;
use PVE::RPCEnvironment;
use PVE::Tools qw(extract_param);
use PVE::SafeSyslog;
use PVE::CLIHandler;

use PVE::Cluster;
use PVE::Replication;
use PVE::API2::ReplicationConfig;
use PVE::API2::Replication;

use base qw(PVE::CLIHandler);

my $nodename = PVE::INotify::nodename();

sub setup_environment {
    PVE::RPCEnvironment->setup_default_cli_env();
}

__PACKAGE__->register_method ({
    name => 'prepare_local_job',
    path => 'prepare_local_job',
    method => 'POST',
    description => "Prepare for starting a replication job. This is called on the target node before replication starts. This call is for internal use, and return a JSON object on stdout. The method first test if VM <vmid> reside on the local node. If so, stop immediately. After that the method scans all volume IDs for snapshots, and removes all replications snapshots with timestamps different than <last_sync>. It also removes any unused volumes. Returns a hash with boolean markers for all volumes with existing replication snapshots.",
    parameters => {
	additionalProperties => 0,
	properties => {
	    id => get_standard_option('pve-replication-id'),
	    'extra-args' => get_standard_option('extra-args', {
		description => "The list of volume IDs to consider." }),
	    force => {
		description => "Allow to remove all existion volumes (empty volume list).",
		type => 'boolean',
		optional => 1,
		default => 0,
	    },
	    last_sync => {
		description => "Time (UNIX epoch) of last successful sync. If not specified, all replication snapshots get removed.",
		type => 'integer',
		minimum => 0,
		optional => 1,
	    },
	},
    },
    returns => { type => 'null' },
    code => sub {
	my ($param) = @_;

	my ($vmid, undef, $jobid) = PVE::ReplicationConfig::parse_replication_job_id($param->{id});
	my $last_sync = $param->{last_sync} // 0;

	my $local_node = PVE::INotify::nodename();

	my $vms = PVE::Cluster::get_vmlist();
	die "guest '$vmid' is on local node\n"
	    if $vms->{ids}->{$vmid} && $vms->{ids}->{$vmid}->{node} eq $local_node;

	my $storecfg = PVE::Storage::config();

	my $dl = PVE::Storage::vdisk_list($storecfg, undef, $vmid);

	my $volids = [];

	die "no volumes specified\n"
	    if !$param->{force} && !scalar(@{$param->{'extra-args'}});

	foreach my $volid (@{$param->{'extra-args'}}) {

	    my ($storeid, $volname) = PVE::Storage::parse_volume_id($volid);
	    my $scfg = PVE::Storage::storage_check_enabled($storecfg, $storeid, $local_node);
	    die "storage '$storeid' is a shared storage\n" if $scfg->{shared};

	    my ($vtype, undef, $ownervm) = PVE::Storage::parse_volname($storecfg, $volid);
	    die "volume '$volid' has wrong vtype ($vtype != 'images')\n"
		if $vtype ne 'images';
	    die "volume '$volid' has wrong owner\n"
		if !$ownervm || $vmid != $ownervm;

	    my $found = 0;
	    foreach my $info (@{$dl->{$storeid}}) {
		if ($info->{volid} eq $volid) {
		    $found = 1;
		    last;
		}
	    }

	    push @$volids, $volid if $found;
	}

	$volids = [ sort @$volids ];

	my $logfunc = sub {
	    my ($msg) = @_;
	    print STDERR "$msg\n";
	};

	# remove stale volumes
	foreach my $storeid (keys %$dl) {
	    my $scfg = PVE::Storage::storage_check_enabled($storecfg, $storeid, $local_node, 1);
	    next if !$scfg || $scfg->{shared};
	    foreach my $info (@{$dl->{$storeid}}) {
		my $volid = $info->{volid};
		next if grep { $_ eq $volid } @$volids;
		$logfunc->("$jobid: delete stale volume '$volid'");
		PVE::Storage::vdisk_free($storecfg, $volid);
	    }
	}

	my $last_snapshots = PVE::Replication::prepare(
	    $storecfg, $volids, $jobid, $last_sync, undef, $logfunc);

	print to_json($last_snapshots) . "\n";

	return undef;
    }});

__PACKAGE__->register_method ({
    name => 'finalize_local_job',
    path => 'finalize_local_job',
    method => 'POST',
    description => "Finalize a replication job. This removes all replications snapshots with timestamps different than <last_sync>.",
    parameters => {
	additionalProperties => 0,
	properties => {
	    id => get_standard_option('pve-replication-id'),
	    'extra-args' => get_standard_option('extra-args', {
		description => "The list of volume IDs to consider." }),
	    last_sync => {
		description => "Time (UNIX epoch) of last successful sync. If not specified, all replication snapshots gets removed.",
		type => 'integer',
		minimum => 0,
		optional => 1,
	    },
	},
    },
    returns => { type => 'null' },
    code => sub {
	my ($param) = @_;

	my ($vmid, undef, $jobid) = PVE::ReplicationConfig::parse_replication_job_id($param->{id});
	my $last_sync = $param->{last_sync} // 0;

	my $local_node = PVE::INotify::nodename();

	my $vms = PVE::Cluster::get_vmlist();
	die "guest '$vmid' is on local node\n"
	    if $vms->{ids}->{$vmid} && $vms->{ids}->{$vmid}->{node} eq $local_node;

	my $storecfg = PVE::Storage::config();

	my $volids = [];

	die "no volumes specified\n" if !scalar(@{$param->{'extra-args'}});

	foreach my $volid (@{$param->{'extra-args'}}) {

	    my ($storeid, $volname) = PVE::Storage::parse_volume_id($volid);
	    my $scfg = PVE::Storage::storage_check_enabled($storecfg, $storeid, $local_node);
	    die "storage '$storeid' is a shared storage\n" if $scfg->{shared};

	    my ($vtype, undef, $ownervm) = PVE::Storage::parse_volname($storecfg, $volid);
	    die "volume '$volid' has wrong vtype ($vtype != 'images')\n"
		if $vtype ne 'images';
	    die "volume '$volid' has wrong owner\n"
		if !$ownervm || $vmid != $ownervm;

	    push @$volids, $volid;
	}

	$volids = [ sort @$volids ];

	my $logfunc = sub {
	    my ($msg) = @_;
	    print STDERR "$msg\n";
	};

	my $last_snapshots = PVE::Replication::prepare(
	    $storecfg, $volids, $jobid, $last_sync, undef, $logfunc);

	return undef;
    }});

__PACKAGE__->register_method ({
    name => 'run',
    path => 'run',
    method => 'POST',
    description => "This method is called by the systemd-timer and executes all (or a specific) sync jobs.",
    parameters => {
	additionalProperties => 0,
	properties => {
	    id => get_standard_option('pve-replication-id', { optional => 1 }),
	    verbose => {
		description => "Print more verbose logs to stdout.",
		type => 'boolean',
		default => 0,
		optional => 1,
	    },
	},
    },
    returns => { type => 'null' },
    code => sub {
	my ($param) = @_;

	my $logfunc;

	if ($param->{verbose}) {
	    $logfunc = sub {
		my ($msg) = @_;
		print "$msg\n";
	    };
	}

	if (my $id = extract_param($param, 'id')) {

	    PVE::Replication::run_single_job($id, undef, $logfunc);

	} else {

	    PVE::Replication::run_jobs(undef, $logfunc);
	}

	return undef;
    }});

__PACKAGE__->register_method ({
    name => 'enable',
    path => 'enable',
    method => 'POST',
    description => "Enable a replication job.",
    parameters => {
	additionalProperties => 0,
	properties => {
	    id => get_standard_option('pve-replication-id'),
	},
    },
    returns => { type => 'null' },
    code => sub {
	my ($param) = @_;

	$param->{disable} = 0;

	return PVE::API2::ReplicationConfig->update($param);
    }});

__PACKAGE__->register_method ({
    name => 'disable',
    path => 'disable',
    method => 'POST',
    description => "Disable a replication job.",
    parameters => {
	additionalProperties => 0,
	properties => {
	    id => get_standard_option('pve-replication-id'),
	},
    },
    returns => { type => 'null' },
    code => sub {
	my ($param) = @_;

	$param->{disable} = 1;

	return PVE::API2::ReplicationConfig->update($param);
    }});

my $print_job_list = sub {
    my ($list) = @_;

    my $format = "%-20s %-20s %10s %5s %8s\n";

    printf($format, "JobID", "Target", "Schedule", "Rate", "Enabled");

    foreach my $job (sort { $a->{guest} <=> $b->{guest} } @$list) {
	my $plugin = PVE::ReplicationConfig->lookup($job->{type});
	my $tid = $plugin->get_unique_target_id($job);

	printf($format, $job->{id}, $tid,
	       defined($job->{schedule}) ? $job->{schedule} : '*/15',
	       defined($job->{rate}) ? $job->{rate} : '-',
	       $job->{disable} ? 'no' : 'yes'
	    );
    }
};

my $print_job_status = sub {
    my ($list) = @_;

    my $format = "%-20s %-20s %20s %20s %10s %10s %s\n";

    printf($format, "JobID", "Target", "LastSync", "NextSync", "Duration", "FailCount", "State");

    foreach my $job (sort { $a->{guest} <=> $b->{guest} } @$list) {
	my $plugin = PVE::ReplicationConfig->lookup($job->{type});
	my $tid = $plugin->get_unique_target_id($job);

	my $timestr = '-';
	if ($job->{last_sync}) {
	    $timestr = strftime("%Y-%m-%d_%H:%M:%S", localtime($job->{last_sync}));
	}

	my $nextstr = '-';
	if (my $next = $job->{next_sync}) {
	    my $now = time();
	    if ($next > $now) {
		$nextstr = strftime("%Y-%m-%d_%H:%M:%S", localtime($job->{next_sync}));
	    } else {
		$nextstr = 'now';
	    }
	}

	my $state = $job->{pid} ? "SYNCING" : $job->{error} // 'OK';

	printf($format, $job->{id}, $tid,
	       $timestr, $nextstr, $job->{duration} // '-',
	       $job->{fail_count}, $state);
    }
};

our $cmddef = {
    status => [ 'PVE::API2::Replication', 'status', [], { node => $nodename }, $print_job_status ],

    list => [ 'PVE::API2::ReplicationConfig', 'index' , [], {}, $print_job_list ],
    read => [ 'PVE::API2::ReplicationConfig', 'read' , ['id'], {},
	     sub { my $res = shift; print to_json($res, { utf8 => 1, pretty => 1, canonical => 1}); }],
    update => [ 'PVE::API2::ReplicationConfig', 'update' , ['id'], {} ],
    delete => [ 'PVE::API2::ReplicationConfig', 'delete' , ['id'], {} ],
    'create-local-job' => [ 'PVE::API2::ReplicationConfig', 'create' , ['id', 'target'],
			    { type => 'local' } ],

    enable => [ __PACKAGE__, 'enable', ['id'], {}],
    disable => [ __PACKAGE__, 'disable', ['id'], {}],

    'prepare-local-job' => [ __PACKAGE__, 'prepare_local_job', ['id', 'extra-args'], {} ],
    'finalize-local-job' => [ __PACKAGE__, 'finalize_local_job', ['id', 'extra-args'], {} ],

    run => [ __PACKAGE__ , 'run'],
};

1;
