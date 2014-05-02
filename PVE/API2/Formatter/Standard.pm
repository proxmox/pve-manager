package PVE::API2::Formatter::Standard;

use strict;
use warnings;

use PVE::HTTPServer;
use HTTP::Status;
use JSON;
use HTML::Entities;
use PVE::JSONSchema;

# register result formatters

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
}

PVE::HTTPServer::register_formatter('json', sub {
    my ($res, $data, $param, $path, $auth) = @_;

    my $nocomp = 0;

    my $ct = 'application/json;charset=UTF-8';

    prepare_response_data('json', $res);

    my $raw = to_json($res->{data}, {utf8 => 1, allow_nonref => 1});
   
    return ($raw, $ct, $nocomp);			     
});


PVE::HTTPServer::register_formatter('extjs', sub {
    my ($res, $data, $param, $path, $auth) = @_;

    my $nocomp = 0;

    my $ct = 'application/json;charset=UTF-8';

    prepare_response_data('extjs', $res);

    my $raw = to_json($res->{data}, {utf8 => 1, allow_nonref => 1});
   
    return ($raw, $ct, $nocomp);			     
});

PVE::HTTPServer::register_formatter('htmljs', sub {
    my ($res, $data, $param, $path, $auth) = @_;
 
    my $nocomp = 0;

    # we use this for extjs file upload forms
    
    my $ct = 'text/html;charset=UTF-8';

    prepare_response_data('htmljs', $res);

    my $raw = encode_entities(to_json($res->{data}, {allow_nonref => 1}));
   
    return ($raw, $ct, $nocomp);
});


PVE::HTTPServer::register_formatter('spiceconfig', sub {
    my ($res, $data, $param, $path, $auth) = @_;

    my $nocomp = 0;

    my $ct = 'application/x-virt-viewer;charset=UTF-8';

    prepare_response_data('spiceconfig', $res);

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

    prepare_response_data('png', $res);

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

