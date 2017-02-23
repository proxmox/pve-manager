package PVE::Status::Plugin;

use strict;
use warnings;

use PVE::Tools;
use PVE::JSONSchema;
use PVE::Cluster;

use Data::Dumper;

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

    if ($line =~ m/^(\S+):\s*$/) {
	my $type = lc($1);
	my $errmsg = undef; # set if you want to skip whole section
	eval { PVE::JSONSchema::pve_verify_configid($type); };
	$errmsg = $@ if $@;
	my $config = {}; # to return additional attributes
	return ($type, $type, $errmsg, $config);
    }
    return undef;
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
