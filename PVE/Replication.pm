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
use PVE::AbstractConfig;
use PVE::QemuConfig;
use PVE::QemuServer;
use PVE::LXC::Config;
use PVE::LXC;
use PVE::Storage;
use PVE::GuestHelpers;
use PVE::ReplicationConfig;
use PVE::ReplicationState;

our $pvesr_lock_path = "/var/lock/pvesr.lck";

sub job_status {

    my $local_node = PVE::INotify::nodename();

    my $jobs = {};

    my $stateobj = PVE::ReplicationState::read_state();

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

	if (!$jobcfg->{remove_job}) {
	    # never sync to local node
	    next if $jobcfg->{target} eq $local_node;

	    next if $jobcfg->{disable};
	}

	my $state = PVE::ReplicationState::extract_job_state($stateobj, $jobcfg);
	$jobcfg->{state} = $state;
	$jobcfg->{id} = $jobid;
	$jobcfg->{vmtype} = $vms->{ids}->{$vmid}->{type};

	my $next_sync = 0;

	if ($jobcfg->{remove_job}) {
	    $next_sync = 1; # lowest possible value
	    # todo: consider fail_count? How many retries?
	} else  {
	    if (my $fail_count = $state->{fail_count}) {
		if ($fail_count < 3) {
		    $next_sync = $state->{last_try} + 5*60*$fail_count;
		}
	    } else {
		my $schedule =  $jobcfg->{schedule} || '*/15';
		my $calspec = PVE::CalendarEvent::parse_calendar_event($schedule);
		$next_sync = PVE::CalendarEvent::compute_next_event($calspec, $state->{last_try}) // 0;
	    }
	}

	$jobcfg->{next_sync} = $next_sync;

	$jobs->{$jobid} = $jobcfg;
    }

    return $jobs;
}

my $get_next_job = sub {
    my ($iteration, $start_time) = @_;

    my $jobs = job_status();

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
	    return $jobcfg;
	}
    }

    return undef;
};

sub remote_prepare_local_job {
    my ($ssh_info, $jobid, $vmid, $volumes, $last_sync, $force) = @_;

    my $ssh_cmd = PVE::Cluster::ssh_info_to_command($ssh_info);
    my $cmd = [@$ssh_cmd, '--', 'pvesr', 'prepare-local-job', $jobid, $vmid];
    push @$cmd, @$volumes if scalar(@$volumes);

    push @$cmd, '--last_sync', $last_sync;
    push @$cmd, '--force' if $force;

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

sub remote_finalize_local_job {
    my ($ssh_info, $jobid, $vmid, $volumes, $last_sync) = @_;

    my $ssh_cmd = PVE::Cluster::ssh_info_to_command($ssh_info);
    my $cmd = [@$ssh_cmd, '--', 'pvesr', 'finalize-local-job', $jobid,
	       $vmid, @$volumes, '--last_sync', $last_sync];

    PVE::Tools::run_command($cmd);
}

sub prepare {
    my ($storecfg, $volids, $jobid, $last_sync, $start_time, $logfunc) = @_;

    my ($prefix, $snapname) =
	PVE::ReplicationState::replication_snapshot_name($jobid, $last_sync);

    my $last_snapshots = {};
    foreach my $volid (@$volids) {
	my $list = PVE::Storage::volume_snapshot_list($storecfg, $volid, $prefix);
	my $found = 0;
	foreach my $snap (@$list) {
	    if ($snap eq $snapname) {
		$last_snapshots->{$volid} = 1;
	    } else {
		$logfunc->("$jobid: delete stale snapshot '$snap' on $volid");
		PVE::Storage::volume_snapshot_delete($storecfg, $volid, $snap);
	    }
	}
    }

    return $last_snapshots;
}

sub replicate_volume {
    my ($ssh_info, $storecfg, $volid, $base_snapshot, $sync_snapname, $rate, $insecure) = @_;

    my ($storeid, $volname) = PVE::Storage::parse_volume_id($volid);

    # fixme: handle $rate, $insecure ??
    PVE::Storage::storage_migrate($storecfg, $volid, $ssh_info, $storeid, $volname,
				  $base_snapshot, $sync_snapname);
}

sub delete_job {
    my ($jobid) = @_;

    my $code = sub {
	my $cfg = PVE::ReplicationConfig->new();
	delete $cfg->{ids}->{$jobid};
	$cfg->write();
    };

    PVE::ReplicationConfig::lock($code);
}

sub replicate {
    my ($jobcfg, $state, $start_time, $logfunc) = @_;

    $logfunc = sub {} if !$logfunc; # log nothing by default

    my $local_node = PVE::INotify::nodename();

    die "not implemented - internal error" if $jobcfg->{type} ne 'local';

    my $dc_conf = PVE::Cluster::cfs_read_file('datacenter.cfg');

    my $migration_network;
    my $migration_type = 'secure';
    if (my $mc = $dc_conf->{migration}) {
	$migration_network = $mc->{network};
	$migration_type = $mc->{type} if defined($mc->{type});
    }

    my $jobid = $jobcfg->{id};
    my $storecfg = PVE::Storage::config();
    my $last_sync = $state->{last_sync};

    die "start time before last sync ($start_time <= $last_sync) - abort sync\n"
	if $start_time <= $last_sync;

    my $vmid = $jobcfg->{guest};
    my $vmtype = $jobcfg->{vmtype};

    my $conf;
    my $running;
    my $qga;
    my $volumes;

    if ($vmtype eq 'qemu') {
	$conf = PVE::QemuConfig->load_config($vmid);
	$running = PVE::QemuServer::check_running($vmid);
	$qga = PVE::QemuServer::qga_check_running($vmid)
	    if $running && $conf->{agent};
	$volumes = PVE::QemuConfig->get_replicatable_volumes($storecfg, $conf);
    } elsif ($vmtype eq 'lxc') {
	$conf = PVE::LXC::Config->load_config($vmid);
	$running = PVE::LXC::check_running($vmid);
	$volumes = PVE::LXC::Config->get_replicatable_volumes($storecfg, $conf);
    } else {
	die "internal error";
    }

    my $sorted_volids = [ sort keys %$volumes ];

    $logfunc->("$jobid: guest => $vmid, type => $vmtype, running => $running");
    $logfunc->("$jobid: volumes => " . join(',', @$sorted_volids));

    if (my $remove_job = $jobcfg->{remove_job}) {

	$logfunc->("$jobid: start job removal - mode '${remove_job}'");

	if ($remove_job eq 'full' && $jobcfg->{target} ne $local_node) {
	    # remove all remote volumes
	    my $ssh_info = PVE::Cluster::get_ssh_info($jobcfg->{target});
	    remote_prepare_local_job($ssh_info, $jobid, $vmid, [], 0, 1);

	}
	# remove all local replication snapshots (lastsync => 0)
	prepare($storecfg, $sorted_volids, $jobid, 0, $start_time, $logfunc);

	delete_job($jobid); # update config
	$logfunc->("$jobid: job removed");

	return;
    }

    my $ssh_info = PVE::Cluster::get_ssh_info($jobcfg->{target}, $migration_network);

    # prepare remote side
    my $remote_snapshots = remote_prepare_local_job(
	$ssh_info, $jobid, $vmid, $sorted_volids, $last_sync);

    # test if we have a replication_ snapshot from last sync
    # and remove all other/stale replication snapshots
    my $last_sync_snapname =
	PVE::ReplicationState::replication_snapshot_name($jobid, $last_sync);
    my $sync_snapname =
	PVE::ReplicationState::replication_snapshot_name($jobid, $start_time);

    my $last_snapshots = prepare(
	$storecfg, $sorted_volids, $jobid, $last_sync, $start_time, $logfunc);

    my $storeid_hash = {};
    foreach my $volid (@$sorted_volids) {
	my ($storeid) = PVE::Storage::parse_volume_id($volid);
	$storeid_hash->{$storeid} = 1;
    }
    $state->{storeid_list} = [ sort keys %$storeid_hash ];

    # freeze filesystem for data consistency
    if ($qga) {
	$logfunc->("$jobid: freeze guest filesystem");
	PVE::QemuServer::vm_mon_cmd($vmid, "guest-fsfreeze-freeze");
    }

    # make snapshot of all volumes
    my $replicate_snapshots = {};
    eval {
	foreach my $volid (@$sorted_volids) {
	    $logfunc->("$jobid: create snapshot '${sync_snapname}' on $volid");
	    PVE::Storage::volume_snapshot($storecfg, $volid, $sync_snapname);
	    $replicate_snapshots->{$volid} = 1;
	}
    };
    my $err = $@;

    # unfreeze immediately
    if ($qga) {
	$logfunc->("$jobid: unfreeze guest filesystem");
	eval { PVE::QemuServer::vm_mon_cmd($vmid, "guest-fsfreeze-thaw"); };
	warn $@ if $@; # ignore errors here, because we cannot fix it anyways
    }

    my $cleanup_local_snapshots = sub {
	my ($volid_hash, $snapname) = @_;
	foreach my $volid (sort keys %$volid_hash) {
	    $logfunc->("$jobid: delete snapshot '$snapname' on $volid");
	    eval { PVE::Storage::volume_snapshot_delete($storecfg, $volid, $snapname, $running); };
	    warn $@ if $@;
	}
    };

    if ($err) {
	$cleanup_local_snapshots->($replicate_snapshots, $sync_snapname); # try to cleanup
	die $err;
    }

    eval {

	my $rate = $jobcfg->{rate};
	my $insecure = $migration_type eq 'insecure';

	foreach my $volid (@$sorted_volids) {
	    my $base_snapname;
	    if ($last_snapshots->{$volid} && $remote_snapshots->{$volid}) {
		$logfunc->("$jobid: incremental sync '$volid' ($last_sync_snapname => $sync_snapname)");
		$base_snapname = $last_sync_snapname;
	    } else {
		$logfunc->("$jobid: full sync '$volid' ($sync_snapname)");
	    }
	    replicate_volume($ssh_info, $storecfg, $volid, $base_snapname, $sync_snapname, $rate, $insecure);
	}
    };
    $err = $@;

    if ($err) {
	$cleanup_local_snapshots->($replicate_snapshots, $sync_snapname); # try to cleanup
	# we do not cleanup the remote side here - this is done in
	# next run of prepare_local_job
	die $err;
    }

    # remove old snapshots because they are no longer needed
    $cleanup_local_snapshots->($last_snapshots, $last_sync_snapname);

    remote_finalize_local_job($ssh_info, $jobid, $vmid, $sorted_volids, $start_time);

    die $err if $err;
}

my $run_replication_nolock = sub {
    my ($jobcfg, $iteration, $start_time, $logfunc) = @_;

    # we normaly write errors into the state file,
    # but we also catch unexpected errors and log them to syslog
    # (for examply when there are problems writing the state file)
    eval {
	my $state = PVE::ReplicationState::read_job_state($jobcfg);

	my $t0 = [gettimeofday];

	$state->{pid} = $$;
	$state->{ptime} = PVE::ProcFSTools::read_proc_starttime($state->{pid});
	$state->{last_node} = PVE::INotify::nodename();
	$state->{last_try} = $start_time;
	$state->{last_iteration} = $iteration;
	$state->{storeid_list} //= [];

	PVE::ReplicationState::write_job_state($jobcfg, $state);

	$logfunc->("$jobcfg->{id}: start replication job") if $logfunc;

	eval {
	    replicate($jobcfg, $state, $start_time, $logfunc);
	};
	my $err = $@;

	$state->{duration} = tv_interval($t0);
	delete $state->{pid};
	delete $state->{ptime};

	if ($err) {
	    chomp $err;
	    $state->{fail_count}++;
	    $state->{error} = "$err";
	    PVE::ReplicationState::write_job_state($jobcfg,  $state);
	    my $msg = "$jobcfg->{id}: end replication job with error: $err";
	    if ($logfunc) {
		$logfunc->($msg);
	    } else {
		warn "$msg\n";
	    }
	} else {
	    $logfunc->("$jobcfg->{id}: end replication job") if $logfunc;
	    $state->{last_sync} = $start_time;
	    $state->{fail_count} = 0;
	    delete $state->{error};
	    PVE::ReplicationState::write_job_state($jobcfg,  $state);
	}
    };
    if (my $err = $@) {
	warn "$jobcfg->{id}: got unexpected error - $err";
    }
};

my $run_replication = sub {
    my ($jobcfg, $iteration, $start_time, $logfunc, $noerr) = @_;

    eval {
	my $timeout = 2; # do not wait too long - we repeat periodically anyways
	PVE::GuestHelpers::guest_migration_lock(
	    $jobcfg->{guest}, $timeout, $run_replication_nolock,
	    $jobcfg, $iteration, $start_time, $logfunc);
    };
    if (my $err = $@) {
	return undef if $noerr;
	die $err;
    }
};

sub run_single_job {
    my ($jobid, $now, $logfunc) = @_; # passing $now useful for regression testing

    my $local_node = PVE::INotify::nodename();

    my $code = sub {
	$now //= time();

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

	$jobcfg->{id} = $jobid;
	$jobcfg->{vmtype} = $vms->{ids}->{$vmid}->{type};

	$run_replication->($jobcfg, $now, $now, $logfunc);
    };

    my $res = PVE::Tools::lock_file($pvesr_lock_path, 60, $code);
    die $@ if $@;
}

sub run_jobs {
    my ($now, $logfunc) = @_; # useful for regression testing

    my $iteration = $now // time();

    my $code = sub {
	my $start_time = $now // time();

	while (my $jobcfg = $get_next_job->($iteration, $start_time)) {
	    $run_replication->($jobcfg, $iteration, $start_time, $logfunc, 1);
	    $start_time = $now // time();
	}
    };

    my $res = PVE::Tools::lock_file($pvesr_lock_path, 60, $code);
    die $@ if $@;
}

1;
