package PVE::Status::InfluxDB;

use strict;
use warnings;
use PVE::Status::Plugin;
use Data::Dumper;
use PVE::SafeSyslog;

# example config (/etc/pve/status.cfg)
#influxdb:
#	server test
#	port 8089
#	disable 0
#

use base('PVE::Status::Plugin');

sub type {
    return 'influxdb';
}

sub options {
    return {
	server => {},
	port => {},
	disable => { optional => 1 },
   };
}

# Plugin implementation
sub update_node_status {
    my ($class, $plugin_config, $node, $data, $ctime) = @_;

    $ctime *= 1000000000;

    write_influxdb_hash($plugin_config, $data, $ctime, "object=nodes,host=$node");

}

sub update_qemu_status {
    my ($class, $plugin_config, $vmid, $data, $ctime) = @_;

    $ctime *= 1000000000;

    my $object = "object=qemu,vmid=$vmid";
    if($data->{name} && $data->{name} ne '') {
	$object .= ",host=$data->{name}";
    }
    $object =~ s/\s/\\ /g;
    write_influxdb_hash($plugin_config, $data, $ctime, $object);
}

sub update_lxc_status {
    my ($class, $plugin_config, $vmid, $data, $ctime) = @_;

    $ctime *= 1000000000;

    my $object = "object=lxc,vmid=$vmid";
    if($data->{name} && $data->{name} ne '') {
	$object .= ",host=$data->{name}";
    }
    $object =~ s/\s/\\ /g;

    write_influxdb_hash($plugin_config, $data, $ctime, $object);
}

sub update_storage_status {
    my ($class, $plugin_config, $nodename, $storeid, $data, $ctime) = @_;

    $ctime *= 1000000000;

    my $object = "object=storages,nodename=$nodename,host=$storeid";
    if($data->{type} && $data->{type} ne '') {
	$object .= ",type=$data->{type}";
    }
    $object =~ s/\s/\\ /g;

    write_influxdb_hash($plugin_config, $data, $ctime, $object);
}

sub write_influxdb_hash {
    my ($plugin_config, $d, $ctime, $tags) = @_;

    my $payload = {};

    build_influxdb_payload($payload, $d, $ctime, $tags);

    my $host = $plugin_config->{server};
    my $port = $plugin_config->{port};

    my $socket = IO::Socket::IP->new(
        PeerAddr    => $host,
        PeerPort    => $port,
        Proto       => 'udp',
    );

    $socket->send($payload->{string});
    $socket->close() if $socket;

}

sub build_influxdb_payload {
    my ($payload, $d, $ctime, $tags, $keyprefix, $depth) = @_;

    $depth = 0 if !$depth;

    for my $key (keys %$d) {

        my $value = $d->{$key};
        my $oldtags = $tags;

        if ( defined $value ) {
            if ( ref $value eq 'HASH' ) {

		if($depth == 0) {
		    $keyprefix = $key;
		}elsif($depth == 1){
		    $tags .= ",instance=$key";
		}

		$depth++;
                build_influxdb_payload($payload, $value, $ctime, $tags, $keyprefix, $depth);
		$depth--;

            }elsif ($value =~ m/^\d+$/) {

		$keyprefix = "system" if !$keyprefix && $depth == 0;

                $payload->{string} .= $keyprefix."_"."$key,$tags value=$value $ctime\n";
            }
        }
        $tags = $oldtags;
    }
}

1;
