package PVE::API2::Network;

use strict;
use warnings;

use Net::IP qw(:PROC);
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
    'active-backup', # OVS and Linux
    'balance-xor',
    'broadcast',
    '802.3ad',
    'balance-tlb',
    'balance-alb',
    'balance-slb', # OVS 
    'lacp-balance-slb', # OVS
    'lacp-balance-tcp', # OVS
    ];

my $network_type_enum = ['bridge', 'bond', 'eth', 'alias', 
			 'OVSBridge', 'OVSBond', 'OVSPort', 'OVSIntPort'];

my $confdesc = {
    type => {
	description => "Network interface type",
	type => 'string',
	enum => [@$network_type_enum, 'unknown'],
    },
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
    ovs_ports => {
	description => "Specify the iterfaces you want to add to your bridge.",
	optional => 1,
	type => 'string', format => 'pve-iface-list',
    },
    ovs_options => {
	description => "OVS interface options.",
	optional => 1,
	type => 'string',
	maxLength => 1024,
    },
    ovs_bridge => {
	description => "The OVS bridge associated with a OVS port. This is required when you create an OVS port.",
	optional => 1,
	type => 'string', format => 'pve-iface',
    },
    slaves => {
	description => "Specify the interfaces used by the bonding device.",
	optional => 1,
	type => 'string', format => 'pve-iface-list',
    },
    ovs_bonds => {
	description => "Specify the interfaces used by the bonding device.",
	optional => 1,
	type => 'string', format => 'pve-iface-list',
    },
    bond_mode => {
	description => "Bonding mode.",
	optional => 1,
	type => 'string', enum => $bond_mode_enum,
    },
    bond_xmit_hash_policy => {
	description => "Selects the transmit hash policy to use for slave selection in balance-xor and 802.3ad modes.",
	optional => 1,
	type => 'string', 
	enum => ['layer2', 'layer2+3', 'layer3+4' ],
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
	requires => 'address',
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
		enum => $network_type_enum,
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

	my $rpcenv = PVE::RPCEnvironment::get();

	my $tmp = PVE::INotify::read_file('interfaces', 1);
	my $config = $tmp->{data};
	my $changes = $tmp->{changes};

	$rpcenv->set_result_attrib('changes', $changes) if $changes;

	delete $config->{lo}; # do not list the loopback device

	if ($param->{type}) {
	    foreach my $k (keys %$config) {
		delete $config->{$k} if $param->{type} ne $config->{$k}->{type};
	    }
	}

	return PVE::RESTHandler::hash_to_array($config, 'iface');
   }});

__PACKAGE__->register_method({
    name => 'revert_network_changes', 
    path => '', 
    method => 'DELETE',
    permissions => {
	check => ['perm', '/nodes/{node}', [ 'Sys.Modify' ]],
    },
    protected => 1,
    description => "Revert network configuration changes.",
    proxyto => 'node',
    parameters => {
    	additionalProperties => 0,
	properties => {
	    node => get_standard_option('pve-node'),
	},
    },
    returns => { type => "null" },
    code => sub {
	my ($param) = @_;

	unlink "/etc/network/interfaces.new";

	return undef;
    }});

my $check_duplicate_gateway = sub {
    my ($config, $newiface) = @_;

    foreach my $iface (keys %$config) {
	raise_param_exc({ gateway => "Default gateway already exists on interface '$iface'." })
	    if ($newiface ne $iface) && $config->{$iface}->{gateway};
    }
};

my $check_ipv4_settings = sub {
    my ($address, $netmask) = @_;

    my $binip = Net::IP::ip_iptobin($address, 4);
    my $binmask = Net::IP::ip_iptobin($netmask, 4);
    my $broadcast = Net::IP::ip_iptobin('255.255.255.255', 4);
    my $binhost = $binip | $binmask;

    raise_param_exc({ address => "$address is not a valid host ip address." })
        if ($binhost eq $binmask) || ($binhost eq $broadcast);
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

	    &$check_ipv4_settings($param->{address}, $param->{netmask})
		if $param->{address};

	    $param->{method} = $param->{address} ? 'static' : 'manual'; 

	    if ($param->{type} =~ m/^OVS/) {
		-x '/usr/bin/ovs-vsctl' ||
		    die "Open VSwitch is not installed (need package 'openvswitch-switch')\n";
	    }

	    if ($param->{type} eq 'OVSIntPort' || $param->{type} eq 'OVSBond') {
		my $brname = $param->{ovs_bridge};
		raise_param_exc({ ovs_bridge => "parameter is required" }) if !$brname;
		my $br = $config->{$brname};
		raise_param_exc({ ovs_bridge => "bridge '$brname' does not exist" }) if !$br;
		raise_param_exc({ ovs_bridge => "interface '$brname' is no OVS bridge" }) 
		    if $br->{type} ne 'OVSBridge';

		my @ports = split (/\s+/, $br->{ovs_ports} || '');
		$br->{ovs_ports} = join(' ', @ports, $iface)
		    if ! grep { $_ eq $iface } @ports;
	    }

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

	    &$check_ipv4_settings($param->{address}, $param->{netmask}) 
		if $param->{address};

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

	    my $d = $config->{$param->{iface}};
	    if ($d->{type} eq 'OVSIntPort' || $d->{type} eq 'OVSBond') {
		if (my $brname = $d->{ovs_bridge}) {
		    if (my $br = $config->{$brname}) {
			if ($br->{ovs_ports}) {
			    my @ports = split (/\s+/, $br->{ovs_ports});
			    my @new = grep { $_ ne $param->{iface} } @ports;
			    $br->{ovs_ports} = join(' ', @new);
			}
		    }
		}
	    }

	    delete $config->{$param->{iface}};

	    PVE::INotify::write_file('interfaces', $config);
	};

	PVE::Tools::lock_file($iflockfn, 10, $code);
	die $@ if $@;

	return undef;
    }});
