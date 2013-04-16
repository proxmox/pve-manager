package PVE::HTTPServer;

use strict;
use warnings;
use Time::HiRes qw(usleep ualarm gettimeofday tv_interval);
use Socket qw(IPPROTO_TCP TCP_NODELAY SOMAXCONN);
use POSIX qw(strftime EINTR EAGAIN);
use Fcntl;
use IO::File;
use File::stat qw();
use Digest::MD5;
use AnyEvent::Strict;
use AnyEvent::Util qw(guard fh_nonblocking WSAEWOULDBLOCK WSAEINPROGRESS);
use AnyEvent::Handle;
use AnyEvent::TLS;
use AnyEvent::IO;
use AnyEvent::HTTP;
use Fcntl ();
use Compress::Zlib;
use PVE::SafeSyslog;
use PVE::INotify;
use PVE::RPCEnvironment;
use PVE::REST;

use URI;
use HTTP::Status qw(:constants);
use HTTP::Headers;
use HTTP::Response;

# fixme
# POST_MAX = 1024 * 10; # max 10K posts

use Data::Dumper; # fixme: remove

my $known_methods = {
    GET => 1,
    POST => 1,
    PUT => 1,
    DELETE => 1,
};

my $baseuri = "/api2";

sub split_abs_uri {
    my ($abs_uri) = @_;

    my ($format, $rel_uri) = $abs_uri =~ m/^\Q$baseuri\E\/+(html|text|json|extjs|png|htmljs)(\/.*)?$/;
    $rel_uri = '/' if !$rel_uri;
 
    return wantarray ? ($rel_uri, $format) : $rel_uri;
}

sub log_request {
    my ($self, $reqstate) = @_;

    my $loginfo = $reqstate->{log};

    # like apache2 common log format
    # LogFormat "%h %l %u %t \"%r\" %>s %b \"%{Referer}i\" \"%{User-agent}i\""

    my $peerip = $reqstate->{peer_host} || '-';
    my $userid = $loginfo->{userid} || '-';
    my $content_length = defined($loginfo->{content_length}) ? $loginfo->{content_length} : '-';
    my $code =  $loginfo->{code} || 500;
    my $requestline = $loginfo->{requestline} || '-';
    my $timestr = strftime("%d/%b/%Y:%H:%M:%S %z", localtime());

    my $msg = "$peerip - $userid [$timestr] \"$requestline\" $code $content_length\n";

    $self->write_log($msg);
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

    if ($reqstate->{tmpfilename}) {
	unlink $reqstate->{tmpfilename};
	delete $reqstate->{tmpfilename};
    }

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

    print "$$: CLOSE FH" .  $hdl->{fh}->fileno() . " CONN$self->{conn_count}\n" if $self->{debug};
}

sub finish_response {
    my ($self, $reqstate) = @_;

    my $hdl = $reqstate->{hdl};

    delete $reqstate->{log};
    delete $reqstate->{request};
    delete $reqstate->{proto};

    if ($reqstate->{tmpfilename}) {
	unlink $reqstate->{tmpfilename};
	delete $reqstate->{tmpfilename};
    }

    if (!$self->{end_loop} && $reqstate->{keep_alive} > 0) {
	# print "KEEPALIVE $reqstate->{keep_alive}\n" if $self->{debug};
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
    my ($self, $reqstate, $resp, $mtime, $nocomp) = @_;

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

    my $res = "$reqstate->{proto}->{str} $code $msg\015\012";

    my $ctime = time();
    my $date = HTTP::Date::time2str($ctime);
    $resp->header('Date' => $date);
    if ($mtime) {
	$resp->header('Last-Modified' => HTTP::Date::time2str($mtime));
    } else {
	$resp->header('Expires' => $date);
	$resp->header('Cache-Control' => "max-age=0");
	$resp->header("Pragma", "no-cache");
    }

    $resp->header('Server' => "pve-api-daemon/3.0");

    my $content_length;
    if ($content) {

	$content_length = length($content);

	if (!$nocomp && ($content_length > 1024)) {
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
    #print "SEND(without content) $res\n" if $self->{debug};

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

sub proxy_request {
    my ($self, $reqstate, $clientip, $host, $method, $uri, $ticket, $token, $params) = @_;

    eval {
	my $target;
	my $keep_alive = 1;
	if ($host eq 'localhost') {
	    $target = "http://$host:85$uri";
	    # keep alive for localhost is not worth (connection setup is about 0.2ms)
	    $keep_alive = 0;
	} else {
	    $target = "https://$host:8006$uri";
	}

	my $headers = {
	    PVEDisableProxy => 'true',
	    PVEClientIP => $clientip,
	};

	my $cookie_name = 'PVEAuthCookie';

	$headers->{'cookie'} = PVE::REST::create_auth_cookie($ticket) if $ticket;
	$headers->{'CSRFPreventionToken'} = $token if $token;

	my $content;

	if  ($method eq 'POST' || $method eq 'PUT') {
	    $headers->{'Content-Type'} = 'application/x-www-form-urlencoded';
	    # use URI object to format application/x-www-form-urlencoded content.
	    my $url = URI->new('http:');
	    $url->query_form(%$params);
	    $content = $url->query;
	    if (defined($content)) {
		$headers->{'Content-Length'} = length($content);
	    }
	}

	my $w; $w = http_request(
	    $method => $target,
	    headers => $headers,
	    timeout => 30,
	    recurse => 0,
	    keepalive => $keep_alive,
	    body => $content,
	    tls_ctx => $self->{tls_ctx},
	    sub {
		my ($body, $hdr) = @_;

		undef $w;

		eval {
		    my $code = delete $hdr->{Status};
		    my $msg = delete $hdr->{Reason};
		    delete $hdr->{URL};
		    delete $hdr->{HTTPVersion};
		    my $header = HTTP::Headers->new(%$hdr);
		    my $resp = HTTP::Response->new($code, $msg, $header, $body);
		    $self->response($reqstate, $resp, undef, 1);
		};
		warn $@ if $@;
	    });
    };
    warn $@ if $@;
}

# return arrays as \0 separated strings (like CGI.pm)
sub decode_urlencoded {
    my ($data) = @_;

    my $res = {};

    return $res if !$data;

    foreach my $kv (split(/[\&\;]/, $data)) {
	my ($k, $v) = split(/=/, $kv);
	$k =~s/\+/ /g;
	$k =~ s/%([0-9a-fA-F][0-9a-fA-F])/chr(hex($1))/eg;
	$v =~s/\+/ /g;
	$v =~ s/%([0-9a-fA-F][0-9a-fA-F])/chr(hex($1))/eg;

	if (defined(my $old = $res->{$k})) {
	    $res->{$k} = "$old\0$v";
	} else {
	    $res->{$k} = $v;
	}	
    }
    return $res;
}

my $extract_params = sub {
    my ($r, $method) = @_;

    my $params = {};

    if ($method eq 'PUT' || $method eq 'POST') {
	$params = decode_urlencoded($r->content);
    }

    my $query_params = decode_urlencoded($r->url->query());

    foreach my $k (keys %{$query_params}) {
	$params->{$k} = $query_params->{$k};
    }

    return PVE::Tools::decode_utf8_parameters($params);
};

sub handle_api2_request {
    my ($self, $reqstate, $auth, $upload_state) = @_;

    eval {
	my $r = $reqstate->{request};
	my $method = $r->method();
	my $path = $r->uri->path();

	my ($rel_uri, $format) = split_abs_uri($path);
	if (!$format) {
	    $self->error($reqstate, HTTP_NOT_IMPLEMENTED, "no such uri");
	    return;
	}

	#print Dumper($upload_state) if $upload_state;

	my $rpcenv = $self->{rpcenv};

	my $params;

	if ($upload_state) {
	    $params = $upload_state->{params};
	} else {
	    $params = &$extract_params($r, $method); # fixme
	}

	delete $params->{_dc}; # remove disable cache parameter

	my $clientip = $reqstate->{peer_host};

	$rpcenv->init_request();

	my $res = PVE::REST::rest_handler($rpcenv, $clientip, $method, $rel_uri, $auth, $params);

	$rpcenv->set_user(undef); # clear after request

	if ($res->{proxy}) {

	    if ($self->{trusted_env}) {
		$self->error($reqstate, HTTP_INTERNAL_SERVER_ERROR, "proxy not allowed");
		return;
	    }

	    $res->{proxy_params}->{tmpfilename} = $reqstate->{tmpfilename} if $upload_state;

	    $self->proxy_request($reqstate, $clientip, $res->{proxy}, $method,
				 $r->uri, $auth->{ticket}, $auth->{token}, $res->{proxy_params});
	    return;

	}

	PVE::REST::prepare_response_data($format, $res);
	my ($raw, $ct) = PVE::REST::format_response_data($format, $res, $path);

	my $resp = HTTP::Response->new($res->{status}, $res->{message});
	$resp->header("Content-Type" => $ct);
	$resp->content($raw);
	$self->response($reqstate, $resp);
    };
    if (my $err = $@) {
	$self->error($reqstate, 501, $err);
    }
}

sub handle_request {
    my ($self, $reqstate, $auth) = @_;

    eval {
	my $r = $reqstate->{request};
	my $method = $r->method();
	my $path = $r->uri->path();

	if ($path =~ m!$baseuri!) {
	    $self->handle_api2_request($reqstate, $auth);
	    return;
	}

	if ($self->{pages} && ($method eq 'GET') && (my $handler = $self->{pages}->{$path})) {
	    if (ref($handler) eq 'CODE') {
		my $params = decode_urlencoded($r->url->query());
		my ($resp, $userid) = &$handler($self, $reqstate->{request}, $params);
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
	    # we only allow simple names
	    if ($path =~ m!^(/\S+/)([a-zA-Z0-9\-\_\.]+)$!) {
		my ($subdir, $file) = ($1, $2);
		if (my $dir = $self->{dirs}->{$subdir}) {
		    my $filename = "$dir$file";
		    my $fh = IO::File->new($filename) ||
			die "unable to open file '$filename' - $!\n";
		    send_file_start($self, $reqstate, $filename);
		    return;
		}
	    }
	}

	die "no such file '$path'";
    };
    if (my $err = $@) {
	$self->error($reqstate, 501, $err);
    }
}

sub file_upload_multipart {
    my ($self, $reqstate, $auth, $rstate) = @_;

    eval {
	my $boundary = $rstate->{boundary};
	my $hdl = $reqstate->{hdl};

	my $startlen = length($hdl->{rbuf});

	if ($rstate->{phase} == 0) { # skip everything until start
	    if ($hdl->{rbuf} =~ s/^.*?--\Q$boundary\E  \015?\012
                       ((?:[^\015]+\015\012)* ) \015?\012//xs) {
		my $header = $1;
		my ($ct, $disp, $name, $filename);
		foreach my $line (split(/\015?\012/, $header)) {
		    # assume we have single line headers
		    if ($line =~ m/^Content-Type\s*:\s*(.*)/i) {
			$ct = parse_content_type($1);
		    } elsif ($line =~ m/^Content-Disposition\s*:\s*(.*)/i) {
			($disp, $name, $filename) = parse_content_disposition($1);
		    }
		}

		if (!($disp && $disp eq 'form-data' && $name)) {
		    syslog('err', "wrong content disposition in multipart - abort upload");
		    $rstate->{phase} = -1;
		} else {

		    $rstate->{fieldname} = $name;

		    if ($filename) {
			if ($name eq 'filename') {
			    # found file upload data
			    $rstate->{phase} = 1;
			    $rstate->{filename} = $filename;
			} else {
			    syslog('err', "wrong field name for file upload - abort upload");
			    $rstate->{phase} = -1;
			}
		    } else {
			# found form data for field $name
			$rstate->{phase} = 2;
		    }
		}
	    } else {
		my $len = length($hdl->{rbuf});
		substr($hdl->{rbuf}, 0, $len - $rstate->{maxheader}, '') 
		    if $len > $rstate->{maxheader}; # skip garbage
	    }
	} elsif ($rstate->{phase} == 1) { # inside file - dump until end marker
	    if ($hdl->{rbuf} =~ s/^(.*?)\015?\012(--\Q$boundary\E(--)? \015?\012(.*))$/$2/xs) {
		my ($rest, $eof) = ($1, $3);
		my $len = length($rest);
		die "write to temporary file failed - $!" 
		    if syswrite($rstate->{outfh}, $rest) != $len;
		$rstate->{ctx}->add($rest);
		$rstate->{params}->{filename} = $rstate->{filename};
		$rstate->{md5sum} = $rstate->{ctx}->hexdigest;
		$rstate->{bytes} += $len;
		$rstate->{phase} =  $eof ? 100 : 0;
	    } else {
		my $len = length($hdl->{rbuf});
		my $wlen = $len - $rstate->{boundlen};
		if ($wlen > 0) {
		    my $data =  substr($hdl->{rbuf}, 0, $wlen, '');
		    die "write to temporary file failed - $!" 
			if syswrite($rstate->{outfh}, $data) != $wlen;
		    $rstate->{bytes} += $wlen;
		    $rstate->{ctx}->add($data);
		}
	    }
	} elsif ($rstate->{phase} == 2) { # inside normal field

	    if ($hdl->{rbuf} =~ s/^(.*?)\015?\012(--\Q$boundary\E(--)? \015?\012(.*))$/$2/xs) {
		my ($rest, $eof) = ($1, $3);
		my $len = length($rest);
		if ($len < 1024) { # fixme: max data size
		    $rstate->{params}->{$rstate->{fieldname}} = $rest;
		    $rstate->{phase} = $eof ? 100 : 0;
		} else {
		    syslog('err', "for data to large - abort upload");
		    $rstate->{phase} = -1; # skip
		}
	    }
	} else { # skip 
	    my $len = length($hdl->{rbuf});
	    substr($hdl->{rbuf}, 0, $len, ''); # empty rbuf
	}

	$rstate->{read} += ($startlen - length($hdl->{rbuf}));

	if (!$rstate->{done} && ($rstate->{read} + length($hdl->{rbuf})) >= $rstate->{size}) {
	    $rstate->{done} = 1; # make sure we dont get called twice 
	    if ($rstate->{phase} < 0 || !$rstate->{md5sum}) {
		$self->error($reqstate, 501, "upload failed"); # fixme: better msg
	    } else {
		my $elapsed = tv_interval($rstate->{starttime});

		my $rate = int($rstate->{bytes}/($elapsed*1024*1024));
		syslog('info', "multipart upload complete " . 
		       "(size: %d time: %ds rate: %.2fMiB/s)", $rstate->{size}, $elapsed, $rate);
		$self->handle_api2_request($reqstate, $auth, $rstate);
	    }
	}
    };
    if (my $err = $@) {
	$self->error($reqstate, 501, $err);
    }
}

sub parse_content_type {
    my ($ctype) = @_;

    my ($ct, @params) = split(/\s*[;,]\s*/o, $ctype);
    
    foreach my $v (@params) {
	if ($v =~ m/^\s*boundary\s*=\s*(\S+?)\s*$/o) {
	    return wantarray ? ($ct, $1) : $ct;
	}
    }
 
    return  wantarray ? ($ct) : $ct;
}

sub parse_content_disposition {
    my ($line) = @_;

    my ($disp, @params) = split(/\s*[;,]\s*/o, $line);
    my $name;
    my $filename;

    foreach my $v (@params) {
	if ($v =~ m/^\s*name\s*=\s*(\S+?)\s*$/o) {
	    $name = $1;
	    $name =~ s/^"(.*)"$/$1/;
	} elsif ($v =~ m/^\s*filename\s*=\s*(\S+?)\s*$/o) {
	    $filename = $1;
	    $filename =~ s/^"(.*)"$/$1/;
	}
    }
 
    return  wantarray ? ($disp, $name, $filename) : $disp;
}

my $tmpfile_seq_no = 0;

sub get_upload_filename {
    # choose unpredictable tmpfile name
  
    $tmpfile_seq_no++;
    return "/var/tmp/pveupload-" . Digest::MD5::md5_hex($tmpfile_seq_no . time() . $$);
}

sub unshift_read_header {
    my ($self, $reqstate, $state) = @_;

    $state = {} if !$state;

    $reqstate->{hdl}->unshift_read(line => sub {
	my ($hdl, $line) = @_;

	eval {
	    #print "$$: got header: $line\n";

	    my $r = $reqstate->{request};
	    if ($line eq '') {

		my $path = $r->uri->path();
		my $method = $r->method();

		$r->push_header($state->{key}, $state->{val})
		    if $state->{key};

		if (!$known_methods->{$method}) {
		    my $resp = HTTP::Response->new(HTTP_NOT_IMPLEMENTED, "method '$method' not available");
		    $self->response($reqstate, $resp);
		    return;
		}

		my $conn = $r->header('Connection');

		if ($conn) {
		    $reqstate->{keep_alive} = 0 if $conn =~ m/close/oi;
		} else {
		    if ($reqstate->{proto}->{ver} < 1001) {
			$reqstate->{keep_alive} = 0;
		    }
		}

		my $te  = $r->header('Transfer-Encoding');
		if ($te && lc($te) eq 'chunked') {
		    # Handle chunked transfer encoding
		    $self->error($reqstate, 501, "chunked transfer encoding not supported");
		    return;
		} elsif ($te) {
		    $self->error($reqstate, 501, "Unknown transfer encoding '$te'");
		    return;
		}

		my $pveclientip = $r->header('PVEClientIP');

		# fixme: how can we make PVEClientIP header trusted?
		if ($self->{trusted_env} && $pveclientip) {
		    $reqstate->{peer_host} = $pveclientip;
		} else {
		    $r->header('PVEClientIP', $reqstate->{peer_host});
		}

		my $len = $r->header('Content-Length');

		# header processing complete - authenticate now

		my $auth = {};
		if ($path =~ m!$baseuri!) {
		    my $token = $r->header('CSRFPreventionToken');
		    my $cookie = $r->header('Cookie');
		    my $ticket = PVE::REST::extract_auth_cookie($cookie);

		    my ($rel_uri, $format) = split_abs_uri($path);
		    if (!$format) {
			$self->error($reqstate, HTTP_NOT_IMPLEMENTED, "no such uri");
			return;
		    }

		    eval {
			$auth = PVE::REST::auth_handler($self->{rpcenv}, $reqstate->{peer_host}, $method, 
							$rel_uri, $ticket, $token);
		    };
		    if (my $err = $@) {
			$self->error($reqstate, HTTP_UNAUTHORIZED, $err);
			return;
		    }
		}

		$reqstate->{log}->{userid} = $auth->{userid};

		if (defined($len)) {

		    if (!($method eq 'PUT' || $method eq 'POST')) {
			$self->error($reqstate, 501, "Unexpected content for method '$method'");
			return;
		    }

		    my $ctype = $r->header('Content-Type');
		    my ($ct, $boundary) = parse_content_type($ctype) if $ctype;

		    if ($auth->{isUpload} && !$self->{trusted_env}) {
			die "upload 'Content-Type '$ctype' not implemented\n" 
			    if !($boundary && $ct && ($ct eq 'multipart/form-data'));

			die "upload without content length header not supported" if !$len;

			die "upload without content length header not supported" if !$len;

			print "start upload $path $ct $boundary\n" if $self->{debug};

			my $tmpfilename = get_upload_filename();
			my $outfh = IO::File->new($tmpfilename, O_RDWR|O_CREAT|O_EXCL, 0600) ||
			    die "unable to create temporary upload file '$tmpfilename'";

			$reqstate->{keep_alive} = 0;

			my $boundlen = length($boundary) + 8; # \015?\012--$boundary--\015?\012

			my $state = {
			    size => $len,
			    boundary => $boundary,
			    ctx => Digest::MD5->new,
			    boundlen =>  $boundlen,
			    maxheader => 2048 + $boundlen, # should be large enough
			    params => decode_urlencoded($r->url->query()),
			    phase => 0,
			    read => 0,
			    starttime => [gettimeofday],
			    outfh => $outfh,
			};
			$reqstate->{tmpfilename} = $tmpfilename;
			$reqstate->{hdl}->on_read(sub { $self->file_upload_multipart($reqstate, $auth, $state); });
			return;
		    }

		    if (!$ct || $ct eq 'application/x-www-form-urlencoded') {
			$reqstate->{hdl}->unshift_read(chunk => $len, sub {
			    my ($hdl, $data) = @_;
			    $r->content($data);
			    $self->handle_request($reqstate, $auth);
		        });
		    } else {
			$self->error($reqstate, 506, "upload 'Content-Type '$ctype' not implemented");
		    }
		} else {
		    $self->handle_request($reqstate, $auth);
		}
	    } elsif ($line =~ /^([^:\s]+)\s*:\s*(.*)/) {
		$r->push_header($state->{key}, $state->{val}) if $state->{key};
		($state->{key}, $state->{val}) = ($1, $2);
		$self->unshift_read_header($reqstate, $state);
	    } elsif ($line =~ /^\s+(.*)/) {
		$state->{val} .= " $1";
		$self->unshift_read_header($reqstate, $state);
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
		    $reqstate->{proto}->{str} = "HTTP/$maj.$min";
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

    return $clientfh;
}

sub wait_end_loop {
    my ($self) = @_;

    $self->{end_loop} = 1;

    undef $self->{socket_watch};

    if ($self->{conn_count} <= 0) {
	$self->{end_cond}->send(1);
	return;
    }

    # else we need to wait until all open connections gets closed
    my $w; $w = AnyEvent->timer (after => 1, interval => 1, cb => sub {
	eval {
	    # todo: test for active connections instead (we can abort idle connections)
	    if ($self->{conn_count} <= 0) {
		undef $w;
		$self->{end_cond}->send(1);
	    }
	};
	warn $@ if $@;
    });
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
		rbuf_max => 64*1024,
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

	    print "$$: ACCEPT FH" .  $clientfh->fileno() . " CONN$self->{conn_count}\n" if $self->{debug};

	    $self->push_request_header($reqstate);
	}
    };

    if (my $err = $@) {
	syslog('err', $err);
	$self->{end_loop} = 1;
    }

    $self->wait_end_loop() if $self->{end_loop};
}

# Note: We can't open log file in non-blocking mode and use AnyEvent::Handle,
# because we write from multiple processes, and that would arbitrarily mix output
# of all processes.
sub open_access_log {
    my ($self, $filename) = @_;

    my $old_mask = umask(0137);;
    my $logfh = IO::File->new($filename, ">>") ||
	die "unable to open log file '$filename' - $!\n";
    umask($old_mask);

    $logfh->autoflush(1);

    $self->{logfh} = $logfh;
}

sub write_log {
    my ($self, $data) = @_;

    return if !defined($self->{logfh}) || !$data;

    my $res = $self->{logfh}->print($data);

    if (!$res) {
	delete $self->{logfh};
	syslog('err', "error writing access log");
	$self->{end_loop} = 1; # terminate asap
    }
}

sub atfork_handler {
    my ($self) = @_;

    eval {
	# something else do to ?
	close($self->{socket});
    };
    warn $@ if $@;
}

sub new {
    my ($this, %args) = @_;

    my $class = ref($this) || $this;

    foreach my $req (qw(socket lockfh lockfile)) {
	die "misssing required argument '$req'" if !defined($args{$req});
    }

    my $self = bless { %args }, $class;

    # init inotify
    PVE::INotify::inotify_init();

    $self->{rpcenv} = PVE::RPCEnvironment->init(
	$self->{trusted_env} ? 'priv' : 'pub', atfork =>  sub { $self-> atfork_handler() });

    fh_nonblocking($self->{socket}, 1);

    $self->{end_loop} = 0;
    $self->{conn_count} = 0;
    $self->{request_count} = 0;
    $self->{timeout} = 5 if !$self->{timeout};
    $self->{keep_alive} = 0 if !defined($self->{keep_alive});
    $self->{max_conn} = 800 if !$self->{max_conn};
    $self->{max_requests} = 8000 if !$self->{max_requests};

    $self->{end_cond} = AnyEvent->condvar;

    if ($self->{ssl}) {
	$self->{tls_ctx} = AnyEvent::TLS->new(%{$self->{ssl}});
    }

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

    $self->{term_watch} = AnyEvent->signal(signal => "TERM", cb => sub {
	undef $self->{term_watch};
	$self->wait_end_loop();
    });

    $self->{quit_watch} = AnyEvent->signal(signal => "QUIT", cb => sub {
	undef $self->{quit_watch};
	$self->wait_end_loop();
    });

    $self->{inotify_poll} = AnyEvent->timer(after => 5, interval => 5, cb => sub {
	PVE::INotify::poll(); # read inotify events
    });

    return $self;
}

sub run {
    my ($self) = @_;

    $self->{end_cond}->recv;
}

1;
