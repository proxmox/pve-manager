package PVE::APIDaemon;

use strict;
use warnings;
use vars qw(@ISA);
use IO::Socket::INET;

use PVE::SafeSyslog;
use PVE::INotify;
use PVE::RPCEnvironment;
use PVE::HTTPServer;

use POSIX qw(EINTR);
use POSIX ":sys_wait_h";
use IO::Handle;
use IO::Select;
use JSON;

my $workers = {};

sub new {
    my ($this, %args) = @_;
    
    my $class = ref($this) || $this;

    die "no lockfile" if !$args{lockfile};

    my $lockfh = IO::File->new(">>$args{lockfile}") ||
	die "unable to open lock file '$args{lockfile}' - $!\n";

    my $socket = IO::Socket::INET->new(
	LocalAddr => $args{host} || undef,
	LocalPort => $args{port} || 80,
	Listen => SOMAXCONN,
	Proto  => 'tcp',
	ReuseAddr => 1) ||
	die "unable to create socket - $@\n";

    my $cfg = { %args };
    my $self = bless { cfg => $cfg }, $class;

    $cfg->{socket} = $socket;
    $cfg->{lockfh} = $lockfh;
    $cfg->{max_workers} = 3 if !$cfg->{max_workers};
    $cfg->{trusted_env} = 0 if !defined($cfg->{trusted_env});
    
    return $self;
}

sub worker_finished {
    my $cpid = shift;

    syslog('info', "worker $cpid finished");
}
    
sub finish_workers {
    local $!; local $?;    
    foreach my $cpid (keys %$workers) {
        my $waitpid = waitpid ($cpid, WNOHANG);
        if (defined($waitpid) && ($waitpid == $cpid)) {
            delete ($workers->{$cpid});
	    worker_finished ($cpid);
	}
    }
}

sub test_workers {
    foreach my $cpid (keys %$workers) {
	if (!kill(0, $cpid)) {
	    waitpid($cpid, POSIX::WNOHANG());
	    delete $workers->{$cpid};
	    worker_finished ($cpid);
	}
    }
}

sub start_workers {
    my ($self, $rpcenv) = @_;

    my $count = 0;
    foreach my $cpid (keys %$workers) {
	$count++;
    }

    my $need = $self->{cfg}->{max_workers} - $count;

    return if $need <= 0;

    syslog('info', "starting $need worker(s)");

    while ($need > 0) {
	my $pid = fork;

	if (!defined ($pid)) {
	    syslog('err', "can't fork worker");
	    sleep (1);
	} elsif ($pid) { #parent
	    $workers->{$pid} = 1;
	    syslog('info', "worker $pid started");
	    $need--;
	} else {
	    $0 = "$0 worker";

	    $SIG{TERM} = $SIG{QUIT} = 'DEFAULT'; # we handle that with AnyEvent

	    eval {
		# try to init inotify
		# fixme: poll
		PVE::INotify::inotify_init();
	        $self->handle_connections($rpcenv);
	    };
	    if (my $err = $@) {
		syslog('err', $err);
		sleep(5); # avoid fast restarts
	    }
	    exit (0);
	}
    }
}

sub terminate_server {

    syslog('info', "received terminate request");

    foreach my $cpid (keys %$workers) {
	kill (15, $cpid); # TERM childs
    }

    # nicely shutdown childs (give them max 10 seconds to shut down)
    my $previous_alarm = alarm (10);
    eval {
	local $SIG{ALRM} = sub { die "timeout\n" };
	
	while ((my $pid = waitpid (-1, 0)) > 0) {
	    if (defined($workers->{$pid})) {
		delete ($workers->{$pid});
		worker_finished ($pid);
	    }
	}
	alarm(0); # avoid race condition
    };
    my $err = $@;
    
    alarm ($previous_alarm);

    if ($err) {
	syslog('err', "error stopping workers (will kill them now) - $err"); 
	foreach my $cpid (keys %$workers) {
	    # KILL childs still alive!
	    if (kill (0, $cpid)) {
		delete ($workers->{$cpid});
		syslog("err", "kill worker $cpid");
		kill (9, $cpid);
	    }
	}
    }
}

sub start_server {
    my $self = shift;

    my $atfork = sub { close($self->{cfg}->{socket}); };
    my $rpcenv = PVE::RPCEnvironment->init(
	$self->{cfg}->{trusted_env} ? 'priv' : 'pub', atfork => $atfork);

    eval {
	my $old_sig_chld = $SIG{CHLD};
	local $SIG{CHLD} = sub {
	    finish_workers ();
	    &$old_sig_chld(@_) if $old_sig_chld;
	};

	my $old_sig_term = $SIG{TERM};
	local $SIG{TERM} = sub { 
	    terminate_server ();
	    &$old_sig_term(@_) if $old_sig_term;
	};
	local $SIG{QUIT} = sub { 
	    terminate_server();
	    &$old_sig_term(@_) if $old_sig_term;
	};

	local $SIG{HUP} = sub {
	    syslog("info", "received reload request");
	    foreach my $cpid (keys %$workers) {
		kill (15, $cpid); # kill childs
	    }
	};

	for (;;) { # forever
	    $self->start_workers($rpcenv);
	    sleep (5); 
	    $self->test_workers();
	}
    };
    my $err = $@;

    if ($err) {
	syslog('err', "ERROR: $err");
    }
}

sub send_error {
    my ($c, $code, $msg) = @_;

    $c->send_response(HTTP::Response->new($code, $msg));
}

sub handle_connections {
    my ($self, $rpcenv) = @_;

    my $server = PVE::HTTPServer->new(%{$self->{cfg}}, rpcenv => $rpcenv);

    $server->run();
}

1;
