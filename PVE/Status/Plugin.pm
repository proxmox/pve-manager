package PVE::Status::Plugin;

use strict;
use warnings;

use PVE::JSONSchema;
use PVE::Cluster;
use PVE::SectionConfig;

use base qw(PVE::SectionConfig);

PVE::Cluster::cfs_register_file('status.cfg',
				 sub { __PACKAGE__->parse_config(@_); },
				 sub { __PACKAGE__->write_config(@_); });

my $defaultData = {
    propertyList => {
	type => { 
	    description => "Plugin type.",
	    type => 'string', format => 'pve-configid',
	},
	disable => {
	    description => "Flag to disable the plugin.",
	    type => 'boolean',
	    optional => 1,
	},
	server => {
	    type => 'string', format => 'address',
	    description => "server dns name or IP address",
	},
	port => {
	    type => 'integer',
	    description => "server network port",
	},
    },
};

sub private {
    return $defaultData;
}

sub parse_section_header {
    my ($class, $line) = @_;

    if ($line =~ m/^(\S+):\s*(\S+)?\s*$/) {
	my $type = lc($1);
	my $id = $2 // $type;
	my $errmsg = undef; # set if you want to skip whole section
	eval { PVE::JSONSchema::pve_verify_configid($id) };
	$errmsg = $@ if $@;
	my $config = {}; # to return additional attributes
	return ($type, $id, $errmsg, $config);
    }
    return undef;
}

sub foreach_plug($&) {
    my ($status_cfg, $code) = @_;

    for my $plugin_config (values %{$status_cfg->{ids}}) {
	next if $plugin_config->{disable};
	my $plugin = __PACKAGE__->lookup($plugin_config->{type});
	$code->($plugin, $plugin_config);
    }
}

sub update_all($$@) {
    my ($cfg, $subsystem, @params) = @_;

    my $method = "update_${subsystem}_status";

    foreach_plug($cfg, sub {
	my ($plugin, $plugin_config) = @_;
	$plugin->$method($plugin_config, @params);
    });
}

sub _connect {
    my ($class, $cfg) = @_;

    die "please implement inside plugin";
}

sub update_node_status {
    my ($class, $plugin_config, $node, $data, $ctime) = @_;

    die "please implement inside plugin";
}

sub update_qemu_status {
    my ($class, $plugin_config, $vmid, $data, $ctime, $nodename) = @_;

    die "please implement inside plugin";
}

sub update_lxc_status {
    my ($class, $plugin_config, $vmid, $data, $ctime, $nodename) = @_;

    die "please implement inside plugin";
}

sub update_storage_status {
    my ($class, $plugin_config, $nodename, $storeid, $data, $ctime) = @_;

    die "please implement inside plugin";
}

1;
