package PVE::APIDaemon;

use strict;
use warnings;
use vars qw(@ISA);
use PVE::SafeSyslog;
use PVE::INotify;
use PVE::RPCEnvironment;

use POSIX qw(EINTR);
use POSIX ":sys_wait_h";
use IO::Handle;
use IO::Select;
use HTTP::Daemon;
use HTTP::Status qw(:constants);
use CGI;
use Data::Dumper; # fixme: remove
use PVE::REST;
use JSON;

# This is a quite simple pre-fork server - only listens to local port

@ISA = qw(HTTP::Daemon);

my $documentroot = "/usr/share/pve-api/root";

my $workers = {};

my $max_workers = 3;    # pre-forked worker processes
my $max_requests = 500; # max requests per worker


# some global vars
my $child_terminate = 0;
my $child_reload_config = 0;

my $debug_enabled;
sub enable_debug {
    $debug_enabled = 1;
}

sub debug_msg {
    return if !$debug_enabled;
    syslog('info', @_);
}

sub worker_finished {
    my $cpid = shift;

    syslog ('info', "worker $cpid finished");
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

    my $need = $max_workers - $count;

    return if $need <= 0;

    syslog ('info', "starting $need worker(s)");

    while ($need > 0) {
	my $pid = fork;

	if (!defined ($pid)) {
	    syslog ('err', "can't fork worker");
	    sleep (1);
	} elsif ($pid) { #parent
	    $workers->{$pid} = 1;
	    $0 = 'pvedaemon worker';
	    syslog ('info', "worker $pid started");
	    $need--;
	} else {
	    $SIG{TERM} = $SIG{QUIT} = sub {
		$child_terminate = 1;
	    };

	    $SIG{USR1} = sub {
		$child_reload_config = 1;
	    };

	    eval {
		# try to init inotify
		PVE::INotify::inotify_init();

	        $self->handle_requests($rpcenv);
	    };
	    syslog ('err', $@) if $@;
	  
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
	local $SIG{ALRM} = sub { die "Timed Out!\n" };
	
	while ((my $pid = waitpid (-1, 0)) > 0) {
	    if (defined($workers->{$pid})) {
		delete ($workers->{$pid});
		worker_finished ($pid);
	    }
	}

    };
    alarm ($previous_alarm);

    foreach my $cpid (keys %$workers) {
	# KILL childs still alive!
	if (kill (0, $cpid)) {
	    delete ($workers->{$cpid});
	    syslog("err", "kill worker $cpid");
	    kill (9, $cpid);
	}
    }

}

sub new {
    my $class = shift;

    my $self = $class->SUPER::new(@_) || 
	die "unable to create socket - $@\n";

    return $self;
}

sub start_server {
    my $self = shift;

    my $atfork = sub { close($self); };
    my $rpcenv = PVE::RPCEnvironment->init('priv', atfork => $atfork);

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

	local $SIG{USR1} = 'IGNORE';

	local $SIG{HUP} = sub {
	    syslog ("info", "received reload request");
	    foreach my $cpid (keys %$workers) {
		kill (10, $cpid); # SIGUSR1 childs
	    }
	};

	for (;;) { # forever
	    $self->start_workers ($rpcenv);
	    sleep (5); 
	    $self->test_workers ();
	}
    };
    my $err = $@;

    if ($err) {
	syslog ('err', "ERROR: $err");
    }
}

sub send_error {
    my ($c, $code, $msg) = @_;

    $c->send_response(HTTP::Response->new($code, $msg));
}

my $known_methods = {
    GET => 1,
    POST => 1,
    PUT => 1,
    DELETE => 1,
};

my $extract_params = sub {
    my ($r, $method) = @_;

    # NOTE: HTTP::Request::Params return undef instead of ''
    #my $parser = HTTP::Request::Params->new({req => $r});
    #my $params = $parser->params;

    my $post_params = {};

    if ($method eq 'PUT' || $method eq 'POST') {
	$post_params = CGI->new($r->content())->Vars;
    }

    my $query_params = CGI->new($r->url->query)->Vars;
	
    my $params = $post_params || {};

    foreach my $k (keys %{$query_params}) {
	$params->{$k} = $query_params->{$k};
    }

    return $params;
};

sub handle_requests {
    my ($self, $rpcenv) = @_;

    my $rcount = 0;

    my $sel = IO::Select->new();
    $sel->add ($self);

    my $timeout = 5;
    my @ready;
    while (1) {
	if (scalar (@ready = $sel->can_read($timeout))) {

	    my $c;
	    while (($c = $self->accept) || ($! == EINTR && !$child_terminate)) {
		next if !$c; # EINTR

		if ($child_reload_config) {
		    $child_reload_config = 0;
		    syslog('info', "child reload config");
		    # fixme: anything to do here?
		}

		$c->timeout(5);

		# fixme: limit max request length somehow

		# handle requests 
		while (my $r = $c->get_request) {
			
		    my $method =  $r->method();

		    debug_msg("perl method $method");

		    if (!$known_methods->{$method}) {
			$c->send_error(HTTP_NOT_IMPLEMENTED);			
			last;
		    }

		    my $uri = $r->uri->path();
		    debug_msg("start $method $uri");

		    my ($rel_uri, $format) = PVE::REST::split_abs_uri($uri);
		    if (!$format) {

			$c->send_error(HTTP_NOT_IMPLEMENTED);			

		    } else {

			my $headers = $r->headers;

			my $cookie = $headers->header('Cookie');

			my $ticket = PVE::REST::extract_auth_cookie($cookie);

			my $params = &$extract_params($r, $method);

			my $clientip = $headers->header('PVEClientIP');

			my $res = PVE::REST::rest_handler($clientip, $method, $uri, $rel_uri, 
							  $ticket, undef, $params);

			if ($res->{proxy}) {

			    $res->{status} = 500;
			    $c->send_error($res->{status}, "proxy not allowed");

			} else {

			    PVE::REST::prepare_response_data($format, $res);
			    my ($raw, $ct) = PVE::REST::format_response_data($format, $res, $uri);

			    my $response = HTTP::Response->new($res->{status}, $res->{message});
			    $response->header("Content-Type" => $ct);
			    $response->header("Pragma", "no-cache");

			    if ($res->{ticket}) {
				my $cookie = PVE::REST::create_auth_cookie($res->{ticket});
				$response->header("Set-Cookie" => $cookie);
			    }
			    $response->content($raw);

			    $c->send_response($response);
			}

			debug_msg("end $method $uri ($res->{status})");
		    }
		}
		$rcount++;

		# we only handle one request per connection, because
		# we want to minimize the number of connections

		$c->shutdown(2);
		$c->close();
		last;
	    }

	    last if $child_terminate || !$c || ($rcount >= $max_requests);

	} else {
	    last if $child_terminate;

	    # timeout
	    PVE::INotify::poll(); # read inotify events
	}
    }
}

1;
