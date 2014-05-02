package PVE::API2;

use strict;
use warnings;

use PVE::pvecfg;
use PVE::HTTPServer;
use PVE::RESTHandler;
use HTTP::Status;
use JSON;
use HTML::Entities;
use PVE::JSONSchema;

use base qw(PVE::RESTHandler);

# preload classes
use PVE::API2::Cluster;
use PVE::API2::Nodes;
use PVE::API2::Pool;
use PVE::API2::AccessControl;
use PVE::API2::Storage::Config;

__PACKAGE__->register_method ({
    subclass => "PVE::API2::Cluster",  
    path => 'cluster',
});

__PACKAGE__->register_method ({
    subclass => "PVE::API2::Nodes",  
    path => 'nodes',
});

__PACKAGE__->register_method ({
    subclass => "PVE::API2::Storage::Config",  
    path => 'storage',
});

__PACKAGE__->register_method ({
    subclass => "PVE::API2::AccessControl",  
    path => 'access',
});

__PACKAGE__->register_method ({
    subclass => "PVE::API2::Pool",  
    path => 'pools',
});

__PACKAGE__->register_method ({
    name => 'index', 
    path => '',
    method => 'GET',
    permissions => { user => 'all' },
    description => "Directory index.",
    parameters => {
	additionalProperties => 0,
	properties => {},
    },
    returns => {
	type => 'array',
	items => {
	    type => "object",
	    properties => {
		subdir => { type => 'string' },
	    },
	},
	links => [ { rel => 'child', href => "{subdir}" } ],
    },
    code => sub {
	my ($resp, $param) = @_;
    
	my $res = [ { subdir => 'version' } ];

	my $ma = PVE::API2->method_attributes();

	foreach my $info (@$ma) {
	    next if !$info->{subclass};

	    my $subpath = $info->{match_re}->[0];

	    push @$res, { subdir => $subpath };
	}

	return $res;
    }});

__PACKAGE__->register_method ({
    name => 'version', 
    path => 'version',
    method => 'GET',
    permissions => { user => 'all' },
    description => "API version details. The result also includes the global datacenter confguration.",
    parameters => {
	additionalProperties => 0,
	properties => {},
    },
    returns => {
	type => "object",
	properties => {
	    version => { type => 'string' },
	    release => { type => 'string' },
	    repoid => { type => 'string' },
	},
    },
    code => sub {
	my ($resp, $param) = @_;
    
	my $res = PVE::Cluster::cfs_read_file('datacenter.cfg');

	my $vi = PVE::pvecfg::version_info();
	foreach my $k (qw(version release repoid)) {
	    $res->{$k} = $vi->{$k};
	}

	return $res;
    }});

# register result formatters

my $prepare_response_data = sub {
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
	if (HTTP::Status::is_error($res->{status})) {
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
};

PVE::HTTPServer::register_formatter('json', sub {
    my ($res, $data, $param, $path, $auth) = @_;

    my $nocomp = 0;

    my $ct = 'application/json;charset=UTF-8';

    &$prepare_response_data('json', $res);

    my $raw = to_json($res->{data}, {utf8 => 1, allow_nonref => 1});
   
    return ($raw, $ct, $nocomp);			     
});


PVE::HTTPServer::register_formatter('extjs', sub {
    my ($res, $data, $param, $path, $auth) = @_;

    my $nocomp = 0;

    my $ct = 'application/json;charset=UTF-8';

    &$prepare_response_data('extjs', $res);

    my $raw = to_json($res->{data}, {utf8 => 1, allow_nonref => 1});
   
    return ($raw, $ct, $nocomp);			     
});

PVE::HTTPServer::register_formatter('htmljs', sub {
    my ($res, $data, $param, $path, $auth) = @_;
 
    my $nocomp = 0;

    # we use this for extjs file upload forms
    
    my $ct = 'text/html;charset=UTF-8';

    &$prepare_response_data('htmljs', $res);

    my $raw = encode_entities(to_json($res->{data}, {allow_nonref => 1}));
   
    return ($raw, $ct, $nocomp);
});


PVE::HTTPServer::register_formatter('spiceconfig', sub {
    my ($res, $data, $param, $path, $auth) = @_;

    my $nocomp = 0;

    my $ct = 'application/x-virt-viewer;charset=UTF-8';

    &$prepare_response_data('spiceconfig', $res);

    $data = $res->{data};

    my $raw;

    if ($data && ref($data) && ref($data->{data})) {
	$raw = "[virt-viewer]\n";
	while (my ($key, $value) = each %{$data->{data}}) {
	    $raw .= "$key=$value\n" if defined($value);
	}
    }
   
    return ($raw, $ct, $nocomp);
});

PVE::HTTPServer::register_formatter('png', sub {
    my ($res, $data, $param, $path, $auth) = @_;

    my $nocomp = 1;

    my $ct =  'image/png';

    &$prepare_response_data('png', $res);

    $data = $res->{data};

    # fixme: better to revove that whole png thing ?

    my $filename;
    my $raw = '';

    if ($data && ref($data) && ref($data->{data}) && 
	$data->{data}->{filename} && defined($data->{data}->{image})) {
	$filename = $data->{data}->{filename};
	$raw = $data->{data}->{image};
    }
   
    return ($raw, $ct, $nocomp);
});

PVE::HTTPServer::register_formatter('html', sub {
    my ($res, $data, $param, $path, $auth) = @_;

    my $nocomp = 0;

    my $ct = 'text/html;charset=UTF-8';

    &$prepare_response_data('html', $res);

    $data = $res->{data};

    my $info = $res->{info};

    my $raw = "<html><body>";
    if (!HTTP::Status::is_success($res->{status})) {
	my $msg = $res->{message} || '';
	$raw .= "<h1>ERROR $res->{status} $msg</h1>";
    }
    my $lnk = PVE::JSONSchema::method_get_child_link($info);

    if ($lnk && $data && $data->{data} && HTTP::Status::is_success($res->{status})) {

	my $href = $lnk->{href};
	if ($href =~ m/^\{(\S+)\}$/) {
	    my $prop = $1;
	    $path =~ s/\/+$//; # remove trailing slash
	    foreach my $elem (sort {$a->{$prop} cmp $b->{$prop}} @{$data->{data}}) {
		next if !ref($elem);
		
		if (defined(my $value = $elem->{$prop})) {
		    if ($value ne '') {
			if (scalar(keys %$elem) > 1) {
			    my $tv = to_json($elem, {allow_nonref => 1, canonical => 1});
			    $raw .= "<a href='$path/$value'>$value</a> <pre>$tv</pre><br>";
			} else {
			    $raw .= "<a href='$path/$value'>$value</a><br>";
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
  
    return ($raw, $ct, $nocomp);
});

1;
