package PVE::API2::NodeConfig;

use strict;
use warnings;

use PVE::JSONSchema qw(get_standard_option);
use PVE::NodeConfig;
use PVE::Tools qw(extract_param);

use base qw(PVE::RESTHandler);

my $node_config_schema = PVE::NodeConfig::get_nodeconfig_schema();
my $node_config_properties = {
    delete => {
	type => 'string', format => 'pve-configid-list',
	description => "A list of settings you want to delete.",
	optional => 1,
    },
    digest => {
	type => 'string',
	description => 'Prevent changes if current configuration file has different SHA1 digest. This can be used to prevent concurrent modifications.',
	maxLength => 40,
	optional => 1,
    },
    node => get_standard_option('pve-node'),
};

foreach my $opt (keys %{$node_config_schema}) {
    $node_config_properties->{$opt} = $node_config_schema->{$opt};
}

__PACKAGE__->register_method({
    name => 'get_config',
    path => '',
    method => 'GET',
    description => "Get node configuration options.",
    permissions => {
	check => ['perm', '/', [ 'Sys.Audit' ]],
    },
    proxyto => 'node',
    parameters => {
	additionalProperties => 0,
	properties => {
	    node => get_standard_option('pve-node'),
	},
    },
    returns => {
	type => "object",
	properties => {},
    },
    code => sub {
	my ($param) = @_;

	return PVE::NodeConfig::load_config($param->{node});
    }});

__PACKAGE__->register_method({
    name => 'set_options',
    path => '',
    method => 'PUT',
    description => "Set node configuration options.",
    permissions => {
	check => ['perm', '/', [ 'Sys.Modify' ]],
    },
    protected => 1,
    proxyto => 'node',
    parameters => {
	additionalProperties => 0,
	properties => $node_config_properties,
    },
    returns => { type => "null" },
    code => sub {
	my ($param) = @_;

	my $delete = extract_param($param, 'delete');
	my $node = extract_param($param, 'node');
	my $digest = extract_param($param, 'digest');

	my $code = sub {
	    my $conf = PVE::NodeConfig::load_config($node);

	    PVE::Tools::assert_if_modified($digest, $conf->{digest});

	    foreach my $opt (keys %$param) {
		$conf->{$opt} = $param->{$opt};
	    }

	    foreach my $opt (PVE::Tools::split_list($delete)) {
		delete $conf->{$opt};
	    };

	    PVE::NodeConfig::write_config($node, $conf);
	};

	PVE::NodeConfig::lock_config($node, $code);
	die $@ if $@;

	return undef;
    }});

1;
