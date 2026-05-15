package PVE::API2::Cluster::Qemu;

use v5.36;

use PVE::API2::Cluster::Qemu::CPUFlags;

use base qw(PVE::RESTHandler);

__PACKAGE__->register_method({
    subclass => "PVE::API2::Cluster::Qemu::CPUFlags",
    path => "cpu-flags",
});

__PACKAGE__->register_method({
    name => 'index',
    path => '',
    method => 'GET',
    description => "Cluster-wide QEMU index",
    permissions => { user => 'all' },
    parameters => {
        additionalProperties => 0,
        properties => {},
    },
    returns => {
        type => 'array',
        items => {
            type => "object",
            properties => {},
        },
        links => [{ rel => 'child', href => "{name}" }],
    },
    code => sub {
        my ($param) = @_;

        return [
            { name => 'cpu-flags' },
        ];
    },
});

1;
