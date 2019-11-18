package PVE::ExtMetric;

use strict;
use warnings;

use PVE::Status::Plugin;
use PVE::Status::Graphite;
use PVE::Status::InfluxDB;

PVE::Status::Graphite->register();
PVE::Status::InfluxDB->register();
PVE::Status::Plugin->init();

sub foreach_plug($&) {
    my ($status_cfg, $code) = @_;

    for my $id (sort keys %{$status_cfg->{ids}}) {
	my $plugin_config = $status_cfg->{ids}->{$id};
	next if $plugin_config->{disable};

	my $plugin = PVE::Status::Plugin->lookup($plugin_config->{type});
	$code->($plugin, $id, $plugin_config);
    }
}

sub update_all($$@) {
    my ($transactions, $subsystem, @params) = @_;

    my $method = "update_${subsystem}_status";

    my (undef, $fn, $line, $subr) = caller(1);
    for my $txn (@$transactions) {
	my $plugin = PVE::Status::Plugin->lookup($txn->{cfg}->{type});

	$plugin->$method($txn, @params);

	if (length($txn->{data}) > 48000) {
	    # UDP stack cannot handle messages > 65k, if we've alot of data we
	    # do smaller batch sends then, but keep the connection alive
	    transaction_flush($txn, 1);
	}
    }
}

# must return a transaction hash with the format:
# {
#    cfg => $plugin_config,
#    connection => ..., # the connected socket
#    data => '', # payload, will be sent at the trannsaction flush
# }
my $transactions;
sub transactions_start {
    my ($cfg) = @_;

    @$transactions = ();

    foreach_plug($cfg, sub {
	my ($plugin, $id, $plugin_config) = @_;

	my $connection = $plugin->_connect($plugin_config);

	push @$transactions, {
	    connection => $connection,
	    cfg => $plugin_config,
	    id => $id,
	    data => '',
	};
    });

    return $transactions;
}

sub transaction_flush {
    my ($txn, $keepconnected) = @_;

    if (!$txn->{connection}) {
	return if !$txn->{data}; # OK, if data was already sent/flushed
	die "cannot flush metric data, no connection available!\n";
    }
    return if !defined($txn->{data}) || $txn->{data} eq '';

    my $plugin = PVE::Status::Plugin->lookup($txn->{cfg}->{type});

    my $data = delete $txn->{data};
    eval { $plugin->send($txn->{connection}, $data) };
    my $senderr = $@;

    if (!$keepconnected) {
	$plugin->_disconnect($txn->{connection});
	$txn->{connection} = undef;
	# avoid log spam, already got a send error; disconnect would fail too
	warn "disconnect failed: $@" if $@ && !$senderr;
    }
    die "metrics send error '$txn->{id}': $senderr" if $senderr;
};

sub transactions_finish {
    my ($transactions) = @_;

    for my $txn (@$transactions) {
	eval { transaction_flush($txn) };
	warn "$@" if $@;
    }
}

1;
