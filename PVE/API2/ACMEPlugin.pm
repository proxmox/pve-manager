package PVE::API2::ACMEPlugin;

use strict;
use warnings;

use PVE::ACME::Challenge;
use PVE::ACME::DNSChallenge;
use PVE::ACME::StandAlone;
use PVE::Tools qw(extract_param);
use PVE::Cluster qw(cfs_read_file cfs_write_file cfs_register_file);
use MIME::Base64;

use base qw(PVE::RESTHandler);

my $FILENAME = "priv/acme/plugins.cfg";

cfs_register_file ($FILENAME,
   sub { PVE::ACME::Challenge->parse_config(@_); },
   sub { PVE::ACME::Challenge->write_config(@_); });

PVE::ACME::DNSChallenge->register();
PVE::ACME::StandAlone->register();
PVE::ACME::Challenge->init();

__PACKAGE__->register_method({
    name => 'get_plugin_config',
    path => 'plugin',
    method => 'GET',
    description => "Get ACME DNS plugin configurations.",
    permissions => {
	check => ['perm', '/', [ 'Sys.Modily' ]],
    },
    protected => 1,
    parameters => {
	additionalProperties => 0,
	properties => {
	},
    },
    returns => {
	type => 'object',
    },
    code => sub {

	return  load_config();
    }});

my $update_config = sub {
    my ($id, $op, $type, $param) = @_;

    my $conf = load_config();

    if ( $op eq "add" ) {
	die "Section with ID: $id already exists\n"
	    if defined($conf->{ids}->{$id});

	$conf->{ids}->{$id} = $param;
	$conf->{ids}->{$id}->{type} = $type;
    } elsif ($op eq "del") {
	delete $conf->{ids}->{$id};
    }


    PVE::Cluster::cfs_write_file($FILENAME, $conf);
};

__PACKAGE__->register_method({
    name => 'add_plugin',
    path => 'plugin',
    method => 'POST',
    description => "Add ACME DNS plugin configuration.",
    permissions => {
	check => ['perm', '/', [ 'Sys.Modify' ]],
    },
    protected => 1,
    parameters => PVE::ACME::Challenge->createSchema(),
    returns => { type => "null" },
    code => sub {
	my ($param) = @_;

	my $id = extract_param($param, 'id');
	my $type = extract_param($param, 'type');

	PVE::Cluster::cfs_lock_file($FILENAME, undef, $update_config, $id, "add", $type, $param);
	die "$@" if $@;

	return undef;
    }});

__PACKAGE__->register_method({
    name => 'delete_plugin',
    path => 'plugin',
    method => 'DELETE',
    description => "Delete ACME DNS plugin configuration.",
    permissions => {
	check => ['perm', '/', [ 'Sys.Modify' ]],
    },
    protected => 1,
    parameters => {
		additionalProperties => 0,
		properties => {
		    id => {
			description => "Plugin configuration name",
			type => 'string',
		    },
		},
    },
    returns => { type => "null" },
    code => sub {
	my ($param) = @_;

	my $id = extract_param($param, 'id');

	PVE::Cluster::cfs_lock_file($FILENAME, undef, $update_config, $id, "del", undef, $param );
	die "$@" if $@;

	return undef;
    }});

sub load_config {

    my $raw = eval { cfs_read_file($FILENAME); };
    return !$raw ? {} : $raw;
}

sub write_conf {
    my ($conf) = @_;

    my $raw = PVE::ACME::Challenge->write_config($FILENAME, $conf);

    cfs_write_file($FILENAME, $raw);
}
1;
