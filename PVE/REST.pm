package PVE::REST;

use warnings;
use strict;
use English;
use PVE::Cluster;
use PVE::SafeSyslog;
use PVE::Tools;
use PVE::API2;
use JSON;
use LWP::UserAgent;
use HTTP::Request::Common;
use HTTP::Status qw(:constants :is status_message);
use HTML::Entities;
use PVE::Exception qw(raise raise_perm_exc);
use PVE::JSONSchema;
use PVE::AccessControl;
use PVE::RPCEnvironment;
use URI::Escape;

use Data::Dumper; # fixme: remove

my $cookie_name = 'PVEAuthCookie';

sub extract_auth_cookie {
    my ($cookie) = @_;

    return undef if !$cookie;

    my $ticket = ($cookie =~ /(?:^|\s)$cookie_name=([^;]*)/)[0];

    if ($ticket && $ticket =~ m/^PVE%3A/) {
	$ticket = uri_unescape($ticket);
    }

    return $ticket;
}

sub create_auth_cookie {
    my ($ticket) = @_;

    my $encticket = uri_escape($ticket);
    return "${cookie_name}=$encticket; path=/; secure;";
}

sub format_response_data {
    my($format, $res, $uri) = @_;

    my $data = $res->{data};
    my $info = $res->{info};

    my ($ct, $raw, $nocomp);

    if ($format eq 'json') {
	$ct = 'application/json;charset=UTF-8';
	$raw = to_json($data, {utf8 => 1, allow_nonref => 1});
    } elsif ($format eq 'html') {
	$ct = 'text/html;charset=UTF-8';
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
	    $raw .= encode_entities(to_json($data, {allow_nonref => 1, pretty => 1}));
	    $raw .= "</pre>";
	}
	$raw .= "</body></html>";

    } elsif ($format eq 'png') {
	$ct = 'image/png';
	$nocomp = 1;
	# fixme: better to revove that whole png thing ?

	my $filename;
	$raw = '';

	if ($data && ref($data) && ref($data->{data}) && 
	    $data->{data}->{filename} && defined($data->{data}->{image})) {
	    $filename = $data->{data}->{filename};
	    $raw = $data->{data}->{image};
	}
	    
    } elsif ($format eq 'extjs') {
	$ct = 'application/json;charset=UTF-8';
	$raw = to_json($data, {utf8 => 1, allow_nonref => 1});
    } elsif ($format eq 'htmljs') {
	# we use this for extjs file upload forms
	$ct = 'text/html;charset=UTF-8';
	$raw = encode_entities(to_json($data, {allow_nonref => 1}));
    } elsif ($format eq 'spiceconfig') {
	$ct = 'application/x-spice-configuration;charset=UTF-8';
	if ($data && ref($data) && ref($data->{data})) {
	    $raw = "[virt-viewer]\n";
	    $raw .= "title=$data->{data}->{title}\n" if $data->{data}->{title};
	    $raw .= "type=$data->{data}->{type}\n" if $data->{data}->{type};
	    $raw .= "host=$data->{data}->{host}\n" if $data->{data}->{host};
	    $raw .= "port=$data->{data}->{port}\n" if $data->{data}->{port};
	    $raw .= "password=$data->{data}->{password}\n" if $data->{data}->{password};
	    $raw .= "proxy=$data->{data}->{proxy}\n" if $data->{data}->{proxy};
        }
    } else {
	$ct = 'text/plain;charset=UTF-8';
	$raw = to_json($data, {utf8 => 1, allow_nonref => 1, pretty => 1});
    }

    return wantarray ? ($raw, $ct, $nocomp) : $raw;
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
	    $new->{status} = $res->{status} || 200;
	    $res->{message} = undef;
	    $res->{status} = 200;
	}
	$new->{success} = $success;
    }

    if ($success && $res->{total}) {
	$new->{total} = $res->{total};
    }

    if ($success && $res->{changes}) {
	$new->{changes} = $res->{changes};
    }

    $res->{data} = $new;
}

my $exc_to_res = sub {
    my ($err, $status) = @_;

    $status = $status || HTTP_INTERNAL_SERVER_ERROR;

    my $resp = {};
    if (ref($err) eq "PVE::Exception") {
	$resp->{status} = $err->{code} || $status;
	$resp->{errors} = $err->{errors} if $err->{errors};
	$resp->{message} = $err->{msg};
    } else {
	$resp->{status} = $status;
	$resp->{message} = $err;
    }

    return $resp;
};

sub auth_handler {
    my ($rpcenv, $clientip, $method, $rel_uri, $ticket, $token) = @_;
    
    # set environment variables
    $rpcenv->set_user(undef);
    $rpcenv->set_language('C'); # fixme:
    $rpcenv->set_client_ip($clientip);

    my $require_auth = 1;

    # explicitly allow some calls without auth
    if (($rel_uri eq '/access/domains' && $method eq 'GET') ||
	($rel_uri eq '/access/ticket' && $method eq 'POST')) {
	$require_auth = 0;
    }

    my ($username, $age);

    my $isUpload = 0;

    if ($require_auth) {

	die "No ticket\n" if !$ticket;

	($username, $age) = PVE::AccessControl::verify_ticket($ticket);

	$rpcenv->set_user($username);

	if ($method eq 'POST' && $rel_uri =~ m|^/nodes/([^/]+)/storage/([^/]+)/upload$|) {
	    my ($node, $storeid) = ($1, $2);
	    # we disable CSRF checks if $isUpload is set,
	    # to improve security we check user upload permission here
	    my $perm = { check => ['perm', "/storage/$storeid", ['Datastore.AllocateTemplate']] };
	    $rpcenv->check_api2_permissions($perm, $username, {});
	    $isUpload = 1;
	}

	# we skip CSRF check for file upload, because it is
	# difficult to pass CSRF HTTP headers with native html forms,
	# and it should not be necessary at all.
	PVE::AccessControl::verify_csrf_prevention_token($username, $token)
	    if !$isUpload && ($EUID != 0) && ($method ne 'GET');
    }

    return {
	ticket => $ticket,
	token => $token,
	userid => $username,
	age => $age,
	isUpload => $isUpload,
    };
}

sub rest_handler {
    my ($rpcenv, $clientip, $method, $rel_uri, $auth, $params) = @_;

    my $uri_param = {};
    my ($handler, $info) = PVE::API2->find_handler($method, $rel_uri, $uri_param);
    if (!$handler || !$info) {
	return {
	    status => HTTP_NOT_IMPLEMENTED,
	    message => "Method '$method $rel_uri' not implemented",
	};
    }

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
    eval { $rpcenv->check_api2_permissions($info->{permissions}, $auth->{userid}, $uri_param); };
    if (my $err = $@) {
	return &$exc_to_res($err, HTTP_FORBIDDEN);
    }

    if ($info->{proxyto}) {
	my $remip;
	eval {
	    my $pn = $info->{proxyto};
	    my $node = $uri_param->{$pn};
	    die "proxy parameter '$pn' does not exists" if !$node;

	    if ($node ne 'localhost' && $node ne PVE::INotify::nodename()) {
		die "unable to proxy file uploads" if $auth->{isUpload}; 
		$remip = PVE::Cluster::remote_node_ip($node);
	    }
	};
	if (my $err = $@) {
	    return &$exc_to_res($err);
	}
	if ($remip) {
	    return { proxy => $remip, proxy_params => $params };
	}
    } 

    if ($info->{protected} && ($EUID != 0)) {
	return { proxy => 'localhost' , proxy_params => $params }
    }

    my $resp = { 
	info => $info, # useful to format output
	status => HTTP_OK,
    }; 

    eval {
	$resp->{data} = $handler->handle($info, $uri_param);

	if (my $count = $rpcenv->get_result_attrib('total')) {
	    $resp->{total} = $count;
	}
	if (my $diff = $rpcenv->get_result_attrib('changes')) {
	    $resp->{changes} = $diff;
	}
    };
    if (my $err = $@) {
	return &$exc_to_res($err);
    }

    return $resp;
}

1;
