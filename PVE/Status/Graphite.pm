package PVE::Status::Graphite;

use strict;
use warnings;

use IO::Socket::IP;
use Socket qw(SOL_SOCKET SO_SNDTIMEO SO_RCVTIMEO);

use PVE::Status::Plugin;
use PVE::JSONSchema;

# example config (/etc/pve/status.cfg)
#graphite:
#	server test
#	port 2003
#	proto udp
#	path proxmox.mycluster
#	disable 0
#

use base('PVE::Status::Plugin');

sub type {
    return 'graphite';
}

sub properties {
    return {
	path => {
	    type => 'string', format => 'graphite-path',
	    description => "root graphite path (ex: proxmox.mycluster.mykey)",
	},
	timeout => {
	    type => 'integer',
	    description => "graphite tcp socket timeout (default=1)",
	    optional => 1
	},
	proto => {
	    type => 'string',
	    enum => ['udp', 'tcp'],
	    description => "send graphite data using tcp or udp (default)",
	    optional => 1,
	},
    };
}

sub options {
    return {
	server => {},
	port => { optional => 1 },
	proto => { optional => 1 },
	timeout => { optional => 1 },
	path => { optional => 1 },
	disable => { optional => 1 },
    };
}

# Plugin implementation
sub update_node_status {
    my ($class, $plugin_config, $node, $data, $ctime) = @_;

    write_graphite_hash($plugin_config, $data, $ctime, "nodes.$node");

}

sub update_qemu_status {
    my ($class, $plugin_config, $vmid, $data, $ctime, $nodename) = @_;
    write_graphite_hash($plugin_config, $data, $ctime, "qemu.$vmid");
}

sub update_lxc_status {
    my ($class, $plugin_config, $vmid, $data, $ctime, $nodename) = @_;

    write_graphite_hash($plugin_config, $data, $ctime, "lxc.$vmid");
}

sub update_storage_status {
    my ($class, $plugin_config, $nodename, $storeid, $data, $ctime) = @_;

    write_graphite_hash($plugin_config, $data, $ctime, "storages.$nodename.$storeid");
}

sub _connect {
    my ($class, $cfg) = @_;

    my $host    = $cfg->{server};
    my $port    = $cfg->{port} || 2003;
    my $proto   = $cfg->{proto} || 'udp';
    my $timeout = $cfg->{timeout} // 1;

    my $carbon_socket = IO::Socket::IP->new(
	PeerAddr    => $host,
	PeerPort    => $port,
	Proto       => $proto,
	Timeout     => $timeout,
    ) || die "couldn't create carbon socket [$host]:$port - $@\n";

    if ($proto eq 'tcp') {
	# seconds and µs
	my $timeout_struct = pack( 'l!l!', $timeout, 0);
	setsockopt($carbon_socket, SOL_SOCKET, SO_SNDTIMEO, $timeout_struct);
	setsockopt($carbon_socket, SOL_SOCKET, SO_RCVTIMEO, $timeout_struct);
    }

    return $carbon_socket;
}

sub write_graphite_hash {
    my ($plugin_config, $d, $ctime, $object) = @_;

    my $path = $plugin_config->{path} // 'proxmox';

    my $carbon_socket = __PACKAGE__->_connect($plugin_config);

    write_graphite($carbon_socket, $d, $ctime, $path.".$object");

    $carbon_socket->close() if $carbon_socket;

}

sub write_graphite {
    my ($carbon_socket, $d, $ctime, $path) = @_;

    # we do not want boolean/state information to export to graphite
    my $key_blacklist = {
	'template' => 1,
	'pid' => 1,
	'agent' => 1,
	'serial' => 1,
    };

    my $graphite_data = '';
    my $assemble_graphite_data;
    $assemble_graphite_data = sub {
	my ($metric, $path) = @_;

	for my $key (sort keys %$metric) {
	    my $value = $d->{$key} // next;

	    $key =~ s/\./-/g;
	    my $metricpath = $path . ".$key";

	    if (ref($value) eq 'HASH') {
		$assemble_graphite_data->($value, $metricpath);
	    } elsif ($value =~ m/^[+-]?[0-9]*\.?[0-9]+$/ && !$key_blacklist->{$key}) {
		$graphite_data .= "$metricpath $value $ctime\n";
	    }
	}
    };
    $assemble_graphite_data->($d, $path);

    $carbon_socket->send($graphite_data) if $graphite_data ne '';
}

PVE::JSONSchema::register_format('graphite-path', \&pve_verify_graphite_path);
sub pve_verify_graphite_path {
    my ($path, $noerr) = @_;

    my $regex = "([a-zA-Z0-9]([a-zA-Z0-9\-]*[a-zA-Z0-9])?)";

    if ($path !~ /^(${regex}\.)*${regex}$/) {
	return undef if $noerr;
	die "value does not look like a valid graphite path\n";
    }

    return $path;
}


1;
