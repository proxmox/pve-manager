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
	'repeat-missed' => { optional => 1 },
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

    if ((my $format = $PVE::VZDump::Common::PROPERTY_STRINGS->{$key}) && !ref($value)) {
	$value = PVE::JSONSchema::parse_property_string($format, $value);
    }

    return $value;
}

sub encode_value {
    my ($class, $type, $key, $value) = @_;

    if ((my $format = $PVE::VZDump::Common::PROPERTY_STRINGS->{$key}) && ref($value) eq 'HASH') {
	$value = PVE::JSONSchema::print_property_string($value, $format);
    }

    return $value;
}

sub run {
    my ($class, $conf) = @_;

    # remove all non vzdump related options
    foreach my $opt (keys %$conf) {
	delete $conf->{$opt} if !defined($props->{$opt});
    }

    # Required as string parameters
    for my $key (keys $PVE::VZDump::Common::PROPERTY_STRINGS->%*) {
	if ($conf->{$key} && ref($conf->{$key}) eq 'HASH') {
	    my $format = $PVE::VZDump::Common::PROPERTY_STRINGS->{$key};
	    $conf->{$key} = PVE::JSONSchema::print_property_string($conf->{$key}, $format);
	}
    }

    $conf->{quiet} = 1; # do not write to stdout/stderr

    PVE::Cluster::cfs_update(); # refresh vmlist

    return PVE::API2::VZDump->vzdump($conf);
}

1;
