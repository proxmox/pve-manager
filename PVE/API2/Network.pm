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

my $network_type_enum = ['bridge', 'bond', 'eth', 'alias', 'vlan',
			 'OVSBridge', 'OVSBond', 'OVSPort', 'OVSIntPort'];

my $confdesc = {
    type => {
	description => "Network interface type",
	type => 'string',
	enum => [@$network_type_enum, 'unknown'],
    },
    comments => {
	description => "Comments",
	type => 'string',
	optional => 1,
    },
    comments6 => {
	description => "Comments",
	type => 'string',
	optional => 1,
    },
    autostart => {
	description => "Automatically start interface on boot.",
	type => 'boolean',
	optional => 1,
    },
    bridge_vlan_aware => {
	description => "Enable bridge vlan support.",
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
    ovs_tag => {
	description => "Specify a VLan tag (used by OVSPort, OVSIntPort, OVSBond)",
	optional => 1,
	type => 'integer',
	minimum => 1,
	maximum => 4094,
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
    },
    gateway6 => {
	description => 'Default ipv6 gateway address.',
	type => 'string', format => 'ipv6',
	optional => 1,
    },
    netmask6 => {
	description => 'Network mask.',
	type => 'integer', minimum => 0, maximum => 128,
	optional => 1,
	requires => 'address6',
    },
    address6 => {
	description => 'IP address.',
	type => 'string', format => 'ipv6',
	optional => 1,
	requires => 'netmask6',
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
		enum => [ @$network_type_enum, 'any_bridge' ],
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

	my $ifaces = $config->{ifaces};

	delete $ifaces->{lo}; # do not list the loopback device

	if ($param->{type}) {
	    foreach my $k (keys %$ifaces) {
		my $type = $ifaces->{$k}->{type};
		my $match =  ($param->{type} eq $type) || (
		    ($param->{type} eq 'any_bridge') && 
		    ($type eq 'bridge' || $type eq 'OVSBridge'));
		delete $ifaces->{$k} if !$match;
	    }
	}

	return PVE::RESTHandler::hash_to_array($ifaces, 'iface');
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

my $check_duplicate = sub {
    my ($config, $newiface, $key, $name) = @_;

    foreach my $iface (keys %$config) {
	raise_param_exc({ $key => "$name already exists on interface '$iface'." })
	    if ($newiface ne $iface) && $config->{$iface}->{$key};
    }
};

my $check_duplicate_gateway = sub {
    my ($config, $newiface) = @_;
    return &$check_duplicate($config, $newiface, 'gateway', 'Default gateway');
};

my $check_duplicate_gateway6 = sub {
    my ($config, $newiface) = @_;
    return &$check_duplicate($config, $newiface, 'gateway6', 'Default ipv6 gateway');
};

sub ipv6_tobin {
    return Net::IP::ip_iptobin(Net::IP::ip_expand_address(shift, 6), 6);
}

my $check_ipv6_settings = sub {
    my ($address, $netmask) = @_;

    raise_param_exc({ netmask => "$netmask is not a valid subnet length for ipv6" })
	if $netmask < 0 || $netmask > 128;

    raise_param_exc({ address => "$address is not a valid host ip address." })
	if !Net::IP::ip_is_ipv6($address);

    my $binip = ipv6_tobin($address);
    my $binmask = Net::IP::ip_get_mask($netmask, 6);

    my $type = Net::IP::ip_iptypev6($binip);

    raise_param_exc({ address => "$address is not a valid host ip address." })
	if ($binip eq $binmask) ||
	   (defined($type) && $type !~ /^(?:(?:GLOBAL|(?:UNIQUE|LINK)-LOCAL)-UNICAST)$/);
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
	    my $ifaces = $config->{ifaces};

	    raise_param_exc({ iface => "interface already exists" })
		if $ifaces->{$iface};

	    &$check_duplicate_gateway($ifaces, $iface)
		if $param->{gateway};
	    &$check_duplicate_gateway6($ifaces, $iface)
		if $param->{gateway6};

	    &$check_ipv6_settings($param->{address6}, int($param->{netmask6}))
		if $param->{address6};

	    my $families = $param->{families} = [];
	    push @$families, 'inet'
		if $param->{address} && !grep(/^inet$/, @$families);
	    push @$families, 'inet6'
		if $param->{address6} && !grep(/^inet6$/, @$families);
	    @$families = ('inet') if !scalar(@$families);

	    $param->{method} = $param->{address} ? 'static' : 'manual'; 
	    $param->{method6} = $param->{address6} ? 'static' : 'manual'; 

	    if ($param->{type} =~ m/^OVS/) {
		-x '/usr/bin/ovs-vsctl' ||
		    die "Open VSwitch is not installed (need package 'openvswitch-switch')\n";
	    }

	    if ($param->{type} eq 'OVSIntPort' || $param->{type} eq 'OVSBond') {
		my $brname = $param->{ovs_bridge};
		raise_param_exc({ ovs_bridge => "parameter is required" }) if !$brname;
		my $br = $ifaces->{$brname};
		raise_param_exc({ ovs_bridge => "bridge '$brname' does not exist" }) if !$br;
		raise_param_exc({ ovs_bridge => "interface '$brname' is no OVS bridge" }) 
		    if $br->{type} ne 'OVSBridge';

		my @ports = split (/\s+/, $br->{ovs_ports} || '');
		$br->{ovs_ports} = join(' ', @ports, $iface)
		    if ! grep { $_ eq $iface } @ports;
	    }

	    $ifaces->{$iface} = $param;

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
	    my $ifaces = $config->{ifaces};

	    raise_param_exc({ iface => "interface does not exist" })
		if !$ifaces->{$iface};

	    my $families = ($param->{families} ||= []);
	    foreach my $k (PVE::Tools::split_list($delete)) {
		delete $ifaces->{$iface}->{$k};
		@$families = grep(!/^inet$/, @$families) if $k eq 'address';
		@$families = grep(!/^inet6$/, @$families) if $k eq 'address6';
	    }

	    &$check_duplicate_gateway($ifaces, $iface)
		if $param->{gateway};
	    &$check_duplicate_gateway6($ifaces, $iface)
		if $param->{gateway6};

	    if ($param->{address}) {
		push @$families, 'inet' if !grep(/^inet$/, @$families);
	    } else {
		@$families = grep(!/^inet$/, @$families);
	    }
	    if ($param->{address6}) {
		&$check_ipv6_settings($param->{address6}, int($param->{netmask6}));
		push @$families, 'inet6' if !grep(/^inet6$/, @$families);
	    } else {
		@$families = grep(!/^inet6$/, @$families);
	    }
	    @$families = ('inet') if !scalar(@$families);

	    $param->{method} = $param->{address} ? 'static' : 'manual'; 
	    $param->{method6} = $param->{address6} ? 'static' : 'manual'; 

	    foreach my $k (keys %$param) {
		$ifaces->{$iface}->{$k} = $param->{$k};
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
	my $ifaces = $config->{ifaces};

	raise_param_exc({ iface => "interface does not exist" })
	    if !$ifaces->{$param->{iface}};

	return $ifaces->{$param->{iface}};
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
	    my $ifaces = $config->{ifaces};

	    raise_param_exc({ iface => "interface does not exist" })
		if !$ifaces->{$param->{iface}};

	    my $d = $ifaces->{$param->{iface}};
	    if ($d->{type} eq 'OVSIntPort' || $d->{type} eq 'OVSBond') {
		if (my $brname = $d->{ovs_bridge}) {
		    if (my $br = $ifaces->{$brname}) {
			if ($br->{ovs_ports}) {
			    my @ports = split (/\s+/, $br->{ovs_ports});
			    my @new = grep { $_ ne $param->{iface} } @ports;
			    $br->{ovs_ports} = join(' ', @new);
			}
		    }
		}
	    }

	    delete $ifaces->{$param->{iface}};

	    PVE::INotify::write_file('interfaces', $config);
	};

	PVE::Tools::lock_file($iflockfn, 10, $code);
	die $@ if $@;

	return undef;
    }});
