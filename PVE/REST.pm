package PVE::REST;

use warnings;
use strict;
use English;
use PVE::Cluster;
use PVE::SafeSyslog;
use PVE::Tools;
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

my $base_handler_class;

sub set_base_handler_class {
    my ($class) = @_;

    die "base_handler_class already defined" if $base_handler_class;

    $base_handler_class = $class;
}

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

my $exc_to_res = sub {
    my ($info, $err, $status) = @_;

    $status = $status || HTTP_INTERNAL_SERVER_ERROR;

    my $resp = { info => $info };
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
	($rel_uri eq '/access/ticket' && ($method eq 'GET' || $method eq 'POST'))) {
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

    die "no base handler - internal error" if !$base_handler_class;

    my $uri_param = {};
    my ($handler, $info) = $base_handler_class->find_handler($method, $rel_uri, $uri_param);
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
	return &$exc_to_res($info, $err, HTTP_FORBIDDEN);
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
	    return &$exc_to_res($info, $err);
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
	return &$exc_to_res($info, $err);
    }

    return $resp;
}

1;
