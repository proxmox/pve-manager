package PVE::Jobs::Plugin;

use strict;
use warnings;

use PVE::Cluster qw(cfs_register_file);

use base qw(PVE::SectionConfig);

cfs_register_file(
    'jobs.cfg',
     sub { __PACKAGE__->parse_config(@_); },
     sub { __PACKAGE__->write_config(@_); }
);

my $defaultData = {
    propertyList => {
	type => { description => "Section type." },
	id => {
	    description => "The ID of the job.",
	    type => 'string',
	    format => 'pve-configid',
	    maxLength => 64,
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
	comment => {
	    optional => 1,
	    type => 'string',
	    description => "Description for the Job.",
	    maxLength => 512,
	},
	'repeat-missed' => {
	    optional => 1,
	    type => 'boolean',
	    description => "If true, the job will be run as soon as possible if it was missed".
		" while the scheduler was not running.",
	    default => 0,
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

	if (defined($data->{comment})) {
	    $data->{comment} = PVE::Tools::decode_text($data->{comment});
	}
   }

   return $cfg;
}

# call the plugin specific decode/encode code
sub decode_value {
    my ($class, $type, $key, $value) = @_;

    my $plugin = __PACKAGE__->lookup($type);
    return $plugin->decode_value($type, $key, $value);
}

sub encode_value {
    my ($class, $type, $key, $value) = @_;

    my $plugin = __PACKAGE__->lookup($type);
    return $plugin->encode_value($type, $key, $value);
}

sub write_config {
    my ($class, $filename, $cfg) = @_;

    for my $job (values $cfg->{ids}->%*) {
	if (defined($job->{comment})) {
	    $job->{comment} = PVE::Tools::encode_text($job->{comment});
	}
    }

    $class->SUPER::write_config($filename, $cfg);
}

sub run {
    my ($class, $cfg) = @_;
    # implement in subclass
    die "not implemented";
}

1;
