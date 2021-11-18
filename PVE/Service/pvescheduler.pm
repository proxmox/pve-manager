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

my $finish_jobs = sub {
    my ($self) = @_;
    foreach my $cpid (keys %{$self->{jobs}}) {
	my $waitpid = waitpid($cpid, WNOHANG);
	if (defined($waitpid) && ($waitpid == $cpid)) {
	    delete ($self->{jobs}->{$cpid});
	}
    }
};

sub run {
    my ($self) = @_;

    my $jobs = {};
    $self->{jobs} = $jobs;

    my $old_sig_chld = $SIG{CHLD};
    local $SIG{CHLD} = sub {
	local ($@, $!, $?); # do not overwrite error vars
	$finish_jobs->($self);
	$old_sig_chld->(@_) if $old_sig_chld;
    };

    my $fork = sub {
	my ($sub) = @_;
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

	$jobs->{$child} = 1;
    };

    my $run_jobs = sub {

	$fork->(sub {
	    PVE::API2::Replication::run_jobs(undef, sub {}, 0, 1);
	});

	$fork->(sub {
	    PVE::Jobs::run_jobs();
	});
    };

    PVE::Jobs::setup_dirs();

    for (my $count = 1000;;$count++) {
	last if $self->{shutdown_request};

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
	    last if $self->{shutdown_request};
	    $slept += sleep($sleep_time - $slept);
	}
    }

    # jobs have a lock timeout of 60s, wait a bit more for graceful termination
    my $timeout = 0;
    while (keys %$jobs > 0 && $timeout < 75) {
	kill 'TERM', keys %$jobs;
	$timeout += sleep(5);
    }
    # ensure the rest gets stopped
    kill 'KILL', keys %$jobs if (keys %$jobs > 0);
}

sub shutdown {
    my ($self) = @_;

    syslog('info', 'got shutdown request, signal running jobs to stop');

    kill 'TERM', keys %{$self->{jobs}};
    $self->{shutdown_request} = 1;
}

$daemon->register_start_command();
$daemon->register_stop_command();
$daemon->register_status_command();

our $cmddef = {
    start => [ __PACKAGE__, 'start', []],
    stop => [ __PACKAGE__, 'stop', []],
    status => [ __PACKAGE__, 'status', [], undef, sub { print shift . "\n";} ],
};

1;
