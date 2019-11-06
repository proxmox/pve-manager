package PVE::Status::Graphite;

use strict;
use warnings;

use PVE::Status::Plugin;
use IO::Socket::Timeout;

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
	    description => "graphite tcp socket timeout (default=3)",
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

# we do not want boolean/state information to export to graphite
my $key_blacklist = {
    'template' => 1,
    'pid' => 1,
    'agent' => 1,
    'serial' => 1,
};

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

sub write_graphite_hash {
    my ($plugin_config, $d, $ctime, $object) = @_;

    my $host = $plugin_config->{server};
    my $port = $plugin_config->{port} || 2003;
    my $path = $plugin_config->{path} // 'proxmox';
    my $proto = $plugin_config->{proto} || 'udp';
    my $timeout = $plugin_config->{timeout} // 3;

    my $carbon_socket = IO::Socket::IP->new(
	PeerAddr    => $host,
	PeerPort    => $port,
	Proto       => $proto,
	Timeout     => $timeout,
    ) || die "couldn't create carbon socket [$host]:$port - $@\n";

    if ( $proto eq 'tcp' ) {
	IO::Socket::Timeout->enable_timeouts_on($carbon_socket);
	$carbon_socket->read_timeout($timeout);
	$carbon_socket->write_timeout($timeout);
    }
    write_graphite($carbon_socket, $d, $ctime, $path.".$object");

    $carbon_socket->close() if $carbon_socket;

}

sub write_graphite {
    my ($carbon_socket, $d, $ctime, $path) = @_;

    for my $key (keys %$d) {

	my $value = $d->{$key};
	my $oldpath = $path;
	$key =~ s/\./-/g;
	$path .= ".$key";

	if ( defined $value ) {
	    if ( ref $value eq 'HASH' ) {
		write_graphite($carbon_socket, $value, $ctime, $path);
	    } elsif ($value =~ m/^[+-]?[0-9]*\.?[0-9]+$/ &&
		!$key_blacklist->{$key}) {
		$carbon_socket->send( "$path $value $ctime\n" );
	    } else {
		# do not send blacklisted or non-numeric values
	    }
	}
	$path = $oldpath;
    }
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
