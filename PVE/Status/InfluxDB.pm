package PVE::Status::InfluxDB;

use strict;
use warnings;

use POSIX qw(isnan isinf);
use Scalar::Util 'looks_like_number';
use IO::Socket::IP;
use LWP::UserAgent;
use HTTP::Request;

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

sub properties {
    return {
	organization => {
	    description => "The influxdb organization. Only necessary when using the http v2 api. ".
			   "Has no meaning when using v2 compatibility api.",
	    type => 'string',
	    optional => 1,
	},
	bucket => {
	    description => "The influxdb bucket/db. Only necessary when using the http v2 api.",
	    type => 'string',
	    optional => 1,
	},
	token => {
	    description => "The influxdb access token. Only necessary when using the http v2 api. ".
			   "If the v2 compatibility api is used, use 'user:password' instead.",
	    type => 'string',
	    optional => 1,
	},
	influxdbproto => {
	    type => 'string',
	    enum => ['udp', 'http', 'https'],
	    default => 'udp',
	    optional => 1,
	},
	'max-body-size' => {
	    description => "Influxdb max-body-size. Requests are batched up to this size.",
	    type => 'integer',
	    minimum => 1,
	    default => 25_000_000,
	}
    };
}
sub options {
    return {
	server => {},
	port => {},
	mtu => { optional => 1 },
	disable => { optional => 1 },
	organization => { optional => 1},
	bucket => { optional => 1},
	token => { optional => 1},
	influxdbproto => { optional => 1},
	timeout => { optional => 1},
	'max-body-size' => { optional => 1 },
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

sub _send_batch_size {
    my ($class, $cfg) = @_;
    my $proto = $cfg->{influxdbproto} // 'udp';
    if ($proto ne 'udp') {
	return $cfg->{'max-body-size'} // 25_000_000;
    }

    return $class->SUPER::_send_batch_size($cfg);
}

sub send {
    my ($class, $connection, $data, $cfg) = @_;

    my $proto = $cfg->{influxdbproto} // 'udp';
    if ($proto eq 'udp') {
	return $class->SUPER::send($connection, $data, $cfg);
    } elsif ($proto =~ m/^https?$/) {
	my $ua = LWP::UserAgent->new();
	$ua->timeout($cfg->{timeout} // 1);
	$connection->content($data);
	my $response = $ua->request($connection);

	if (!$response->is_success) {
	    my $err = $response->status_line;
	    die "$err\n";
	}
    } else {
	die "invalid protocol\n";
    }

    return;
}

sub _disconnect {
    my ($class, $connection, $cfg) = @_;
    my $proto = $cfg->{influxdbproto} // 'udp';
    if ($proto eq 'udp') {
	return $class->SUPER::_disconnect($connection, $cfg);
    }

    return;
}

sub _connect {
    my ($class, $cfg, $id) = @_;

    my $host = $cfg->{server};
    my $port = $cfg->{port};
    my $proto = $cfg->{influxdbproto} // 'udp';

    if ($proto eq 'udp') {
	my $socket = IO::Socket::IP->new(
	    PeerAddr    => $host,
	    PeerPort    => $port,
	    Proto       => 'udp',
	) || die "couldn't create influxdb socket [$host]:$port - $@\n";

	$socket->blocking(0);

	return $socket;
    } elsif ($proto =~ m/^https?$/) {
	my $token = get_credentials($id);
	my $org = $cfg->{organization} // 'proxmox';
	my $bucket = $cfg->{bucket} // 'proxmox';
	my $url = "${proto}://${host}:${port}/api/v2/write?org=${org}&bucket=${bucket}";

	my $req = HTTP::Request->new(POST => $url);
	if (defined($token)) {
	    $req->header( "Authorization", "Token $token");
	}

	return $req;
    }

    die "cannot connect to influxdb: invalid protocol\n";
}

sub test_connection {
    my ($class, $cfg, $id) = @_;

    my $proto = $cfg->{influxdbproto} // 'udp';
    if ($proto eq 'udp') {
	return $class->SUPER::test_connection($cfg, $id);
    } elsif ($proto =~ m/^https?$/) {
	my $host = $cfg->{server};
	my $port = $cfg->{port};
	my $url = "${proto}://${host}:${port}/health";
	my $ua = LWP::UserAgent->new();
	$ua->timeout($cfg->{timeout} // 1);
	my $response = $ua->get($url);

	if (!$response->is_success) {
	    my $err = $response->status_line;
	    die "$err\n";
	}
    } else {
	die "invalid protocol\n";
    }

    return;
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

    # non-numeric values require to be quoted, so escape " with \"
    $value =~ s/\"/\\\"/g;
    $value = "\"$value\"";

    return $value;
}

my $priv_dir = "/etc/pve/priv/metricserver";

sub cred_file_name {
    my ($id) = @_;
    return "${priv_dir}/${id}.pw";
}

sub delete_credentials {
    my ($id) = @_;

    if (my $cred_file = cred_file_name($id)) {
	unlink($cred_file)
	    or warn "removing influxdb credentials file '$cred_file' failed: $!\n";
    }

    return;
}

sub set_credentials {
    my ($id, $token) = @_;

    my $cred_file = cred_file_name($id);

    mkdir $priv_dir;

    PVE::Tools::file_set_contents($cred_file, "$token");
}

sub get_credentials {
    my ($id) = @_;

    my $cred_file = cred_file_name($id);

    return PVE::Tools::file_get_contents($cred_file);
}

sub on_add_hook {
    my ($class, $id, $opts, $sensitive_opts) = @_;

    my $token = $sensitive_opts->{token};

    if (defined($token)) {
	set_credentials($id, $token);
    } else {
	delete_credenetials($id);
    }

    return undef;
}

sub on_update_hook {
    my ($class, $id, $opts, $sensitive_opts) = @_;
    return if !exists($sensitive_opts->{token});

    my $token = $sensitive_opts->{token};
    if (defined($token)) {
	set_credentials($id, $token);
    } else {
	delete_credenetials($id);
    }

    return undef;
}

sub on_delete_hook {
    my ($class, $id, $opts) = @_;

    delete_credentials($id);

    return undef;
}


1;
