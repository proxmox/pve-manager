package PVE::API2::Formatter::HTML;

use strict;
use warnings;

use PVE::REST;
use PVE::HTTPServer;
use HTTP::Status;
use JSON;
use HTML::Entities;
use PVE::JSONSchema;
use PVE::API2::Formatter::Bootstrap;
use PVE::API2::Formatter::Standard;

my $portal_format = 'html';
my $portal_ct = 'text/html;charset=UTF-8';

my $baseurl = "/api2/$portal_format";
my $login_url = "$baseurl/access/ticket";

sub render_page {
    my ($doc, $html) = @_;

    my $items = [];

    push @$items, {
	tag => 'li',
	cn => {
	    tag => 'a',
	    href => $login_url,
	    onClick => "PVE.delete_auth_cookie();",
	    text => "Logout",
	}};


    my $title = "Proxmox VE";

    my $nav = $doc->el(
	class => "navbar navbar-inverse navbar-fixed-top",
	role => "navigation", cn => {
	    class => "container", cn => [
		{
		    class => "navbar-header", cn => [
			{
			    tag => 'button',
			    type => 'button',
			    class => "navbar-toggle",
			    'data-toggle' => "collapse",
			    'data-target' => ".navbar-collapse",
			    cn => [
				{ tag => 'span', class => 'sr-only', text => "Toggle navigation" },
				{ tag => 'span', class => 'icon-bar' },
				{ tag => 'span', class => 'icon-bar' },
				{ tag => 'span', class => 'icon-bar' },
			    ],
			},
			{
			    tag => 'a',
			    class => "navbar-brand",
			    href => $baseurl,
			    text => $title,
			},
		    ],
		},
		{
		    class => "collapse navbar-collapse",
		    cn => {
			tag => 'ul',
			class => "nav navbar-nav",
			cn => $items,
		    },
		},
	    ],
	});

    $items = [];
    my @pcomp = split('/', $doc->{url});
    shift @pcomp; # empty
    shift @pcomp; # api2
    shift @pcomp; # $format

    my $href = $baseurl;
    push @$items, { tag => 'li', cn => {
	tag => 'a',
	href => $href,
	text => 'Home'}};
 
    foreach my $comp (@pcomp) {
	$href .= "/$comp";
	push @$items, { tag => 'li', cn => {
	    tag => 'a',
	    href => $href,
	    text => $comp}};
    }

    my $breadcrumbs = $doc->el(tag => 'ol', class => 'breadcrumb container', cn => $items);

    return $doc->body($nav . $breadcrumbs . $html);
}

my $login_form = sub {
    my ($doc, $param, $errmsg) = @_;

    $param = {} if !$param;

    my $username = $param->{username} || '';
    my $password = $param->{password} || '';

    my $items = [
	{
	    tag => 'label', 
	    text => "Please sign in",
	}, 
	{ 
	    tag => 'input', 
	    type => 'text', 
	    class => 'form-control',
	    name => 'username', 
	    value => $username, 
	    placeholder => "Enter user name", 
	    required => 1, 
	    autofocus => 1,
	},
	{
	    tag => 'input',
	    type => 'password',
	    class => 'form-control',
	    name => 'password',
	    value => $password,
	    placeholder => 'Password',
	    required => 1,
	},
    ];

    my $html = '';

    $html .= $doc->alert(text => $errmsg) if ($errmsg);

    $html .= $doc->el(
	class => 'container',
	cn => {
	    tag => 'form', 
	    role => 'form', 
	    method => 'POST', 
	    action => $login_url,
	    cn => [
		{
		    class => 'form-group',
		    cn => $items,
		},
		{
		    tag => 'button',
		    type => 'submit',
		    class => 'btn btn-lg btn-primary btn-block',
		    text => "Sign in",
		},
	    ],
	});

    return $html;
};

PVE::HTTPServer::register_login_formatter($portal_format, sub {
    my ($path, $auth) = @_;

    my $headers = HTTP::Headers->new(Location => $login_url);
    return HTTP::Response->new(301, "Moved", $headers);
});

PVE::HTTPServer::register_formatter($portal_format, sub {
    my ($res, $data, $param, $path, $auth) = @_;

    # fixme: clumsy!
    PVE::API2::Formatter::Standard::prepare_response_data($portal_format, $res);
    $data = $res->{data};

    my $html = '';
    my $doc = PVE::API2::Formatter::Bootstrap->new($res, $path);

    if (!HTTP::Status::is_success($res->{status})) {
	$html .= $doc->alert(text => "Error $res->{status}: $res->{message}");
    }

    my $info = $res->{info};
    my $lnk = PVE::JSONSchema::method_get_child_link($info);

    if ($lnk && $data && $data->{data} && HTTP::Status::is_success($res->{status})) {

	my $href = $lnk->{href};
	if ($href =~ m/^\{(\S+)\}$/) {

	    my $items = [];

	    my $prop = $1;
	    $path =~ s/\/+$//; # remove trailing slash

	    foreach my $elem (sort {$a->{$prop} cmp $b->{$prop}} @{$data->{data}}) {
		next if !ref($elem);
		
		if (defined(my $value = $elem->{$prop})) {
		    if ($value ne '') {
			my $text = $value;
			if (scalar(keys %$elem) > 1) {
			    my $tv = to_json($elem, {allow_nonref => 1, canonical => 1});
			    $text = "$value $tv";
			}
			push @$items, {
			    tag => 'a', 
			    class => 'list-group-item',
			    href => "$path/$value",
			    text => $text,
			}
		    }
		}
	    }

	    $html .= $doc->el(class => 'list-group', cn => $items);

	} else {

	    my $json = to_json($data, {allow_nonref => 1, pretty => 1});
	    $html .= $doc->el(tag => 'pre', text => $json);
 	}

    } else {

	my $json = to_json($data, {allow_nonref => 1, pretty => 1});
	$html .= $doc->el(tag => 'pre', text => $json);
    }

    $html = $doc->el(class => 'container', html => $html);

    my $raw = render_page($doc, $html);
    return ($raw, $portal_ct);
});

PVE::API2->register_page_formatter(
    'format' => $portal_format,
    method => 'GET',
    path => "/access/ticket",
    code => sub {
	my ($res, $data, $param, $path, $auth) = @_;

	my $doc = PVE::API2::Formatter::Bootstrap->new($res, $path);

	my $html = &$login_form($doc);

	my $raw = render_page($doc, $html);
	return ($raw, $portal_ct);
    });

PVE::API2->register_page_formatter(
    'format' => $portal_format,
    method => 'POST',
    path => "/access/ticket",
    code => sub {
	my ($res, $data, $param, $path, $auth) = @_;

	if (HTTP::Status::is_success($res->{status})) {
	    my $cookie = PVE::REST::create_auth_cookie($data->{ticket});
	    my $headers = HTTP::Headers->new(Location => $baseurl,
					     'Set-Cookie' => $cookie);
	    return HTTP::Response->new(301, "Moved", $headers);
	}

	# Note: HTTP server redirects to 'GET /access/ticket', so below
	# output is not really visible.

	my $doc = PVE::API2::Formatter::Bootstrap->new($res, $path);

	my $html = &$login_form($doc);

	my $raw = render_page($doc, $html);
	return ($raw, $portal_ct);
    });

1;
