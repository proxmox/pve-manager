package PVE::Replication;

use warnings;
use strict;
use Data::Dumper;
use JSON;
use Time::HiRes qw(gettimeofday tv_interval);

use PVE::INotify;
use PVE::ProcFSTools;
use PVE::Tools;
use PVE::CalendarEvent;
use PVE::Cluster;
use PVE::QemuConfig;
use PVE::QemuServer;
use PVE::LXC::Config;
use PVE::LXC;
use PVE::Storage;
use PVE::ReplicationConfig;

# Note: regression tests can overwrite $state_path for testing
our $state_path = "/var/lib/pve-manager/pve-replication-state.json";

my $update_job_state = sub {
    my ($stateobj, $jobcfg, $state) = @_;

    my $plugin = PVE::ReplicationConfig->lookup($jobcfg->{type});

    my $vmid = $jobcfg->{guest};
    my $tid = $plugin->get_unique_target_id($jobcfg);

    # Note: tuple ($vmid, $tid) is unique
    $stateobj->{$vmid}->{$tid} = $state;

    PVE::Tools::file_set_contents($state_path, encode_json($stateobj));
};

my $get_job_state = sub {
    my ($stateobj, $jobcfg) = @_;

    my $plugin = PVE::ReplicationConfig->lookup($jobcfg->{type});

    my $vmid = $jobcfg->{guest};
    my $tid = $plugin->get_unique_target_id($jobcfg);
    my $state = $stateobj->{$vmid}->{$tid};

    $state = {} if !$state;

    $state->{last_iteration} //= 0;
    $state->{last_try} //= 0; # last sync start time
    $state->{last_sync} //= 0; # last successful sync start time
    $state->{fail_count} //= 0;

    return $state;
};

my $read_state = sub {

    return {} if ! -e $state_path;

    my $raw = PVE::Tools::file_get_contents($state_path);

    return {} if $raw eq '';

    return decode_json($raw);
};

sub job_status {
    my ($stateobj) = @_;

    my $local_node = PVE::INotify::nodename();

    my $jobs = {};

    $stateobj = $read_state->() if !$stateobj;

    my $cfg = PVE::ReplicationConfig->new();

    my $vms = PVE::Cluster::get_vmlist();

    foreach my $jobid (sort keys %{$cfg->{ids}}) {
	my $jobcfg = $cfg->{ids}->{$jobid};
	my $vmid = $jobcfg->{guest};

	die "internal error - not implemented" if $jobcfg->{type} ne 'local';

	# skip non existing vms
	next if !$vms->{ids}->{$vmid};

	# only consider guest on local node
	next if $vms->{ids}->{$vmid}->{node} ne $local_node;

	# never sync to local node
	next if $jobcfg->{target} eq $local_node;

	next if $jobcfg->{disable};

	my $state = $get_job_state->($stateobj, $jobcfg);
	$jobcfg->{state} = $state;
	$jobcfg->{id} = $jobid;
	$jobcfg->{vmtype} = $vms->{ids}->{$vmid}->{type};

	my $next_sync = 0;
	if (my $fail_count = $state->{fail_count}) {
	    if ($fail_count < 3) {
		$next_sync = $state->{last_try} + 5*60*$fail_count;
	    }
	} else {
	    my $schedule =  $jobcfg->{schedule} || '*/15';
	    my $calspec = PVE::CalendarEvent::parse_calendar_event($schedule);
	    $next_sync = PVE::CalendarEvent::compute_next_event($calspec, $state->{last_try}) // 0;
	}
	$jobcfg->{next_sync} = $next_sync;

	$jobs->{$jobid} = $jobcfg;
    }

    return $jobs;
}

my $get_next_job = sub {
    my ($stateobj, $iteration, $start_time) = @_;

    my $next_jobid;

    my $jobs = job_status($stateobj);

    my $sort_func = sub {
	my $joba = $jobs->{$a};
	my $jobb = $jobs->{$b};
	my $sa =  $joba->{state};
	my $sb =  $jobb->{state};
	my $res = $sa->{last_iteration} cmp $sb->{last_iteration};
	return $res if $res != 0;
	$res = $joba->{next_sync} <=> $jobb->{next_sync};
	return $res if $res != 0;
	return  $joba->{guest} <=> $jobb->{guest};
    };

    foreach my $jobid (sort $sort_func keys %$jobs) {
	my $jobcfg = $jobs->{$jobid};
	next if $jobcfg->{state}->{last_iteration} >= $iteration;
	if ($jobcfg->{next_sync} && ($start_time >= $jobcfg->{next_sync})) {
	    $next_jobid = $jobid;
	    last;
	}
    }

    return undef if !$next_jobid;

    my $jobcfg = $jobs->{$next_jobid};

    $jobcfg->{state}->{last_iteration} = $iteration;
    $update_job_state->($stateobj, $jobcfg,  $jobcfg->{state});

    return $jobcfg;
};

sub replication_snapshot_name {
    my ($jobid, $last_sync) = @_;

    my $prefix = "replicate_${jobid}_";
    my $snapname = "${prefix}${last_sync}_snap";

    wantarray ? ($prefix, $snapname) : $snapname;
}

sub remote_prepare_local_job {
    my ($ssh_info, $jobid, $vmid, $volumes, $last_sync) = @_;

    my $ssh_cmd = PVE::Cluster::ssh_info_to_command($ssh_info);
    my $cmd = [@$ssh_cmd, '--', 'pvesr', 'prepare-local-job', $jobid,
	       $vmid, @$volumes, '--last_sync', $last_sync];

    my $remote_snapshots;

    my $parser = sub {
	my $line = shift;
	$remote_snapshots = JSON::decode_json($line);
    };

    PVE::Tools::run_command($cmd, outfunc => $parser);

    die "prepare remote node failed - no result\n"
	if !defined($remote_snapshots);

    return $remote_snapshots;
}

sub prepare {
    my ($storecfg, $volids, $jobid, $last_sync, $start_time, $logfunc) = @_;

    my ($prefix, $snapname) = replication_snapshot_name($jobid, $last_sync);

    my $last_snapshots = {};
    foreach my $volid (@$volids) {
	my $list = PVE::Storage::volume_snapshot_list($storecfg, $volid, $prefix);
	my $found = 0;
	foreach my $snap (@$list) {
	    if ($snap eq $snapname) {
		$last_snapshots->{$volid} = 1;
	    } else {
		$logfunc->($start_time, "$jobid: delete stale snapshot '$snap' on $volid");
		PVE::Storage::volume_snapshot_delete($storecfg, $volid, $snap);
	    }
	}
    }

    return $last_snapshots;
}

sub replicate {
    my ($jobcfg, $start_time, $logfunc) = @_;

    die "implement me";
}

my $run_replication = sub {
    my ($stateobj, $jobcfg, $start_time, $logfunc) = @_;

    my $state = delete $jobcfg->{state};

    my $t0 = [gettimeofday];

    # cleanup stale pid/ptime state
    foreach my $vmid (keys %$stateobj) {
	foreach my $tid (keys %{$stateobj->{$vmid}}) {
	    my $state = $stateobj->{$vmid}->{$tid};
	    delete $state->{pid};
	    delete $state->{ptime};
	}
    }

    $state->{pid} = $$;
    $state->{ptime} = PVE::ProcFSTools::read_proc_starttime($state->{pid});
    $state->{last_try} = $start_time;
    $update_job_state->($stateobj, $jobcfg,  $state);

    $logfunc->($start_time, "$jobcfg->{id}: start replication job") if $logfunc;

    eval { replicate($jobcfg, $start_time, $logfunc); };
    my $err = $@;

    $state->{duration} = tv_interval($t0);
    delete $state->{pid};
    delete $state->{ptime};

    if ($err) {
	$state->{fail_count}++;
	$state->{error} = "$err";
	$update_job_state->($stateobj, $jobcfg,  $state);
	if ($logfunc) {
	    chomp $err;
	    $logfunc->($start_time, "$jobcfg->{id}: end replication job with error: $err");
	} else {
	    warn $err;
	}
    } else {
	$logfunc->($start_time, "$jobcfg->{id}: end replication job") if $logfunc;
	$state->{last_sync} = $start_time;
	$state->{fail_count} = 0;
	delete $state->{error};
	$update_job_state->($stateobj, $jobcfg,  $state);
    }
};

sub run_single_job {
    my ($jobid, $now, $logfunc) = @_; # passing $now useful for regression testing

    my $local_node = PVE::INotify::nodename();

    my $code = sub {
	$now //= time();

	my $stateobj = $read_state->();

	my $cfg = PVE::ReplicationConfig->new();

	my $jobcfg = $cfg->{ids}->{$jobid};
	die "no such job '$jobid'\n" if !$jobcfg;

	die "internal error - not implemented" if $jobcfg->{type} ne 'local';

	die "job '$jobid' is disabled\n" if $jobcfg->{disable};

	my $vms = PVE::Cluster::get_vmlist();
	my $vmid = $jobcfg->{guest};

	die "no such guest '$vmid'\n" if !$vms->{ids}->{$vmid};

	die "guest '$vmid' is not on local node\n"
	    if $vms->{ids}->{$vmid}->{node} ne $local_node;

	die "unable to sync to local node\n" if $jobcfg->{target} eq $local_node;

	$jobcfg->{state} = $get_job_state->($stateobj, $jobcfg);
	$jobcfg->{id} = $jobid;
	$jobcfg->{vmtype} = $vms->{ids}->{$vmid}->{type};

	$jobcfg->{state}->{last_iteration} = $now;
	$update_job_state->($stateobj, $jobcfg,  $jobcfg->{state});

	$run_replication->($stateobj, $jobcfg, $now, $logfunc);
    };

    my $res = PVE::Tools::lock_file($state_path, 60, $code);
    die $@ if $@;
}

sub run_jobs {
    my ($now, $logfunc) = @_; # useful for regression testing

    my $iteration = $now // time();

    my $code = sub {
	my $stateobj = $read_state->();
	my $start_time = $now // time();

	while (my $jobcfg = $get_next_job->($stateobj, $iteration, $start_time)) {
	    $run_replication->($stateobj, $jobcfg, $start_time, $logfunc);
	    $start_time = $now // time();
	}
    };

    my $res = PVE::Tools::lock_file($state_path, 60, $code);
    die $@ if $@;
}

1;
