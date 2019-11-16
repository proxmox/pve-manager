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

    for my $plugin_config (values %{$status_cfg->{ids}}) {
	next if $plugin_config->{disable};
	my $plugin = PVE::Status::Plugin->lookup($plugin_config->{type});
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

1;
