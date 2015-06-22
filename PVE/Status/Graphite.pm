package PVE::Status::Graphite;

use strict;
use warnings;
use PVE::Status::Plugin;

# example config (/etc/pve/status.cfg)
#graphite:
#	graphiteserver test
#	disable 0
#

use base('PVE::Status::Plugin');

sub type {
    return 'graphite';
}

sub properties {
    return {
	graphiteserver => {
            type => 'string',
	    description => "External graphite statistic server",
	},
    };
}

sub options {
    return {
	graphiteserver => {},
	disable => { optional => 1 },
   };
}

# Plugin implementation
sub update_node_status {
    my ($plugin_config, $node, $data) = @_;

    # implement me
}

sub update_qemu_status {
    my ($plugin_config, $vmid, $data) = @_;

    # implement me
}

sub update_lxc_status {
    my ($plugin_config, $vmid, $data) = @_;

    # implement me
}

sub update_storage_status {
    my ($plugin_config, $storeid, $data) = @_;

    # implement me
}

1;
