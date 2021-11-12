package PVE::Jobs::VZDump;

use strict;
use warnings;

use PVE::INotify;
use PVE::VZDump::Common;
use PVE::API2::VZDump;
use PVE::Cluster;
use PVE::JSONSchema;

use base qw(PVE::Jobs::Plugin);

sub type {
    return 'vzdump';
}

my $props = PVE::VZDump::Common::json_config_properties();

sub properties {
    return $props;
}

sub options {
    my $options = {
	enabled => { optional => 1 },
	schedule => {},
	comment => { optional => 1 },
    };
    foreach my $opt (keys %$props) {
	if ($props->{$opt}->{optional}) {
	    $options->{$opt} = { optional => 1 };
	} else {
	    $options->{$opt} = {};
	}
    }

    return $options;
}

sub decode_value {
    my ($class, $type, $key, $value) = @_;

    if ($key eq 'prune-backups' && !ref($value)) {
	$value = PVE::JSONSchema::parse_property_string(
	    'prune-backups',
	    $value,
	);
    }

    return $value;
}

sub encode_value {
    my ($class, $type, $key, $value) = @_;

    if ($key eq 'prune-backups' && ref($value) eq 'HASH') {
	$value = PVE::JSONSchema::print_property_string(
	    $value,
	    'prune-backups',
	);
    }

    return $value;
}

sub run {
    my ($class, $conf) = @_;

    # remove all non vzdump related options
    foreach my $opt (keys %$conf) {
	delete $conf->{$opt} if !defined($props->{$opt});
    }

    # fixup prune-backups, we get it decoded but want it as string parameter
    $conf->{'prune-backups'} = PVE::JSONSchema::print_property_string(
	$conf->{'prune-backups'},
	'prune-backups',
    ) if $conf->{'prune-backups'} && ref($conf->{'prune-backups'}) eq 'HASH';

    $conf->{quiet} = 1; # do not write to stdout/stderr

    PVE::Cluster::cfs_update(); # refresh vmlist

    return PVE::API2::VZDump->vzdump($conf);
}

1;
