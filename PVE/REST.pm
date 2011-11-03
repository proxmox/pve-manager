package PVE::REST;

use warnings;
use strict;
use Digest::SHA1 qw(sha1_base64);
use PVE::Cluster;
use PVE::SafeSyslog;
use PVE::Tools;
use PVE::API2;
use Apache2::Const;
use mod_perl2;
use JSON;
use Digest::SHA;
use LWP::UserAgent;
use HTTP::Request::Common;
use HTTP::Status qw(:constants :is status_message);
use HTML::Entities;
use PVE::JSONSchema;
use PVE::AccessControl;
use PVE::RPCEnvironment;

use Data::Dumper; # fixme: remove

my $cookie_name = 'PVEAuthCookie';

my $baseuri = "/api2";

# http://perl.apache.org/docs/2.0/api/Apache2/SubProcess.html

my $debug_enabled;
sub enable_debug {
    $debug_enabled = 1;
}

sub debug_msg {
    return if !$debug_enabled;
    syslog('info', @_);
}

sub extract_auth_cookie {
    my ($cookie) = @_;

    return undef if !$cookie;

    return ($cookie =~ /(?:^|\s)$cookie_name=([^;]*)/)[0];
}

sub create_auth_cookie {
    my ($ticket) = @_;

    return "${cookie_name}=$ticket; path=/; secure;";
}

sub format_response_data {
    my($format, $res, $uri) = @_;

    my $data = $res->{data};
    my $info = $res->{info};

    my ($ct, $raw);

    if ($format eq 'json') {
	$ct = 'application/json';
	$raw = to_json($data, {utf8 => 1, allow_nonref => 1});
    } elsif ($format eq 'html') {
	$ct = 'text/html';
	$raw = "<html><body>";
	if (!is_success($res->{status})) {
	    my $msg = $res->{message} || '';
	    $raw .= "<h1>ERROR $res->{status} $msg</h1>";
	}
	my $lnk = PVE::JSONSchema::method_get_child_link($info);
	if ($lnk && $data && $data->{data} && is_success($res->{status})) {

	    my $href = $lnk->{href};
	    if ($href =~ m/^\{(\S+)\}$/) {
		my $prop = $1;
		$uri =~ s/\/+$//; # remove trailing slash
		foreach my $elem (sort {$a->{$prop} cmp $b->{$prop}} @{$data->{data}}) {
		    next if !ref($elem);

		    if (defined(my $value = $elem->{$prop})) {
			if ($value ne '') {
			    if (scalar(keys %$elem) > 1) {
				my $tv = to_json($elem, {allow_nonref => 1, canonical => 1});
				$raw .= "<a href='$uri/$value'>$value</a> <pre>$tv</pre><br>";
			    } else {
				$raw .= "<a href='$uri/$value'>$value</a><br>";
			    }
			}
		    }
		}
	    }
	} else {
	    $raw .= "<pre>";
	    $raw .= encode_entities(to_json($data, {utf8 => 1, allow_nonref => 1, pretty => 1}));
	    $raw .= "</pre>";
	}
	$raw .= "</body></html>";

    } elsif ($format eq 'png') {
	$ct = 'image/png';

	# fixme: better to revove that whole png thing ?

	my $filename;
	$raw = '';

	if ($data && ref($data) && ref($data->{data}) && 
	    $data->{data}->{filename}) {
	    $filename = $data->{data}->{filename};
	    $raw = PVE::Tools::file_get_contents($filename);
	}
	    
    } elsif ($format eq 'extjs') {
	$ct = 'application/json';
	$raw = to_json($data, {utf8 => 1, allow_nonref => 1});
    } elsif ($format eq 'htmljs') {
	# we use this for extjs file upload forms
	$ct = 'text/html';
	$raw = encode_entities(to_json($data, {utf8 => 1, allow_nonref => 1}));
    } else {
	$ct = 'text/plain';
	$raw = to_json($data, {utf8 => 1, allow_nonref => 1, pretty => 1});
    }

    return wantarray ? ($raw, $ct) : $raw;
}

sub prepare_response_data {
    my ($format, $res) = @_;

    my $success = 1;
    my $new = {
	data => $res->{data},
    };
    if (scalar(keys %{$res->{errors}})) {
	$success = 0;
	$new->{errors} = $res->{errors};
    }

    if ($format eq 'extjs' || $format eq 'htmljs') {
	# HACK: extjs wants 'success' property instead of useful HTTP status codes
	if (is_error($res->{status})) {
	    $success = 0;
	    $new->{message} = $res->{message} || status_message($res->{status});
	    $new->{status} = $res->{status} || HTTP_OK;
	    $res->{message} = undef;
	    $res->{status} = HTTP_OK;
	}
	$new->{success} = $success;
    }

    if ($success && $res->{total}) {
	$new->{total} = $res->{total};
    }

    $res->{data} = $new;
}

sub create_http_request {
    my ($uri, $method, $params) = @_;

    # NOTE: HTTP::Request::Common::PUT is crap - so we use our own code
    # borrowed from HTTP::Request::Common::POST

    if  ($method eq 'POST' || $method eq 'PUT') {

	my $req = HTTP::Request->new($method => $uri);
	$req->header('Content-Type' => 'application/x-www-form-urlencoded'); 

	# We use a temporary URI object to format
	# the application/x-www-form-urlencoded content.
	my $url = URI->new('http:');
	$url->query_form(%$params);
	my $content = $url->query;
	if (defined($content)) {
	    $req->header('Content-Length' => length($content));
	    $req->content($content);
	} else {
	    $req->header('Content-Length' => 0);
	}

	return $req;
    }

    die "unknown method '$method'"; 
}

sub proxy_handler {
    my($r, $clientip, $host, $method, $abs_uri, $ticket, $token, $params) = @_;

    debug_msg("proxy start $method $host:$abs_uri");

    my $ua = LWP::UserAgent->new(
	protocols_allowed => [ 'http', 'https' ],
	timeout => 30,
	);

    $ua->default_header('cookie' => "${cookie_name}=$ticket") if $ticket;
    $ua->default_header('CSRFPreventionToken' => $token) if $token;
    $ua->default_header('PVEDisableProxy' => 'true');
    $ua->default_header('PVEClientIP' => $clientip);

    my $uri = URI->new();

    if ($host eq 'localhost') {
	$uri->scheme('http');
	$uri->host('localhost');
	$uri->port(85);
    } else {
	$uri->scheme('https');
	$uri->host($host);
	$uri->port(8006);
    }

    $uri->path($abs_uri);

    my $response;
    if ($method eq 'GET') {
	$uri->query_form($params);
	$response = $ua->request(HTTP::Request::Common::GET($uri));		    
    } elsif ($method eq 'POST' || $method eq 'PUT') {
	$response = $ua->request(create_http_request($uri, $method, $params));
    } elsif ($method eq 'DELETE') {
	$response = $ua->request(HTTP::Request::Common::DELETE($uri));
    } else {
	my $code = HTTP_NOT_IMPLEMENTED;
	$r->status_line("$code proxy method '$method' not implemented");
	return $code;
    }


    if (my $cookie = $response->header("Set-Cookie")) {
	$r->err_headers_out()->add("Set-Cookie" => $cookie);
    }

    my $ct = $response->header('Content-Type');

    my $code = $response->code;
    $r->status($code);

    if (my $message = $response->message) {
	$r->status_line("$code $message");
    }

    $r->content_type($ct) if $ct;
    my $raw = $response->decoded_content;

    # note: do not use err_headers_out(), because mod_deflate has a bug,
    # resulting in dup length (for exampe 'content-length: 89, 75')
    $r->headers_out()->add('Content-Length' , length($raw));
    $r->print($raw);

    debug_msg("proxy end $method $host:$abs_uri ($code)");

    return OK;
}

my $check_permissions = sub {
    my ($rpcenv, $perm, $username, $param) = @_;

    return 1 if !$username && $perm->{user} eq 'world';

    return 1 if $username eq 'root@pam';

    die "permission check failed (user != root)\n" if !$perm;

    return 1 if $perm->{user} && $perm->{user} eq 'all';

    return 1 if $perm->{user} && $perm->{user} eq 'arg' && 
	$username eq $param->{username};

    if ($perm->{path} && $perm->{privs}) {
	my $path = PVE::Tools::template_replace($perm->{path}, $param);
	if (!$rpcenv->check($username, $path, $perm->{privs})) {
	    my $privstr = join(',', @{$perm->{privs}});
	    die "Permission check failed ($path, $privstr)\n";
	}
	return 1;
    }

    die "Permission check failed\n";
};

sub rest_handler {
    my ($rpcenv, $clientip, $method, $abs_uri, $rel_uri, $ticket, $token) = @_;

    # set environment variables
    $rpcenv->set_language('C'); # fixme:
    $rpcenv->set_client_ip($clientip);
    $rpcenv->set_result_count(undef);

    my $euid = $>;

    my $require_auth = 1;

    # explicitly allow some calls without auth
    if (($rel_uri eq '/access/domains' && $method eq 'GET') ||
	($rel_uri eq '/access/ticket' && $method eq 'POST')) {
	$require_auth = 0;
    }

    my ($username, $age);

    my $isUpload = 0;

    if ($require_auth) {

	eval {
	    die "No ticket\n" if !$ticket;

	    ($username, $age) = PVE::AccessControl::verify_ticket($ticket);

	    $rpcenv->set_user($username);

	    if ($method eq 'POST' && $rel_uri =~ m|^/nodes/([^/]+)/storage/([^/]+)/upload$|) {
		my ($node, $storeid) = ($1, $2);
		my $perm = {
		    path => "/storage/$storeid",
		    privs => [ 'abc' ],
		};
		&$check_permissions($rpcenv, $perm, $username, {});
		$isUpload = 1;
	    }

	    # we skip CSRF check for file upload, because it is
	    # difficult to pass CSRF HTTP headers with native html forms,
	    # and it should not be necessary at all.
	    PVE::AccessControl::verify_csrf_prevention_token($username, $token)
		if !$isUpload && ($euid != 0) && ($method ne 'GET');
	};
	if (my $err = $@) {
	    return { 
		status => HTTP_UNAUTHORIZED, 
		message => $err,
	    };
	}
    }

    # we are authenticated now

    my $uri_param = {};
    my ($handler, $info) = PVE::API2->find_handler($method, $rel_uri, $uri_param);
    if (!$handler || !$info) {
	return {
	    status => HTTP_NOT_IMPLEMENTED,
	    message => "Method '$method $abs_uri' not implemented",
	};
    }

    # Note: we need to delay CGI parameter parsing until
    # we are authenticated (avoid DOS (file upload) attacs)

    my $params;
    eval { $params = $rpcenv->parse_params($isUpload); };
    if (my $err = $@) {
	return { 
	    status => HTTP_BAD_REQUEST, 
	    message => "parameter parser failed: $err",
	};   
    }

    delete $params->{_dc}; # remove disable cache parameter

    foreach my $p (keys %{$params}) {
	if (defined($uri_param->{$p})) {
	    return {
		status => HTTP_BAD_REQUEST,
		message => "Parameter verification failed - duplicate parameter '$p'",
	    };
	}
	$uri_param->{$p} = $params->{$p};
    }

    # check access permissions
    eval { &$check_permissions($rpcenv, $info->{permissions}, $username, $uri_param); };
    if (my $err = $@) {
	return { 
	    status => HTTP_FORBIDDEN, 
	    message => $err,
	};
    }

    if ($info->{proxyto}) {
	my $remip;
	eval {
	    my $pn = $info->{proxyto};
	    my $node = $uri_param->{$pn};
	    die "proxy parameter '$pn' does not exists" if !$node;

	    if ($node ne 'localhost' && $node ne PVE::INotify::nodename()) {
		die "unable to proxy file uploads" if $isUpload; 
		$remip = PVE::Cluster::remote_node_ip($node);
	    }
	};
	if (my $err = $@) {
	    return {
		status => HTTP_INTERNAL_SERVER_ERROR,
		message => $err,
	    };
	}
	if ($remip) {
	    return { proxy => $remip, proxy_params => $params };
	}
    } 

    if ($info->{protected} && ($euid != 0)) {
	if ($isUpload) {
	    my $uinfo = $rpcenv->get_upload_info('filename');
	    $params->{tmpfilename} = $uinfo->{tmpfilename};
	}
	return { proxy => 'localhost' , proxy_params => $params }
    }

    my $resp = { 
	info => $info, # useful to format output
	status => HTTP_OK,
    }; 

    eval {
	$resp->{data} = $handler->handle($info, $uri_param);

	if (my $count = $rpcenv->get_result_count()) {
	    $resp->{total} = $count;
	}
    };
    my $err = $@;
    if ($err) {
	if (ref($err) eq "PVE::Exception") {
	    $resp->{status} = $err->{code} || HTTP_INTERNAL_SERVER_ERROR;
	    $resp->{message} = $err->{msg} || $@;
	    $resp->{errors} = $err->{errors} if $err->{errors};
	} else {
	    $resp->{status} = HTTP_INTERNAL_SERVER_ERROR;
	    $resp->{message} = $@;
	}
    }

    $rpcenv->set_user(undef);

    if ($rel_uri eq '/access/ticket') {
	$resp->{ticket} = $resp->{data}->{ticket};
    }

    # fixme: update ticket if too old
    # $resp->{ticket} = update_ticket($ticket);

    return $resp;
}

sub split_abs_uri {
    my ($abs_uri) = @_;

    my ($format, $rel_uri) = $abs_uri =~ m/^\Q$baseuri\E\/+(html|json|extjs|png|htmljs)(\/.*)?$/;
    $rel_uri = '/' if !$rel_uri;
 
    return wantarray ? ($rel_uri, $format) : $rel_uri;
}

my $known_methods = {
    GET => 1,
    POST => 1,
    PUT => 1,
    DELETE => 1,
};

sub handler {
     my($r) = @_;

     debug_msg("perl handler called");

     my $method = $r->method;
     my $clientip = $r->connection->remote_ip();

     return HTTP_NOT_IMPLEMENTED
	 if !$known_methods->{$method};

     my $cookie = $r->headers_in->{Cookie};
     my $token = $r->headers_in->{CSRFPreventionToken};

     my $ticket = extract_auth_cookie($cookie);

     $r->no_cache (1);

     my $abs_uri = $r->uri;
     my ($rel_uri, $format) = split_abs_uri($abs_uri);
     return HTTP_NOT_IMPLEMENTED if !$format;

     my $rpcenv;
     my $res;

     eval { 
	 $rpcenv = PVE::RPCEnvironment::get();
	 $rpcenv->init_request(request_rec => $r); 
     };
     if (my $err = $@) {
	 syslog('err', $err);
	 $res = { status => HTTP_INTERNAL_SERVER_ERROR, message => $err };
     } else {
	 $res = rest_handler($rpcenv, $clientip, $method, $abs_uri, $rel_uri, 
			     $ticket, $token);
     }

     if ($res->{proxy}) {
	 if (($res->{proxy} ne 'localhost') && $r->headers_in->{'PVEDisableProxy'}) {
	     my $code = FORBIDDEN;
	     $r->status($code);
	     $r->status_line("$code proxy loop detected - aborted ");
	     return $res->{status};	     
	 } 
	 return proxy_handler($r, $clientip, $res->{proxy}, $method, 
			      $abs_uri, $ticket, $token, $res->{proxy_params});
     }

     prepare_response_data($format, $res);

     if ($res->{ticket}) {
	 my $cookie = create_auth_cookie($res->{ticket});
	 $r->err_headers_out()->add("Set-Cookie" => $cookie);
     }

     $r->status($res->{status} || HTTP_OK);
 
     if ($res->{message}) {
	 my ($firstline) = $res->{message} =~ m/\A(.*)$/m;
	 $r->status_line("$res->{status} $firstline");
     }

     my ($raw, $ct) = format_response_data($format, $res, $abs_uri);
     $r->content_type ($ct);

     # note: do not use err_headers_out(), because mod_deflate has a bug,
     # resulting in dup length (for exampe 'content-length: 89, 75')
     $r->headers_out()->add('Content-Length', length($raw));
     $r->print($raw);
    
     debug_msg("perl handler end $res->{status}");

     return OK;
}

1;
