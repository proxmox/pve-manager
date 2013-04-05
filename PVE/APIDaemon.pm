package PVE::HTTPServer;

use strict;
use warnings;
use Socket qw(IPPROTO_TCP TCP_NODELAY SOMAXCONN);
use POSIX qw(strftime EINTR EAGAIN);
use Fcntl;
use File::stat qw();
use AnyEvent::Strict;
use AnyEvent::Util qw(guard fh_nonblocking WSAEWOULDBLOCK WSAEINPROGRESS);
use AnyEvent::Handle;
use AnyEvent::TLS;
use AnyEvent::IO;
use Fcntl ();
use Compress::Zlib;

use Scalar::Util qw/weaken/; # fixme: remove?
use Data::Dumper; # fixme: remove

sub log_request {
    my ($self, $reqstate) = @_;

    return if !$self->{loghdl};

    my $loginfo = $reqstate->{log};

    # like apache2 combined log format
    # LogFormat "%h %l %u %t \"%r\" %>s %b \"%{Referer}i\" \"%{User-agent}i\""

    my $peerip = $reqstate->{peer_host} || '-';
    my $userid = $loginfo->{userid} || '-';
    my $content_length = defined($loginfo->{content_length}) ? $loginfo->{content_length} : '-';
    my $code =  $loginfo->{code} || 500;
    my $requestline = $loginfo->{requestline} || '-';
    my $timestr = strftime("%d/%b/%Y:%H:%M:%S %z", localtime());

    my $msg = "$peerip - $userid [$timestr] \"$requestline\" $code $content_length\n";

    $self->{loghdl}->push_write($msg);
}

sub log_aborted_request {
    my ($self, $reqstate, $error) = @_;

    my $r = $reqstate->{request};
    return if !$r; # no active request

    if ($error) {
	syslog("err", "problem with client $reqstate->{peer_host}; $error");
    }
    
    $self->log_request($reqstate);
}

sub client_do_disconnect {
    my ($self, $reqstate) = @_;

    my $hdl = delete $reqstate->{hdl};

    if (!$hdl) {
	syslog('err', "detected empty handle");
	return;
    }

    #print "close connection $hdl\n";

    shutdown($hdl->{fh}, 1);
    # clear all handlers
    $hdl->on_drain(undef); 
    $hdl->on_read(undef);
    $hdl->on_eof(undef);
    $self->{conn_count}--;

    #print "$$: client_do_disconnect $self->{conn_count} $hdl\n";
}

sub finish_response {
    my ($self, $reqstate) = @_;

    my $hdl = $reqstate->{hdl};

    delete $reqstate->{log};
    delete $reqstate->{request};
    delete $reqstate->{proto};

    if (!$self->{end_loop} && $reqstate->{keep_alive} > 0) {
	# print "KEEPALIVE $reqstate->{keep_alive}\n";
	$hdl->on_read(sub { 
	    eval { $self->push_request_header($reqstate); };
	    warn $@ if $@;
	});
    } else {
	$hdl->on_drain (sub {
	    eval { 
		$self->client_do_disconnect($reqstate); 
	    }; 
	    warn $@ if $@;
	});
    }
}

sub response {
    my ($self, $reqstate, $resp, $mtime) = @_;

    #print "$$: send response: " . Dumper($resp);

    my $code = $resp->code;
    my $msg = $resp->message || HTTP::Status::status_message($code);
    ($msg) = $msg =~m/^(.*)$/m;
    my $content = $resp->content;

    if ($code =~ /^(1\d\d|[23]04)$/) {
	# make sure content we have no content
	$content = "";
    }

    $reqstate->{keep_alive} = 0 if ($code >= 300) || $self->{end_loop};

    $reqstate->{log}->{code} = $code;

    my $res = "HTTP/1.0 $code $msg\015\012";
    
    my $ctime = time();
    my $date = HTTP::Date::time2str($ctime);
    $resp->header('Date' => $date);
    if ($mtime) {
	$resp->header('Last-Modified' => HTTP::Date::time2str($mtime));
    } else {
	$resp->header('Expires' => $date);
	$resp->header('Cache-Control' => "max-age=0");
    }

    $resp->header('Server' => "pve-api-daemon/3.0");

    my $content_length;
    if (ref($content) eq "CODE") {
	$reqstate->{keep_alive} = 0;

	# fixme:
	
    } elsif ($content) {

	$content_length = length($content);

	if ($content_length > 1024) {
	    my $comp = Compress::Zlib::memGzip($content);
	    $resp->header('Content-Encoding', 'gzip');
	    $content = $comp;
	    $content_length = length($content);
	}
	$resp->header("Content-Length" => $content_length);
	$reqstate->{log}->{content_length} = $content_length;
    } else {
	$resp->remove_header("Content-Length");
    }
 
    if ($reqstate->{keep_alive} > 0) {
	$resp->push_header('Connection' => 'Keep-Alive');
    } else {
	$resp->header('Connection' => 'close');
    }

    $res .= $resp->headers_as_string("\015\012");
    #print "SEND(supress content) $res\n";

    $res .= "\015\012";
    $res .= $content;

    $self->log_request($reqstate, $reqstate->{request});

    $reqstate->{hdl}->push_write($res);
    $self->finish_response($reqstate);
}

sub error {
    my ($self, $reqstate, $code, $msg, $hdr, $content) = @_;

    eval {
	my $resp = HTTP::Response->new($code, $msg, $hdr, $content);	
	$self->response($reqstate, $resp);
    };
    warn $@ if $@;
}

sub send_file_start {
    my ($self, $reqstate, $filename) = @_;

    eval {
	# print "SEND FILE $filename\n";
	# Note: aio_load() this is not really async unless we use IO::AIO! 
	eval {

	    my $fh = IO::File->new($filename, '<') ||
		die "$!\n";
	    my $stat = File::stat::stat($fh) ||
		die "$!\n";
	    
	    my $data;
	    my $len = sysread($fh, $data,  $stat->size);
	    die "got short file\n" if !defined($len) || $len != $stat->size;

	    my $ct;
	    if ($filename =~ m/\.css$/) {
		$ct = 'text/css';
	    } elsif ($filename =~ m/\.js$/) { 
		$ct = 'application/javascript';
	    } elsif ($filename =~ m/\.png$/) { 
		$ct = 'image/png';
	    } elsif ($filename =~ m/\.gif$/) { 
		$ct = 'image/gif';
	    } elsif ($filename =~ m/\.jar$/) { 
		$ct = 'application/java-archive';
	    } else {
		die "unable to detect content type";
	    }

	    my $header = HTTP::Headers->new(Content_Type => $ct);
	    my $resp = HTTP::Response->new(200, "OK", $header, $data); 
	    $self->response($reqstate, $resp, $stat->mtime);
	};
	if (my $err = $@) {
	    $self->error($reqstate, 501, $err);
	}
    };
    
    warn $@ if $@;
}

sub handle_request {
    my ($self, $reqstate) = @_;

    #print "REQUEST" . Dumper($reqstate->{request});

    eval {
	my $r = $reqstate->{request};
	my $method = $r->method();
	my $uri = $r->uri->path();

	#print "REQUEST $uri\n";

	if ($uri =~ m!/api2!) { 
	    my $handler =  $self->{cb};
	    my ($resp, $userid) = &$handler($self, $reqstate->{request});
	    $reqstate->{log}->{userid} = $userid if $userid;
	    $self->response($reqstate, $resp);
	    return;
	}

	if ($self->{pages} && ($method eq 'GET') && (my $handler = $self->{pages}->{$uri})) {
	    if (ref($handler) eq 'CODE') {
		my ($resp, $userid) = &$handler($self, $reqstate->{request});
		$self->response($reqstate, $resp);
	    } elsif (ref($handler) eq 'HASH') {
		if (my $filename = $handler->{file}) {
		    my $fh = IO::File->new($filename) ||
			die "unable to open file '$filename' - $!\n";
		    send_file_start($self, $reqstate, $filename);
		} else {
		    die "internal error - no handler";
		}
	    } else {
		die "internal error - no handler";
	    }
	    return;
	} 

	if ($self->{dirs} && ($method eq 'GET')) {
	    foreach my $dir (keys %{$self->{dirs}}) {
		# we only allow simple names
		if ($uri =~ m/^$dir([a-zA-Z0-9\-\_\.\/]+)$/) {
		    my $reluri = $1;
		    $reluri =~ s/\.\./XX/g; # do not allow '..'
		    my $filename = "$self->{dirs}->{$dir}$reluri";
		    my $fh = IO::File->new($filename) ||
			die "unable to open file '$filename' - $!\n";
		    send_file_start($self, $reqstate, $filename);
		    return;
		}
	    }
	}

	die "no such file '$uri'";
    };
    if (my $err = $@) {
	$self->error($reqstate, 501, $err);
    }
}

sub unshift_read_header {
    my ($self, $reqstate) = @_;

    $reqstate->{hdl}->unshift_read(line => sub {
	my ($hdl, $line) = @_;

	eval {
	    #print "$$: got header: $line\n";

	    my $r = $reqstate->{request};
	    if ($line eq '') {

		$r->push_header($reqstate->{key}, $reqstate->{val})
		    if $reqstate->{key};

		my $conn = $r->header('Connection');

		if ($conn) {
		    $reqstate->{keep_alive} = 0 if $conn =~ m/close/oi;
		} else {
		    if ($reqstate->{proto}->{ver} < 1001) {
			$reqstate->{keep_alive} = 0;
		    }
		}

		# how much content to read?
		my $te  = $r->header('Transfer-Encoding');
		my $len = $r->header('Content-Length');
		my $pveclientip = $r->header('PVEClientIP');

		# fixme:
		if ($self->{trusted_env} && $pveclientip) {
		    $reqstate->{peer_host} = $pveclientip;
		} else {
		    $r->header('PVEClientIP', $reqstate->{peer_host});
		}

		if ($te && lc($te) eq 'chunked') {
		    # Handle chunked transfer encoding
		    $self->error($reqstate, 501, "chunked transfer encoding not supported");
		} elsif ($te) {
		    $self->error($reqstate, 501, "Unknown transfer encoding '$te'");
		} elsif (defined($len)) {
		    $reqstate->{hdl}->unshift_read (chunk => $len, sub {
			my ($hdl, $data) = @_;
			$r->content($data);
			$self->handle_request($reqstate);
						    });
		} else {
		    $self->handle_request($reqstate);
		}
	    } elsif ($line =~ /^([^:\s]+)\s*:\s*(.*)/) {
		$r->push_header($reqstate->{key}, $reqstate->{val}) if $reqstate->{key};
		($reqstate->{key}, $reqstate->{val}) = ($1, $2);
		$self->unshift_read_header($reqstate);
	    } elsif ($line =~ /^\s+(.*)/) {
		$reqstate->{val} .= " $1";
		$self->unshift_read_header($reqstate);
	    } else {
		$self->error($reqstate, 506, "unable to parse request header");
	    }
	};
	warn $@ if $@;
    });
};

sub push_request_header {
    my ($self, $reqstate) = @_;

    eval {
	$reqstate->{hdl}->push_read(line => sub {
	    my ($hdl, $line) = @_;

	    eval {
		#print "got request header: $line\n";
 
		$reqstate->{keep_alive}--;

		if ($line =~ /(\S+)\040(\S+)\040HTTP\/(\d+)\.(\d+)/o) {
		    my ($method, $uri, $maj, $min) = ($1, $2, $3, $4);

		    if ($maj != 1) {
			$self->error($reqstate, 506, "http protocol version $maj.$min not supported");
			return;
		    }

		    $self->{request_count}++; # only count valid request headers
		    if ($self->{request_count} >= $self->{max_requests}) {
			$self->{end_loop} = 1;   
		    }
		    $reqstate->{log} = { requestline => $line };
		    $reqstate->{proto}->{maj} = $maj;
		    $reqstate->{proto}->{min} = $min;
		    $reqstate->{proto}->{ver} = $maj*1000+$min;
		    $reqstate->{request} = HTTP::Request->new($method, $uri);

		    $self->unshift_read_header($reqstate);
		} elsif ($line eq '') {
		    # ignore empty lines before requests (browser bugs?)
		    $self->push_request_header($reqstate);
		} else {
		    $self->error($reqstate, 400, 'bad request');
		}
	    };
	    warn $@ if $@;
	});
    };
    warn $@ if $@;
}

sub accept {
    my ($self) = @_;

    my $clientfh;

    return if $self->{end_loop};

    # we need to m make sure that only one process calls accept
    while (!flock($self->{lockfh}, Fcntl::LOCK_EX())) {
	next if $! == EINTR;
	die "could not get lock on file '$self->{lockfile}' -  $!\n";
    }

    my $again = 0;
    my $errmsg;
    eval {
	while (!$self->{end_loop} &&
	       !defined($clientfh = $self->{socket}->accept()) &&
	       ($! == EINTR)) {};

	if ($self->{end_loop}) {
	    $again = 0;
	} else {
	    $again = ($! == EAGAIN || $! == WSAEWOULDBLOCK);
	    if (!defined($clientfh)) {
		$errmsg = "failed to accept connection: $!\n";
	    }
	}
    };
    warn $@ if $@;

    flock($self->{lockfh}, Fcntl::LOCK_UN());

    if (!defined($clientfh)) {
	return if $again;
	die $errmsg if $errmsg;
    }

    fh_nonblocking $clientfh, 1; 

    $self->{conn_count}++;

    print "$$: ACCEPT OK $self->{conn_count} FH" .  $clientfh->fileno() . "\n";

    return $clientfh;
}


sub accept_connections {
    my ($self) = @_;

    eval {

	while (my $clientfh = $self->accept()) {

	    my $reqstate = { keep_alive => $self->{keep_alive} };

	    if (my $sin = getpeername($clientfh)) {
		my ($pport, $phost) = Socket::unpack_sockaddr_in($sin);
		($reqstate->{peer_port}, $reqstate->{peer_host}) = ($pport,  Socket::inet_ntoa($phost));
	    }

	    $reqstate->{hdl} = AnyEvent::Handle->new(
		fh => $clientfh,
		rbuf_max => 32768, # fixme: set smaller max read buffer ?
		timeout => $self->{timeout},
		linger => 0, # avoid problems with ssh - really needed ?
		on_eof   => sub {
		    my ($hdl) = @_;
		    eval {
			$self->log_aborted_request($reqstate);
			$self->client_do_disconnect($reqstate);
		    };
		    if (my $err = $@) { syslog('err', $err); }
		},
		on_error => sub { 
		    my ($hdl, $fatal, $message) = @_;
		    eval {
			$self->log_aborted_request($reqstate, $message);
			$self->client_do_disconnect($reqstate);
		    };
		    if (my $err = $@) { syslog('err', "$err"); }
		},
		($self->{tls_ctx} ? (tls => "accept", tls_ctx => $self->{tls_ctx}) : ()));

	    print "$$: ACCEPT OK $reqstate->{hdl} $self->{conn_count}\n";

	    $self->push_request_header($reqstate);
	}
    };

    if (my $err = $@) {
	syslog('err', $err);
	$self->{end_loop} = 1;
    }

    if ($self->{end_loop}) {
	
	undef $self->{socket_watch};
	
	if ($self->{conn_count} <= 0) {
	    $self->{end_cond}->send(1);
	    return;
	}

	# else we need to wait until all open connections gets closed
	my $w; $w = AnyEvent->timer (after => 1, interval => 1, cb => sub {
	    eval {
		# fixme: test for active connections instead?
		if ($self->{conn_count} <= 0) {
		    undef $w;
		    $self->{end_cond}->send(1);
		}
	    };
	    warn $@ if $@;
	});
    }
}

sub open_access_log {
    my ($self, $filename) = @_;

    my $old_mask = umask(0137);;
    my $logfh = IO::File->new($filename, ">>") ||
	die "unable to open log file '$filename' - $!\n";
    umask($old_mask);

    fh_nonblocking($logfh, 1);
    $self->{loghdl} = AnyEvent::Handle->new(
	fh => $logfh, 
	on_error => sub {
	    my ($hdl, $fatal, $msg) = @_;
	    syslog('err', "error writing access log: $msg");
	    delete $self->{loghdl};
	    $hdl->destroy;
	    $self->end_loop = 1; # terminate asap
	});;

    return;
}

sub new {
    my ($this, %args) = @_;

    my $class = ref($this) || $this;

    foreach my $req (qw(cb socket lockfh lockfile end_cond)) {
	die "misssing required argument '$req'" if !defined($args{$req});
    }

    my $self = bless { %args }, $class;

    fh_nonblocking($self->{socket}, 1);

    $self->{end_loop} = 0;
    $self->{conn_count} = 0;
    $self->{request_count} = 0;
    $self->{timeout} = 5 if !$self->{timeout};
    $self->{keep_alive} = 0 if !defined($self->{keep_alive});
    $self->{max_conn} = 800 if !$self->{max_conn};
    $self->{max_requests} = 8000 if !$self->{max_requests};


    if ($self->{ssl}) {
	$self->{tls_ctx} = AnyEvent::TLS->new(%{$self->{ssl}}); 
    }

    # fixme: logrotate?
    $self->open_access_log($self->{logfile}) if $self->{logfile};
    
    $self->{socket_watch} = AnyEvent->io(fh => $self->{socket}, poll => 'r', cb => sub {
	eval {
	    if ($self->{conn_count} >= $self->{max_conn}) {
		my $w; $w = AnyEvent->timer (after => 1, interval => 1, cb => sub {
		    if ($self->{conn_count} < $self->{max_conn}) {
			undef $w;
			$self->accept_connections();
		    }
		});
	    } else {
		$self->accept_connections();
	    } 
	};
	warn $@ if $@;
    });

    return $self;
}

package PVE::APIDaemon;

use strict;
use warnings;
use vars qw(@ISA);
use IO::Socket::INET;

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

# DOS attack prevention
$CGI::DISABLE_UPLOADS = 1; # no uploads
$CGI::POST_MAX = 1024 * 10; # max 10K posts

my $documentroot = "/usr/share/pve-api/root";

my $workers = {};

# some global vars
# fixme: implement signals correctly
my $child_terminate = 0;
my $child_reload_config = 0;

sub enable_debug { PVE::REST::enable_debug(); }
sub debug_msg { PVE::REST::debug_msg(@_); }

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
	    $0 = "$0 worker";
	    syslog('info', "worker $pid started");
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

	local $SIG{USR1} = 'IGNORE';

	local $SIG{HUP} = sub {
	    syslog("info", "received reload request");
	    foreach my $cpid (keys %$workers) {
		kill (10, $cpid); # SIGUSR1 childs
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

    return PVE::Tools::decode_utf8_parameters($params);
};

sub handle_connections {
    my ($self, $rpcenv) = @_;

    my $end_cond = AnyEvent->condvar;

    my $server = PVE::HTTPServer->new(%{$self->{cfg}}, end_cond => $end_cond, cb => sub {
	my ($server, $r) = @_;

	my $method = $r->method();


	if (!$known_methods->{$method}) {
	    return HTTP::Response->new(HTTP_NOT_IMPLEMENTED, "method '$method' not available");
	}

	my $uri = $r->uri->path();

	my $response;
	my $userid;

	my ($rel_uri, $format) = PVE::REST::split_abs_uri($uri);
	if (!$format) {
	    $response = HTTP::Response->new(HTTP_NOT_IMPLEMENTED, "no such uri");
	} else {
	    my $headers = $r->headers;

	    my $cookie = $headers->header('Cookie');

	    my $ticket = PVE::REST::extract_auth_cookie($cookie);

	    my $params = &$extract_params($r, $method);

	    my $clientip = $headers->header('PVEClientIP');

	    $rpcenv->init_request(params => $params); 

	    my $res = PVE::REST::rest_handler($rpcenv, $clientip, $method, $uri, $rel_uri, $ticket);

	    # fixme: eval { $userid = $rpcenv->get_user(); };
	    $userid = $rpcenv->{user}; # this is faster
	    $rpcenv->set_user(undef); # clear after request
 
	    if ($res->{proxy}) {
		$response = HTTP::Response->new(HTTP_INTERNAL_SERVER_ERROR, "proxy not allowed");
	    } else {

		PVE::REST::prepare_response_data($format, $res);
		my ($raw, $ct) = PVE::REST::format_response_data($format, $res, $uri);

		$response = HTTP::Response->new($res->{status}, $res->{message});
		$response->header("Content-Type" => $ct);
		$response->header("Pragma", "no-cache");

		$response->content($raw);
	    }
	}
	    
	return wantarray ? ($response, $userid) : $response;
    });

    debug_msg("wating for connections");
    $end_cond->recv;
    debug_msg("end worker loop");
}

1;
