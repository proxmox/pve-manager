package PVE::CLI::pveam;

use strict;
use warnings;

use PVE::Cluster;
use PVE::APLInfo;
use PVE::SafeSyslog;
use PVE::Tools qw(extract_param);
use PVE::Cluster;
use PVE::INotify;
use PVE::RPCEnvironment;
use PVE::JSONSchema qw(get_standard_option);
use PVE::CLIHandler;
use PVE::API2::Nodes;
use PVE::Storage;

use base qw(PVE::CLIHandler);

my $nodename = PVE::INotify::nodename();

my $upid_exit = sub {
    my $upid = shift;
    my $status = PVE::Tools::upid_read_status($upid);
    exit($status eq 'OK' ? 0 : -1);
};

__PACKAGE__->register_method ({
    name => 'update',
    path => 'update',
    method => 'PUT',
    description => "Update Container Template Database.",
    parameters => {
	additionalProperties => 0,
    },
    returns => { type => 'null'},
    code => sub {

	my $dccfg = PVE::Cluster::cfs_read_file('datacenter.cfg');
	print STDERR "update failed - see /var/log/pveam.log for details\n"
	    if !PVE::APLInfo::update($dccfg->{http_proxy});

	return undef;

    }});

__PACKAGE__->register_method ({
    name => 'available',
    path => 'available',
    method => 'GET',
    description => "List available templates.",
    parameters => {
	additionalProperties => 0,
	properties => {
	    section => {
		type => 'string',
		description => "Restrict list to specified section.",
		enum => ['system', 'turnkeylinux'],
		optional => 1,
	    },
	}
    },
    returns => { type => 'null'},
    code => sub {
	my ($param) = @_;

	my $list = PVE::APLInfo::load_data();

	foreach my $section (sort keys %$list) {
	    next if $section eq 'all';
	    next if $param->{section} && $section ne $param->{section};
	    foreach my $template (sort keys %{$list->{$section}}) {
		print sprintf("%-15s %s\n", $section, $template);
	    }
	}
	return undef;

    }});

__PACKAGE__->register_method ({
    name => 'index',
    path => 'index',
    method => 'GET',
    description => "Get list of all templates on storage",
    permissions => {
	description => "Show all users the template wich have permission on that storage.",
	check => ['perm', '/storage/{storage}', ['Datastore.AllocateTemplate']],
    },
    proxyto => 'node',
    protected => 1,
    parameters => {
	additionalProperties => 0,
	properties => {
	    node => get_standard_option('pve-node'),
	    storage => get_standard_option('pve-storage-id', {
		description => "Only list status for specified storage",
		completion => \&PVE::Storage::complete_storage_enabled,
	   }),
	},
    },
    returns => {
	type => 'array',
	items => {
	    type => "object",
	    properties => {},
	},
    },
    code => sub {
	my ($param) = @_;

	my $rpcenv = PVE::RPCEnvironment::get();

	my $authuser = $rpcenv->get_user();

	my $storeid = $param->{storage};

	my $cfg = PVE::Storage::config();

	die "Storage do not support templates!\n" if !$cfg->{ids}->{$storeid}->{content}->{vztmpl};

	my $vollist = PVE::Storage::volume_list($cfg, $storeid, undef, 'vztmpl');

	my $res = [];
	foreach my $item (@$vollist) {
	    eval { $rpcenv->check_volume_access($authuser, $cfg, undef, $item->{volid}); };
	    next if $@;
	    push @$res, $item;
	}

	return $res;
    }});

__PACKAGE__->register_method ({
    name => 'remove',
    path => 'remove',
    method => 'DELETE',
    description => "Remove a template.",
    permissions => {
	description => "Only user who can create templates can remove them.",
	check => ['perm', '/storage/{storage}', ['Datastore.AllocateTemplate']],
    },
    proxyto => 'node',
    protected => 1,
    parameters => {
	additionalProperties => 0,
	properties => {
	    node => get_standard_option('pve-node'),
	    template_path => { 
		type => 'string',
		description => "The template to remove.",
		maxLength => 255,
	    },
	},
    },
    returns => { type => 'null' },
    code => sub {
	my ($param) = @_;

	my $rpcenv = PVE::RPCEnvironment::get();

	my $authuser = $rpcenv->get_user();

	my $template = $param->{template_path};

	my $cfg = PVE::Storage::config();

	$rpcenv->check_volume_access($authuser, $cfg, undef, $template);

	my $abs_path = PVE::Storage::abs_filesystem_path($cfg, $template);

	unlink $abs_path;

	return undef;
    }});


my $print_list = sub {
    my ($list) = @_;

    printf "%-60s %-6s\n",
    qw(NAME SIZE);

    foreach my $rec (@$list) {
	printf "%-60s %-4.2fMB\n", $rec->{volid}, $rec->{size}/(1024*1024);
    }
};

our $cmddef = {
    update => [ __PACKAGE__, 'update', []],
    download => [ 'PVE::API2::Nodes::Nodeinfo', 'apl_download', [ 'storage', 'template'], { node => $nodename } ],
    available => [  __PACKAGE__, 'available', []],
    list => [  __PACKAGE__, 'index', [ 'storage' ], { node => $nodename }, $print_list ],
    remove => [  __PACKAGE__, 'remove', [ 'template_path' ], { node => $nodename }]
};

1;

__END__

=head1 NAME

pveam Tool to manage Linux Container templates on Proxmox VE

=head1 SYNOPSIS

=include synopsis

=head1 DESCRIPTION

pveam can manage Container templates like updating the Database,
destroying, downloading and showing templates.
This tool support bash completion

=head1 EXAMPLES

Updating the DB
pveam update

downloading a template in background
pveam download debian-8.0-standard --storage local --bg 1

removing a template
pveam destroy debian-8.0-standard --storage local

showing all templates what are available
pveam show

=head1 FILES

Log-files
/var/log/pveam.log

=include pve_copyright
