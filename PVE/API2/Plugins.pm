package PVE::API2::Plugins;

use v5.36;

use PVE::RESTHandler;
use base qw(PVE::RESTHandler);

use PVE::API2::Plugins::Storage;

__PACKAGE__->register_method({
    subclass => "PVE::API2::Plugins::Storage",
    path => 'storage',
});

__PACKAGE__->register_method({
    name => 'index',
    path => '',
    method => 'GET',
    permissions => {
        user => 'all',
    },
    description => "Directory index.",
    parameters => {
        additionalProperties => 0,
        properties => {},
    },
    returns => {
        type => 'array',
        items => {
            type => 'object',
            properties => {
                subdir => {
                    type => 'string',
                },
            },
        },
        links => [
            {
                rel => 'child',
                href => "{subdir}",
            },
        ],
    },
    code => sub($param) {
        my $result = [];

        my $attrs = PVE::API2::Plugins->method_attributes();

        for my $info ($attrs->@*) {
            next if !$info->{subclass};

            my $subpath = $info->{match_re}->[0];

            push $result->@*, { subdir => $subpath };
        }

        return $result;
    },
});

1;
