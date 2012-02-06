package PVE::API2::Network;

use strict;
use warnings;

use PVE::Tools qw(extract_param);
use PVE::SafeSyslog;
use PVE::INotify;
use PVE::Exception qw(raise_param_exc);
use PVE::RESTHandler;
use PVE::RPCEnvironment;
use PVE::JSONSchema qw(get_standard_option);
use PVE::AccessControl;
use IO::File;

use base qw(PVE::RESTHandler);

my $iflockfn = "/etc/network/.pve-interfaces.lock";

my $bond_mode_enum = [
    'balance-rr',
    'active-backup',
    'balance-xor',
    'broadcast',
    '802.3ad',
    'balance-tlb',
    'balance-alb'
    ];

my $confdesc = {
    autostart => {
	description => "Automatically start interface on boot.",
	type => 'boolean',
	optional => 1,
    },
    bridge_ports => {
	description => "Specify the iterfaces you want to add to your bridge.",
	optional => 1,
	type => 'string', format => 'pve-iface-list',
    },
    slaves => {
	description => "Specify the interfaces used by the bonding device.",
	optional => 1,
	type => 'string', format => 'pve-iface-list',
    },
    bond_mode => {
	description => "Bonding mode.",
	optional => 1,
	type => 'string', enum => $bond_mode_enum,
    },
    gateway => {
	description => 'Default gateway address.',
	type => 'string', format => 'ipv4',
	optional => 1,
    },
    netmask => {
	description => 'Network mask.',
	type => 'string', format => 'ipv4mask',
	optional => 1,
    },
    address => {
	description => 'IP address.',
	type => 'string', format => 'ipv4',
	optional => 1,
	requires => 'netmask',
    }
};

sub json_config_properties {
    my $prop = shift;

    foreach my $opt (keys %$confdesc) {
	$prop->{$opt} = $confdesc->{$opt};
    }

    return $prop;
}

__PACKAGE__->register_method({
    name => 'index', 
    path => '', 
    method => 'GET',
    permissions => { user => 'all' },
    description => "List available networks",
    proxyto => 'node',
    parameters => {
    	additionalProperties => 0,
	properties => {
	    node => get_standard_option('pve-node'),
	    type => {
		description => "Only list specific interface types.",
		type => 'string',
		enum => ['bond', 'bridge', 'alias', 'eth'],
		optional => 1,
	    },
	},
    },
    returns => {
	type => "array",
	items => {
	    type => "object",
	    properties => {},
	},
	links => [ { rel => 'child', href => "{iface}" } ],
    },
    code => sub {
	my ($param) = @_;

	my $config = PVE::INotify::read_file('interfaces');

	delete $config->{lo}; # do not list the loopback device

	if ($param->{type}) {
	    foreach my $k (keys %$config) {
		delete $config->{$k} if $param->{type} ne $config->{$k}->{type};
	    }
	}

	return PVE::RESTHandler::hash_to_array($config, 'iface');
   }});


my $check_duplicate_gateway = sub {
    my ($config, $newiface) = @_;

    foreach my $iface (keys %$config) {
	raise_param_exc({ gateway => "Default gateway already exists on interface '$iface'." })
	    if ($newiface ne $iface) && $config->{$iface}->{gateway};
    }
};


__PACKAGE__->register_method({
    name => 'create_network', 
    path => '', 
    method => 'POST',
    permissions => {
	check => ['perm', '/nodes/{node}', [ 'Sys.Modify' ]],
    },
    description => "Create network device configuration",
    protected => 1,
    proxyto => 'node',
    parameters => {
    	additionalProperties => 0,
	properties => json_config_properties({
	    node => get_standard_option('pve-node'),
	    iface => get_standard_option('pve-iface')}),
    },
    returns => { type => 'null' },
    code => sub {
	my ($param) = @_;

	my $node = extract_param($param, 'node');
	my $iface = extract_param($param, 'iface');

	my $code = sub {
	    my $config = PVE::INotify::read_file('interfaces');

	    raise_param_exc({ iface => "interface already exists" })
		if $config->{$iface};

	    &$check_duplicate_gateway($config, $iface)
		if $param->{gateway};

	    $param->{method} = $param->{address} ? 'static' : 'manual'; 

	    $config->{$iface} = $param;

	    PVE::INotify::write_file('interfaces', $config);
	};

	PVE::Tools::lock_file($iflockfn, 10, $code);
	die $@ if $@;

	return undef;
    }});

__PACKAGE__->register_method({
    name => 'update_network', 
    path => '{iface}', 
    method => 'PUT',
    permissions => {
	check => ['perm', '/nodes/{node}', [ 'Sys.Modify' ]],
    },
    description => "Update network device configuration",
    protected => 1,
    proxyto => 'node',
    parameters => {
    	additionalProperties => 0,
	properties => json_config_properties({
	    node => get_standard_option('pve-node'),
	    iface => get_standard_option('pve-iface'),
	    delete => {
		type => 'string', format => 'pve-configid-list',
		description => "A list of settings you want to delete.",
		optional => 1,
	    }}),
    },
    returns => { type => 'null' },
    code => sub {
	my ($param) = @_;

	my $node = extract_param($param, 'node');
	my $iface = extract_param($param, 'iface');
	my $delete = extract_param($param, 'delete');

	my $code = sub {
	    my $config = PVE::INotify::read_file('interfaces');

	    raise_param_exc({ iface => "interface does not exist" })
		if !$config->{$iface};

	    foreach my $k (PVE::Tools::split_list($delete)) {
		delete $config->{$iface}->{$k};
	    }

	    &$check_duplicate_gateway($config, $iface)
		if $param->{gateway};

	    $param->{method} = $param->{address} ? 'static' : 'manual'; 

	    foreach my $k (keys %$param) {
		$config->{$iface}->{$k} = $param->{$k};
	    }
	    
	    PVE::INotify::write_file('interfaces', $config);
	};

	PVE::Tools::lock_file($iflockfn, 10, $code);
	die $@ if $@;

	return undef;
    }});

__PACKAGE__->register_method({
    name => 'network_config', 
    path => '{iface}', 
    method => 'GET',
    permissions => {
	check => ['perm', '/nodes/{node}', [ 'Sys.Audit' ]],
    },
    description => "Read network device configuration",
    proxyto => 'node',
    parameters => {
    	additionalProperties => 0,
	properties => {
	    node => get_standard_option('pve-node'),
	    iface => get_standard_option('pve-iface'),
	},
    },
    returns => {
	type => "object",
	properties => {
	    type => { 
		type => 'string', 
	    },
	    method => {
		type => 'string', 
	    },
	},
    },
    code => sub {
	my ($param) = @_;

	my $config = PVE::INotify::read_file('interfaces');

	raise_param_exc({ iface => "interface does not exist" })
	    if !$config->{$param->{iface}};

	return $config->{$param->{iface}};
   }});

__PACKAGE__->register_method({
    name => 'delete_network', 
    path => '{iface}', 
    method => 'DELETE',
    permissions => {
	check => ['perm', '/nodes/{node}', [ 'Sys.Modify' ]],
    },
    description => "Delete network device configuration",
    protected => 1,
    proxyto => 'node',
    parameters => {
    	additionalProperties => 0,
	properties => {
	    node => get_standard_option('pve-node'),
	    iface => get_standard_option('pve-iface'),
	},
    },
    returns => { type => 'null' },
    code => sub {
	my ($param) = @_;

	my $code = sub {
	    my $config = PVE::INotify::read_file('interfaces');

	    raise_param_exc({ iface => "interface does not exist" })
		if !$config->{$param->{iface}};

	    delete $config->{$param->{iface}};

	    PVE::INotify::write_file('interfaces', $config);
	};

	PVE::Tools::lock_file($iflockfn, 10, $code);
	die $@ if $@;

	return undef;
    }});
