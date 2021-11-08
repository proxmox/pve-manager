package PVE::Service::pvescheduler;

use strict;
use warnings;

use POSIX qw(WNOHANG);
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

my $get_sleep_time = sub {
    my ($calculate_offset) = @_;
    my $time = 60;

    if ($calculate_offset) {
	# try to run near minute boundaries, makes more sense to the user as he
	# configures jobs with minute precision
	my ($current_seconds) = localtime;
	$time = (60 - $current_seconds) if (60 - $current_seconds >= 5);
    }

    return $time;
};

sub run {
    my ($self) = @_;

    my $jobs= {};
    $self->{jobs} = $jobs;

    my $old_sig_chld = $SIG{CHLD};
    local $SIG{CHLD} = sub {
	local ($@, $!, $?); # do not overwrite error vars
	$finish_jobs->($self);
	$old_sig_chld->(@_) if $old_sig_chld;
    };

    my $run_jobs = sub {
	my $child = fork();
	if (!defined($child)) {
	    die "fork failed: $!\n";
	} elsif ($child == 0) {
	    $self->after_fork_cleanup();
	    PVE::API2::Replication::run_jobs(undef, sub {}, 0, 1);
	    POSIX::_exit(0);
	}

	$jobs->{$child} = 1;
    };

    PVE::Jobs::setup_dirs();

    for (my $count = 1000;;$count++) {
	last if $self->{shutdown_request};

	$run_jobs->();

	my $sleep_time;
	if ($count >= 1000) {
	    $sleep_time = $get_sleep_time->(1);
	    $count = 0;
	} else {
	    $sleep_time = $get_sleep_time->(0);
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
