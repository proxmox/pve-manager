package PVE::Jobs;

use strict;
use warnings;
use JSON;

use PVE::Cluster qw(cfs_read_file cfs_lock_file);
use PVE::Jobs::Plugin;
use PVE::Jobs::VZDump;
use PVE::Tools;

PVE::Jobs::VZDump->register();
PVE::Jobs::Plugin->init();

my $state_dir = "/var/lib/pve-manager/jobs";
my $lock_dir = "/var/lock/pve-manager";

my $get_state_file = sub {
    my ($jobid, $type) = @_;
    return "$state_dir/$type-$jobid.json";
};

my $default_state = {
    state => 'created',
    time => 0,
};

# lockless, since we use file_get_contents, which is atomic
sub read_job_state {
    my ($jobid, $type) = @_;
    my $path = $get_state_file->($jobid, $type);
    return if ! -e $path;

    my $raw = PVE::Tools::file_get_contents($path);

    return $default_state if $raw eq '';

    # untaint $raw
    if ($raw =~ m/^(\{.*\})$/) {
	return decode_json($1);
    }

    die "invalid json data in '$path'\n";
}

sub lock_job_state {
    my ($jobid, $type, $sub) = @_;

    my $filename = "$lock_dir/$type-$jobid.lck";

    my $res = PVE::Tools::lock_file($filename, 10, $sub);
    die $@ if $@;

    return $res;
}

my $get_job_task_status = sub {
    my ($state) = @_;

    if (!defined($state->{upid})) {
	return; # not started
    }

    my ($task, $filename) = PVE::Tools::upid_decode($state->{upid}, 1);
    die "unable to parse worker upid - $state->{upid}\n" if !$task;
    die "no such task\n" if ! -f $filename;

    my $pstart = PVE::ProcFSTools::read_proc_starttime($task->{pid});
    if ($pstart && $pstart == $task->{pstart}) {
	return; # still running
    }

    return PVE::Tools::upid_read_status($state->{upid});
};

# checks if the job is already finished if it was started before and
# updates the statefile accordingly
sub update_job_stopped {
    my ($jobid, $type) = @_;

    # first check unlocked to save time,
    my $state = read_job_state($jobid, $type);
    return if !defined($state) || $state->{state} ne 'started'; # removed or not started

    if (defined($get_job_task_status->($state))) {
	lock_job_state($jobid, $type, sub {
	    my $state = read_job_state($jobid, $type);
	    return if !defined($state) || $state->{state} ne 'started'; # removed or not started

	    my $new_state = {
		state => 'stopped',
		msg => $get_job_task_status->($state) // 'internal error',
		upid => $state->{upid},
	    };

	    if ($state->{updated}) { # save updated time stamp
		$new_state->{updated} = $state->{updated};
	    }

	    my $path = $get_state_file->($jobid, $type);
	    PVE::Tools::file_set_contents($path, encode_json($new_state));
	});
    }
}

# must be called when the job is first created
sub create_job {
    my ($jobid, $type) = @_;

    lock_job_state($jobid, $type, sub {
	my $state = read_job_state($jobid, $type) // $default_state;

	if ($state->{state} ne 'created') {
	    die "job state already exists\n";
	}

	$state->{time} = time();

	my $path = $get_state_file->($jobid, $type);
	PVE::Tools::file_set_contents($path, encode_json($state));
    });
}

# to be called when the job is removed
sub remove_job {
    my ($jobid, $type) = @_;
    my $path = $get_state_file->($jobid, $type);
    unlink $path;
}

# checks if the job can be started and sets the state to 'starting'
# returns 1 if the job can be started, 0 otherwise
sub starting_job {
    my ($jobid, $type) = @_;

    # first check unlocked to save time
    my $state = read_job_state($jobid, $type);
    return 0 if !defined($state) || $state->{state} eq 'started'; # removed or already started

    lock_job_state($jobid, $type, sub {
	my $state = read_job_state($jobid, $type);
	return 0 if !defined($state) || $state->{state} eq 'started'; # removed or already started

	my $new_state = {
	    state => 'starting',
	    time => time(),
	};

	my $path = $get_state_file->($jobid, $type);
	PVE::Tools::file_set_contents($path, encode_json($new_state));
    });
    return 1;
}

sub started_job {
    my ($jobid, $type, $upid, $msg) = @_;

    lock_job_state($jobid, $type, sub {
	my $state = read_job_state($jobid, $type);
	return if !defined($state); # job was removed, do not update
	die "unexpected state '$state->{state}'\n" if $state->{state} ne 'starting';

	my $new_state;
	if (defined($msg)) {
	    $new_state = {
		state => 'stopped',
		msg => $msg,
		time => time(),
	    };
	} else {
	    $new_state = {
		state => 'started',
		upid => $upid,
	    };
	}

	my $path = $get_state_file->($jobid, $type);
	PVE::Tools::file_set_contents($path, encode_json($new_state));
    });
}

# will be called when the job schedule is updated
sub update_last_runtime {
    my ($jobid, $type) = @_;
    lock_job_state($jobid, $type, sub {
	my $old_state = read_job_state($jobid, $type) // $default_state;

	$old_state->{updated} = time();

	my $path = $get_state_file->($jobid, $type);
	PVE::Tools::file_set_contents($path, encode_json($old_state));
    });
}

sub get_last_runtime {
    my ($jobid, $type) = @_;

    my $state = read_job_state($jobid, $type) // $default_state;

    return $state->{updated} if defined($state->{updated});

    if (my $upid = $state->{upid}) {
	my ($task) = PVE::Tools::upid_decode($upid, 1);
	die "unable to parse worker upid\n" if !$task;
	return $task->{starttime};
    }

    return $state->{time} // 0;
}

sub run_jobs {
    my ($first_run) = @_;

    synchronize_job_states_with_config();

    my $jobs_cfg = cfs_read_file('jobs.cfg');
    my $nodename = PVE::INotify::nodename();

    foreach my $id (sort keys %{$jobs_cfg->{ids}}) {
	my $cfg = $jobs_cfg->{ids}->{$id};
	my $type = $cfg->{type};
	my $schedule = delete $cfg->{schedule};

	# only schedule local jobs
	next if defined($cfg->{node}) && $cfg->{node} ne $nodename;

	eval { update_job_stopped($id, $type) };
	if (my $err = $@) {
	    warn "could not update job state, skipping - $err\n";
	    next;
	}

	# update last runtime on the first run when 'repeat-missed' is 0, so that a missed job
	# will not start immediately after boot
	update_last_runtime($id, $type) if $first_run && !$cfg->{'repeat-missed'};

	next if defined($cfg->{enabled}) && !$cfg->{enabled}; # only schedule actually enabled jobs

	my $last_run = get_last_runtime($id, $type);
	my $calspec = PVE::CalendarEvent::parse_calendar_event($schedule);
	my $next_sync = PVE::CalendarEvent::compute_next_event($calspec, $last_run);

	next if !defined($next_sync) || time() < $next_sync; # not yet its (next) turn

	my $plugin = PVE::Jobs::Plugin->lookup($type);
	if (starting_job($id, $type)) {
	    my $upid = eval { $plugin->run($cfg) };
	    if (my $err = $@) {
		warn $@ if $@;
		started_job($id, $type, undef, $err);
	    } elsif ($upid eq 'OK') { # some jobs return OK immediately
		started_job($id, $type, undef, 'OK');
	    } else {
		started_job($id, $type, $upid);
	    }
	}
    }
}

# creates and removes statefiles for job configs
sub synchronize_job_states_with_config {
    cfs_lock_file('jobs.cfg', undef, sub {
	my $data = cfs_read_file('jobs.cfg');

	for my $id (keys $data->{ids}->%*) {
	    my $job = $data->{ids}->{$id};
	    my $type = $job->{type};
	    my $jobstate = read_job_state($id, $type);
	    create_job($id, $type) if !defined($jobstate);
	}

	PVE::Tools::dir_glob_foreach($state_dir, '(.*?)-(.*).json', sub {
	    my ($path, $type, $id) = @_;

	    if (!defined($data->{ids}->{$id})) {
		remove_job($id, $type);
	    }
	});
    });
    die $@ if $@;
}

sub setup_dirs {
    mkdir $state_dir;
    mkdir $lock_dir;
}

1;
