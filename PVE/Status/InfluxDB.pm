package PVE::Status::InfluxDB;

use strict;
use warnings;

use POSIX qw(isnan isinf);
use Scalar::Util 'looks_like_number';
use IO::Socket::IP;

use PVE::SafeSyslog;

use PVE::Status::Plugin;

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
	mtu => { optional => 1 },
	disable => { optional => 1 },
   };
}

# Plugin implementation
sub update_node_status {
    my ($class, $txn, $node, $data, $ctime) = @_;

    $ctime *= 1000000000;

    build_influxdb_payload($class, $txn, $data, $ctime, "object=nodes,host=$node");
}

sub update_qemu_status {
    my ($class, $txn, $vmid, $data, $ctime, $nodename) = @_;

    $ctime *= 1000000000;

    my $object = "object=qemu,vmid=$vmid,nodename=$nodename";
    if($data->{name} && $data->{name} ne '') {
	$object .= ",host=$data->{name}";
    }
    $object =~ s/\s/\\ /g;

    build_influxdb_payload($class, $txn, $data, $ctime, $object);
}

sub update_lxc_status {
    my ($class, $txn, $vmid, $data, $ctime, $nodename) = @_;

    $ctime *= 1000000000;

    my $object = "object=lxc,vmid=$vmid,nodename=$nodename";
    if($data->{name} && $data->{name} ne '') {
	$object .= ",host=$data->{name}";
    }
    $object =~ s/\s/\\ /g;

    build_influxdb_payload($class, $txn, $data, $ctime, $object);
}

sub update_storage_status {
    my ($class, $txn, $nodename, $storeid, $data, $ctime) = @_;

    $ctime *= 1000000000;

    my $object = "object=storages,nodename=$nodename,host=$storeid";
    if($data->{type} && $data->{type} ne '') {
	$object .= ",type=$data->{type}";
    }
    $object =~ s/\s/\\ /g;

    build_influxdb_payload($class, $txn, $data, $ctime, $object);
}

sub _connect {
    my ($class, $cfg) = @_;

    my $host = $cfg->{server};
    my $port = $cfg->{port};

    my $socket = IO::Socket::IP->new(
        PeerAddr    => $host,
        PeerPort    => $port,
        Proto       => 'udp',
    ) || die "couldn't create influxdb socket [$host]:$port - $@\n";

    $socket->blocking(0);

    return $socket;
}

sub build_influxdb_payload {
    my ($class, $txn, $data, $ctime, $tags, $measurement, $instance) = @_;

    my @values = ();

    foreach my $key (sort keys %$data) {
	my $value = $data->{$key};
	next if !defined($value);

	if (!ref($value) && $value ne '') {
	    # value is scalar

	    if (defined(my $v = prepare_value($value))) {
		push @values, "$key=$v";
	    }
	} elsif (ref($value) eq 'HASH') {
	    # value is a hash

	    if (!defined($measurement)) {
		build_influxdb_payload($class, $txn, $value, $ctime, $tags, $key);
	    } elsif(!defined($instance)) {
		build_influxdb_payload($class, $txn, $value, $ctime, $tags, $measurement, $key);
	    } else {
		push @values, get_recursive_values($value);
	    }
	}
    }

    if (@values > 0) {
	my $mm = $measurement // 'system';
	my $tagstring = $tags;
	$tagstring .= ",instance=$instance" if defined($instance);
	my $valuestr = join(',', @values);
	$class->add_metric_data($txn, "$mm,$tagstring $valuestr $ctime\n");
    }
}

sub get_recursive_values {
    my ($hash) = @_;

    my @values = ();

    foreach my $key (keys %$hash) {
	my $value = $hash->{$key};
	if(ref($value) eq 'HASH') {
	    push(@values, get_recursive_values($value));
	} elsif (!ref($value) && $value ne '') {
	    if (defined(my $v = prepare_value($value))) {
		push @values, "$key=$v";
	    }
	}
    }

    return @values;
}

sub prepare_value {
    my ($value) = @_;

    if (looks_like_number($value)) {
	if (isnan($value) || isinf($value)) {
	    # we cannot send influxdb NaN or Inf
	    return undef;
	}

	# influxdb also accepts 1.0e+10, etc.
	return $value;
    }

    # if value is not just a number we
    # have to replace " with \"
    # and surround it with "
    $value =~ s/\"/\\\"/g;
    $value = "\"$value\"";

    return $value;
}

1;
