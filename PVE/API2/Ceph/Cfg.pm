package PVE::API2::Ceph::Cfg;

use strict;
use warnings;

use PVE::Ceph::Tools;
use PVE::JSONSchema qw(get_standard_option);
use PVE::RADOS;
use PVE::Tools qw(file_get_contents);

use base qw(PVE::RESTHandler);

__PACKAGE__->register_method ({
    name => 'index',
    path => '',
    method => 'GET',
    description => "Directory index.",
    permissions => { user => 'all' },
    parameters => {
	additionalProperties => 0,
	properties => {
	    node => get_standard_option('pve-node'),
	},
    },
    returns => {
	type => 'array',
	items => {
	    type => "object",
	    properties => {},
	},
	links => [ { rel => 'child', href => "{name}" } ],
    },
    code => sub {
	my ($param) = @_;

	my $result = [
	    { name => 'raw' },
	    { name => 'db' },
	];

	return $result;
    }});

__PACKAGE__->register_method ({
    name => 'raw',
    path => 'raw',
    method => 'GET',
    proxyto => 'node',
    permissions => {
	check => ['perm', '/', [ 'Sys.Audit', 'Datastore.Audit' ], any => 1],
    },
    description => "Get the Ceph configuration file.",
    parameters => {
	additionalProperties => 0,
	properties => {
	    node => get_standard_option('pve-node'),
	},
    },
    returns => { type => 'string' },
    code => sub {
	my ($param) = @_;

	PVE::Ceph::Tools::check_ceph_inited();

	my $path = PVE::Ceph::Tools::get_config('pve_ceph_cfgpath');
	return file_get_contents($path);

    }});

__PACKAGE__->register_method ({
    name => 'db',
    path => 'db',
    method => 'GET',
    proxyto => 'node',
    protected => 1,
    permissions => {
	check => ['perm', '/', [ 'Sys.Audit', 'Datastore.Audit' ], any => 1],
    },
    description => "Get the Ceph configuration database.",
    parameters => {
	additionalProperties => 0,
	properties => {
	    node => get_standard_option('pve-node'),
	},
    },
    returns => {
	type => 'array',
	items => {
	    type => 'object',
	    properties => {
		section => { type => "string", },
		name => { type => "string", },
		value => { type => "string", },
		level => { type => "string", },
		'can_update_at_runtime' => { type => "boolean", },
		mask => { type => "string" },
	    },
	},
    },
    code => sub {
	my ($param) = @_;

	PVE::Ceph::Tools::check_ceph_inited();

	my $rados = PVE::RADOS->new();
	my $res = $rados->mon_command( { prefix => 'config dump', format => 'json' });
	foreach my $entry (@$res) {
	    $entry->{can_update_at_runtime} = $entry->{can_update_at_runtime}? 1 : 0; # JSON::true/false -> 1/0
	}

	return $res;
    }});
