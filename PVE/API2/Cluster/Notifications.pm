package PVE::API2::Cluster::Notifications;

use warnings;
use strict;

use Storable qw(dclone);
use JSON;

use PVE::Tools qw(extract_param);
use PVE::JSONSchema qw(get_standard_option);
use PVE::RESTHandler;
use PVE::Notify;

use base qw(PVE::RESTHandler);

sub make_properties_optional {
    my ($properties) = @_;
    $properties = dclone($properties);

    for my $key (keys %$properties) {
	$properties->{$key}->{optional} = 1 if $key ne 'name';
    }

    return $properties;
}

sub raise_api_error {
    my ($api_error) = @_;

    if (!(ref($api_error) eq 'HASH' && $api_error->{message} && $api_error->{code})) {
	die $api_error;
    }

    my $msg = "$api_error->{message}\n";
    my $exc = PVE::Exception->new($msg, code => $api_error->{code});

    my (undef, $filename, $line) = caller;

    $exc->{filename} = $filename;
    $exc->{line} = $line;

    die $exc;
}

__PACKAGE__->register_method ({
    name => 'index',
    path => '',
    method => 'GET',
    description => 'Index for notification-related API endpoints.',
    permissions => { user => 'all' },
    parameters => {
	additionalProperties => 0,
	properties => {},
    },
    returns => {
	type => 'array',
	items => {
	    type => 'object',
	    properties => {},
	},
	links => [ { rel => 'child', href => '{name}' } ],
    },
    code => sub {
	my $result = [
	];

	return $result;
    }
});

1;
