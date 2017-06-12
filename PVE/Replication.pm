package PVE::Replication;

use warnings;
use strict;
use Data::Dumper;
use JSON;
use Time::HiRes qw(gettimeofday tv_interval);

use PVE::INotify;
use PVE::ProcFSTools;
use PVE::Tools;
use PVE::Cluster;
use PVE::Storage;
use PVE::GuestHelpers;
use PVE::ReplicationConfig;
use PVE::ReplicationState;


# regression tests should overwrite this
sub get_log_time {

    return time();
}

sub remote_prepare_local_job {
    my ($ssh_info, $jobid, $vmid, $volumes, $storeid_list, $last_sync, $parent_snapname, $force, $logfunc) = @_;

    my $ssh_cmd = PVE::Cluster::ssh_info_to_command($ssh_info);
    my $cmd = [@$ssh_cmd, '--', 'pvesr', 'prepare-local-job', $jobid];
    push @$cmd, '--scan', join(',', @$storeid_list) if scalar(@$storeid_list);
    push @$cmd, @$volumes if scalar(@$volumes);

    push @$cmd, '--last_sync', $last_sync;
    push @$cmd, '--parent_snapname', $parent_snapname
	if $parent_snapname;
    push @$cmd, '--force' if $force;

    my $remote_snapshots;

    my $parser = sub {
	my $line = shift;
	$remote_snapshots = JSON::decode_json($line);
    };

    my $logger = sub {
	my $line = shift;
	chomp $line;
	$logfunc->("(remote_prepare_local_job) $line");
    };

    PVE::Tools::run_command($cmd, outfunc => $parser, errfunc => $logger);

    die "prepare remote node failed - no result\n"
	if !defined($remote_snapshots);

    return $remote_snapshots;
}

sub remote_finalize_local_job {
    my ($ssh_info, $jobid, $vmid, $volumes, $last_sync, $logfunc) = @_;

    my $ssh_cmd = PVE::Cluster::ssh_info_to_command($ssh_info);
    my $cmd = [@$ssh_cmd, '--', 'pvesr', 'finalize-local-job', $jobid,
	       @$volumes, '--last_sync', $last_sync];

    my $logger = sub {
	my $line = shift;
	chomp $line;
	$logfunc->("(remote_finalize_local_job) $line");
    };

    PVE::Tools::run_command($cmd, outfunc => $logger, errfunc => $logger);
}

# finds local replication snapshots from $last_sync
# and removes all replication snapshots with other time stamps
sub prepare {
    my ($storecfg, $volids, $jobid, $last_sync, $parent_snapname, $logfunc) = @_;

    $last_sync //= 0;

    my ($prefix, $snapname) =
	PVE::ReplicationState::replication_snapshot_name($jobid, $last_sync);

    my $last_snapshots = {};
    my $cleaned_replicated_volumes = {};
    foreach my $volid (@$volids) {
	my $list = PVE::Storage::volume_snapshot_list($storecfg, $volid);
	foreach my $snap (@$list) {
	    if ($snap eq $snapname || (defined($parent_snapname) && ($snap eq $parent_snapname))) {
		$last_snapshots->{$volid}->{$snap} = 1;
	    } elsif ($snap =~ m/^\Q$prefix\E/) {
		$logfunc->("delete stale replication snapshot '$snap' on $volid");
		PVE::Storage::volume_snapshot_delete($storecfg, $volid, $snap);
		$cleaned_replicated_volumes->{$volid} = 1;
	    }
	}
    }

    return wantarray ? ($last_snapshots, $cleaned_replicated_volumes) : $last_snapshots;
}

sub replicate_volume {
    my ($ssh_info, $storecfg, $volid, $base_snapshot, $sync_snapname, $rate, $insecure) = @_;

    my ($storeid, $volname) = PVE::Storage::parse_volume_id($volid);

    # fixme: handle $rate, $insecure ??
    PVE::Storage::storage_migrate($storecfg, $volid, $ssh_info, $storeid, $volname,
				  $base_snapshot, $sync_snapname);
}


sub replicate {
    my ($guest_class, $jobcfg, $state, $start_time, $logfunc) = @_;

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

    my $conf = $guest_class->load_config($vmid);
    my ($running, $freezefs) = $guest_class->__snapshot_check_freeze_needed($vmid, $conf, 0);
    my $volumes = $guest_class->get_replicatable_volumes($storecfg, $conf);

    my $sorted_volids = [ sort keys %$volumes ];

    $running //= 0;  # to avoid undef warnings from logfunc

    $logfunc->("guest => $vmid, type => $vmtype, running => $running");
    $logfunc->("volumes => " . join(',', @$sorted_volids));

    if (my $remove_job = $jobcfg->{remove_job}) {

	$logfunc->("start job removal - mode '${remove_job}'");

	if ($remove_job eq 'full' && $jobcfg->{target} ne $local_node) {
	    # remove all remote volumes
	    my $ssh_info = PVE::Cluster::get_ssh_info($jobcfg->{target});
	    remote_prepare_local_job($ssh_info, $jobid, $vmid, [], $state->{storeid_list}, 0, undef, 1, $logfunc);

	}
	# remove all local replication snapshots (lastsync => 0)
	prepare($storecfg, $sorted_volids, $jobid, 0, undef, $logfunc);

	PVE::ReplicationConfig::delete_job($jobid); # update config
	$logfunc->("job removed");

	return;
    }

    my $ssh_info = PVE::Cluster::get_ssh_info($jobcfg->{target}, $migration_network);

    my $last_sync_snapname =
	PVE::ReplicationState::replication_snapshot_name($jobid, $last_sync);
    my $sync_snapname =
	PVE::ReplicationState::replication_snapshot_name($jobid, $start_time);

    my $parent_snapname = $conf->{parent};

    # test if we have a replication_ snapshot from last sync
    # and remove all other/stale replication snapshots

    my $last_snapshots = prepare(
	$storecfg, $sorted_volids, $jobid, $last_sync, $parent_snapname, $logfunc);

    # prepare remote side
    my $remote_snapshots = remote_prepare_local_job(
	$ssh_info, $jobid, $vmid, $sorted_volids, $state->{storeid_list}, $last_sync, $parent_snapname, 0, $logfunc);

    my $storeid_hash = {};
    foreach my $volid (@$sorted_volids) {
	my ($storeid) = PVE::Storage::parse_volume_id($volid);
	$storeid_hash->{$storeid} = 1;
    }
    $state->{storeid_list} = [ sort keys %$storeid_hash ];

    # freeze filesystem for data consistency
    if ($freezefs) {
	$logfunc->("freeze guest filesystem");
	$guest_class->__snapshot_freeze($vmid, 0);
    }

    # make snapshot of all volumes
    my $replicate_snapshots = {};
    eval {
	foreach my $volid (@$sorted_volids) {
	    $logfunc->("create snapshot '${sync_snapname}' on $volid");
	    PVE::Storage::volume_snapshot($storecfg, $volid, $sync_snapname);
	    $replicate_snapshots->{$volid} = 1;
	}
    };
    my $err = $@;

    # unfreeze immediately
    if ($freezefs) {
	$guest_class->__snapshot_freeze($vmid, 1);
    }

    my $cleanup_local_snapshots = sub {
	my ($volid_hash, $snapname) = @_;
	foreach my $volid (sort keys %$volid_hash) {
	    $logfunc->("delete previous replication snapshot '$snapname' on $volid");
	    eval { PVE::Storage::volume_snapshot_delete($storecfg, $volid, $snapname); };
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

	    if (defined($last_snapshots->{$volid}) && defined($remote_snapshots->{$volid})) {
		if ($last_snapshots->{$volid}->{$last_sync_snapname} &&
		    $remote_snapshots->{$volid}->{$last_sync_snapname}) {
		    $logfunc->("incremental sync '$volid' ($last_sync_snapname => $sync_snapname)");
		    $base_snapname = $last_sync_snapname;
		} elsif (defined($parent_snapname) &&
			 ($last_snapshots->{$volid}->{$parent_snapname} &&
			  $remote_snapshots->{$volid}->{$parent_snapname})) {
		    $logfunc->("incremental sync '$volid' ($parent_snapname => $sync_snapname)");
		    $base_snapname = $parent_snapname;
		}
	    }

	    $logfunc->("full sync '$volid' ($sync_snapname)") if !defined($base_snapname);
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

    remote_finalize_local_job($ssh_info, $jobid, $vmid, $sorted_volids, $start_time, $logfunc);

    die $err if $err;
}

my $run_replication_nolock = sub {
    my ($guest_class, $jobcfg, $iteration, $start_time, $logfunc) = @_;

    my $jobid = $jobcfg->{id};

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

	mkdir $PVE::ReplicationState::replicate_logdir;
	my $logfile = PVE::ReplicationState::job_logfile_name($jobid);
	open(my $logfd, '>', $logfile) ||
	    die "unable to open replication log '$logfile' - $!\n";

	my $logfunc_wrapper = sub {
	    my ($msg) = @_;

	    my $ctime = get_log_time();
	    print $logfd "$ctime $jobid: $msg\n";
	    $logfunc->("$ctime $jobid: $msg") if $logfunc;
	};

	$logfunc_wrapper->("start replication job");

	eval {
	    replicate($guest_class, $jobcfg, $state, $start_time, $logfunc_wrapper);
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
	    $logfunc_wrapper->("end replication job with error: $err");
	} else {
	    $logfunc_wrapper->("end replication job");
	    $state->{last_sync} = $start_time;
	    $state->{fail_count} = 0;
	    delete $state->{error};
	    PVE::ReplicationState::write_job_state($jobcfg,  $state);
	}

	close($logfd);
    };
    if (my $err = $@) {
	warn "$jobid: got unexpected replication job error - $err";
    }
};

sub run_replication {
    my ($guest_class, $jobcfg, $iteration, $start_time, $logfunc, $noerr) = @_;

    eval {
	my $timeout = 2; # do not wait too long - we repeat periodically anyways
	PVE::GuestHelpers::guest_migration_lock(
	    $jobcfg->{guest}, $timeout, $run_replication_nolock,
	    $guest_class, $jobcfg, $iteration, $start_time, $logfunc);
    };
    if (my $err = $@) {
	return undef if $noerr;
	die $err;
    }
}

1;
