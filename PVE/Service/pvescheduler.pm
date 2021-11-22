package PVE::Service::pvescheduler;

use strict;
use warnings;

use POSIX qw(WNOHANG);

use PVE::Jobs;
use PVE::SafeSyslog;

use PVE::API2::Replication;

use PVE::Daemon;
use base qw(PVE::Daemon);

my $cmdline = [$0, @ARGV];
my %daemon_options = (stop_wait_time => 180, max_workers => 0);
my $daemon = __PACKAGE__->new('pvescheduler', $cmdline, %daemon_options);

my @types = qw(replication jobs);

my $finish_jobs = sub {
    my ($self) = @_;
    for my $type (@types) {
	if (my $cpid = $self->{jobs}->{$type}) {
	    my $waitpid = waitpid($cpid, WNOHANG);
	    if (defined($waitpid) && ($waitpid == $cpid) || $waitpid == -1) {
		$self->{jobs}->{$type} = undef;
	    }
	}
    }
};

sub hup {
    my ($self) = @_;

    for my $type (@types) {
	my $pid = $self->{jobs}->{$type};
	next if !defined($pid);
	$ENV{"PVE_DAEMON_${type}_PID"} = $pid;
    }
}

sub run {
    my ($self) = @_;

    my $jobs = {};
    $self->{jobs} = $jobs;

    for my $type (@types) {
	$self->{jobs}->{$type} = delete $ENV{"PVE_DAEMON_${type}_PID"};
	# check if children finished in the meantime
	$finish_jobs->($self);
    }

    my $old_sig_chld = $SIG{CHLD};
    local $SIG{CHLD} = sub {
	local ($@, $!, $?); # do not overwrite error vars
	$finish_jobs->($self);
	$old_sig_chld->(@_) if $old_sig_chld;
    };

    my $fork = sub {
	my ($type, $sub) = @_;

	# don't fork again if the previous iteration still runs
	return if defined($self->{jobs}->{$type});

	my $child = fork();
	if (!defined($child)) {
	    die "fork failed: $!\n";
	} elsif ($child == 0) {
	    $self->after_fork_cleanup();
	    eval {
		$sub->();
	    };
	    if (my $err = $@) {
		syslog('err', "ERROR: $err");
	    }
	    POSIX::_exit(0);
	}

	$jobs->{$type} = $child;
    };

    my $run_jobs = sub {

	$fork->('replication', sub {
	    PVE::API2::Replication::run_jobs(undef, sub {}, 0, 1);
	});

	$fork->('jobs', sub {
	    PVE::Jobs::run_jobs();
	});
    };

    PVE::Jobs::setup_dirs();

    for (my $count = 1000;;$count++) {
	last if $self->{shutdown_request};
	# we got a reload signal, return gracefully and leave the forks running
	return if $self->{got_hup_signal};

	$run_jobs->();

	my $sleep_time = 60;
	if ($count >= 1000) {
	    # Job schedule has minute precision, so try running near the minute boundary.
	    my ($current_seconds) = localtime;
	    $sleep_time = (60 - $current_seconds) if (60 - $current_seconds >= 5);
	    $count = 0;
	}

	my $slept = 0; # SIGCHLD interrupts sleep, so we need to keep track
	while ($slept < $sleep_time) {
	    last if $self->{shutdown_request} || $self->{got_hup_signal};
	    $slept += sleep($sleep_time - $slept);
	}
    }

    # replication jobs have a lock timeout of 60s, wait a bit more for graceful termination
    my $timeout = 0;
    for my $type (@types) {
	while (defined($jobs->{$type}) && $timeout < 75) {
	    kill 'TERM', $jobs->{$type};
	    $timeout += sleep(5);
	}
	# ensure the rest gets stopped
	kill 'KILL', $jobs->{$type} if defined($jobs->{$type});
    }
}

sub shutdown {
    my ($self) = @_;

    syslog('info', 'got shutdown request, signal running jobs to stop');

    for my $type (@types) {
	kill 'TERM', $self->{jobs}->{$type} if $self->{jobs}->{$type};
    }
    $self->{shutdown_request} = 1;
}

$daemon->register_start_command();
$daemon->register_stop_command();
$daemon->register_restart_command(1);
$daemon->register_status_command();

our $cmddef = {
    start => [ __PACKAGE__, 'start', []],
    stop => [ __PACKAGE__, 'stop', []],
    restart => [ __PACKAGE__, 'restart', []],
    status => [ __PACKAGE__, 'status', [], undef, sub { print shift . "\n";} ],
};

1;
