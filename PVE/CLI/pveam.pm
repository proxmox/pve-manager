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

our $cmddef = {
    update => [ __PACKAGE__, 'update', []],
    download => [ 'PVE::API2::Nodes::Nodeinfo', 'apl_download', [ 'storage', 'template'], { node => $nodename } ],
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
