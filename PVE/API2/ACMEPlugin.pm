package PVE::API2::ACMEPlugin;

use strict;
use warnings;

use MIME::Base64;
use Storable qw(dclone);


use PVE::ACME::Challenge;
use PVE::ACME::DNSChallenge;
use PVE::ACME::StandAlone;
use PVE::Cluster qw(cfs_read_file cfs_write_file cfs_register_file);
use PVE::JSONSchema qw(register_standard_option get_standard_option);
use PVE::Tools qw(extract_param);
use base qw(PVE::RESTHandler);

my $FILENAME = "priv/acme/plugins.cfg";

cfs_register_file ($FILENAME,
   sub { PVE::ACME::Challenge->parse_config(@_); },
   sub { PVE::ACME::Challenge->write_config(@_); });

PVE::ACME::DNSChallenge->register();
PVE::ACME::StandAlone->register();
PVE::ACME::Challenge->init();

PVE::JSONSchema::register_standard_option('pve-acme-pluginid', {
    type => 'string',
    format => 'pve-configid',
    description => 'Unique identifier for ACME plugin instance.',
});

my $plugin_type_enum = PVE::ACME::Challenge->lookup_types();

my $modify_cfg_for_api = sub {
    my ($cfg, $pluginid) = @_;

    die "ACME plugin '$pluginid' not defined\n"
	if !defined($cfg->{ids}->{$pluginid});

    my $plugin_cfg = dclone($cfg->{ids}->{$pluginid});
    $plugin_cfg->{plugin} = $pluginid;
    $plugin_cfg->{digest} = $cfg->{digest};

    return $plugin_cfg;
};

__PACKAGE__->register_method ({
    name => 'index',
    path => '',
    method => 'GET',
    permissions => {
	check => ['perm', '/', [ 'Sys.Modify' ]],
    },
    description => "ACME plugin index.",
    protected => 1,
    parameters => {
	additionalProperties => 0,
	properties => {
	    type => {
		description => "Only list storage of specific type",
		type => 'string',
		enum => $plugin_type_enum,
		optional => 1,
	    },
	},
    },
    returns => {
	type => 'array',
	items => {
	    type => "object",
	    properties => {
		plugin => get_standard_option('pve-acme-pluginid'),
	    },
	},
	links => [ { rel => 'child', href => "{plugin}" } ],
    },
    code => sub {
	my ($param) = @_;

	my $cfg = load_config();

	my $res =[];

	foreach my $pluginid (keys %{$cfg->{ids}}) {
	    my $plugin_cfg = $modify_cfg_for_api->($cfg, $pluginid);
	    next if $param->{type} && $param->{type} ne $plugin_cfg->{type};
	    push @$res, $plugin_cfg;
	}

	return $res;

    }});

__PACKAGE__->register_method({
    name => 'get_plugin_config',
    path => '{id}',
    method => 'GET',
    description => "Get ACME DNS plugin configuration.",
    permissions => {
	check => ['perm', '/', [ 'Sys.Modify' ]],
    },
    protected => 1,
    parameters => {
	additionalProperties => 0,
	properties => {
	    id => get_standard_option('pve-acme-pluginid'),
	},
    },
    returns => {
	type => 'object',
    },
    code => sub {
	my ($param) = @_;

	return $modify_cfg_for_api->(load_config(), $param->{id});
    }});

my $update_config = sub {
    my ($id, $op, $type, $param) = @_;

    my $cfg = load_config();

    if ( $op eq "add" ) {
	die "Section with ID: $id already exists\n"
	    if defined($cfg->{ids}->{$id});

	my $plugin = PVE::ACME::Challenge->lookup($type);
	my $opts = $plugin->check_config($id, $param, 1, 1);

	$cfg->{ids}->{$id} = $opts;
	$cfg->{ids}->{$id}->{type} = $type;
    } elsif ($op eq "update") {
	die "Section with ID; $id does not exist\n"
	    if !defined($cfg->{ids}->{$id});

	my $delete = extract_param($param, 'delete');

	$type = $cfg->{ids}->{$id}->{type};
	my $plugin = PVE::ACME::Challenge->lookup($type);
	my $opts = $plugin->check_config($id, $param, 0, 1);
	if ($delete) {
	    my $options = $plugin->private()->{options}->{$type};
	    foreach my $k (PVE::Tools::split_list($delete)) {
		my $d = $options->{$k} || die "no such option '$k'\n";
		die "unable to delete required option '$k'\n" if !$d->{optional};
		die "unable to delete fixed option '$k'\n" if $d->{fixed};
		die "cannot set and delete property '$k' at the same time!\n"
		    if defined($opts->{$k});

		delete $cfg->{ids}->{$id}->{$k};
	    }
	}

	for my $k (keys %$opts) {
	    print "$k: $opts->{$k}\n";
	    $cfg->{ids}->{$id}->{$k} = $opts->{$k};
	}
    } elsif ($op eq "del") {
	delete $cfg->{ids}->{$id};
    } else {
	die 'undefined config update operation\n' if !defined($op);
	die "unknown config update operation '$op'\n";
    }

    PVE::Cluster::cfs_write_file($FILENAME, $cfg);
};

__PACKAGE__->register_method({
    name => 'add_plugin',
    path => '',
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
    name => 'update_plugin',
    path => '{id}',
    method => 'PUT',
    description => "Update ACME DNS plugin configuration.",
    permissions => {
	check => ['perm', '/', [ 'Sys.Modify' ]],
    },
    protected => 1,
    parameters => PVE::ACME::Challenge->updateSchema(),
    returns => { type => "null" },
    code => sub {
	my ($param) = @_;

	my $id = extract_param($param, 'id');

	PVE::Cluster::cfs_lock_file($FILENAME, undef, $update_config, $id, "update", undef, $param);
	die "$@" if $@;

	return undef;
    }});

__PACKAGE__->register_method({
    name => 'delete_plugin',
    path => '{id}',
    method => 'DELETE',
    description => "Delete ACME DNS plugin configuration.",
    permissions => {
	check => ['perm', '/', [ 'Sys.Modify' ]],
    },
    protected => 1,
    parameters => {
	additionalProperties => 0,
	properties => {
	    id => get_standard_option('pve-acme-pluginid'),
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

    my $raw = eval { cfs_read_file($FILENAME) };
    return $raw || {};
}

sub write_conf {
    my ($conf) = @_;

    my $raw = PVE::ACME::Challenge->write_config($FILENAME, $conf);
    cfs_write_file($FILENAME, $raw);
}

1;
