package PVE::Jobs::Plugin;

use strict;
use warnings;

use PVE::Cluster qw(cfs_register_file);

use base qw(PVE::SectionConfig);

cfs_register_file('jobs.cfg',
		  sub { __PACKAGE__->parse_config(@_); },
		  sub { __PACKAGE__->write_config(@_); });

my $defaultData = {
    propertyList => {
	type => { description => "Section type." },
	id => {
	    description => "The ID of the VZDump job.",
	    type => 'string',
	    format => 'pve-configid',
	},
	enabled => {
	    description => "Determines if the job is enabled.",
	    type => 'boolean',
	    default => 1,
	    optional => 1,
	},
	schedule => {
	    description => "Backup schedule. The format is a subset of `systemd` calendar events.",
	    type => 'string', format => 'pve-calendar-event',
	    maxLength => 128,
	},
    },
};

sub private {
    return $defaultData;
}

sub parse_config {
    my ($class, $filename, $raw) = @_;

    my $cfg = $class->SUPER::parse_config($filename, $raw);

    foreach my $id (sort keys %{$cfg->{ids}}) {
	my $data = $cfg->{ids}->{$id};

	$data->{id} = $id;
	$data->{enabled}  //= 1;
   }

   return $cfg;
}

sub run {
    my ($class, $cfg) = @_;
    # implement in subclass
    die "not implemented";
}

1;
