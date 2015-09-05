package PVE::CLI::pvesubscription;

use strict;
use warnings;

use PVE::Tools;
use PVE::SafeSyslog;
use PVE::INotify;
use PVE::RPCEnvironment;
use PVE::CLIHandler;
use PVE::API2::Subscription;

use base qw(PVE::CLIHandler);

my $nodename = PVE::INotify::nodename();

our $cmddef = {
    update => [ 'PVE::API2::Subscription', 'update', undef, { node => $nodename } ],
    get => [ 'PVE::API2::Subscription', 'get', undef, { node => $nodename }, 
	     sub {
		 my $info = shift;
		 foreach my $k (sort keys %$info) {
		     print "$k: $info->{$k}\n";
		 }
	     }],
    set => [ 'PVE::API2::Subscription', 'set', ['key'], { node => $nodename } ],
};

1;

__END__

=head1 NAME

pvesubscription - Proxmox VE subscription mamager

=head1 SYNOPSIS

=include synopsis

=head1 DESCRIPTION

This tool is used to handle pve subscriptions.

=include pve_copyright
