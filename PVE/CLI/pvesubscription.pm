package PVE::CLI::pvesubscription;

use strict;
use warnings;

use MIME::Base64;
use JSON qw(decode_json);

use PVE::Tools;
use PVE::SafeSyslog;
use PVE::INotify;
use PVE::RPCEnvironment;
use PVE::CLIHandler;
use PVE::API2::Subscription;

use base qw(PVE::CLIHandler);

my $nodename = PVE::INotify::nodename();

sub setup_environment {
    PVE::RPCEnvironment->setup_default_cli_env();
}

__PACKAGE__->register_method({
    name => 'set_offline_key',
    path => 'set_offline_key',
    method => 'POST',
    description => "(Internal use only!) Set a signed subscription info blob as offline key",
    parameters => {
	additionalProperties => 0,
	properties => {
	    data => {
		type => "string",
	    },
	},
    },
    returns => { type => 'null' },
    code => sub {
	my ($param) = @_;

	my $info = decode_json(decode_base64($param->{data}));

	$info = Proxmox::RS::Subscription::check_signature($info);
	$info = Proxmox::RS::Subscription::check_server_id($info);
	$info = Proxmox::RS::Subscription::check_age($info, 0);

	PVE::API2::Subscription::check_key($info->{key}, PVE::API2::Subscription::get_sockets());

	PVE::API2::Subscription::write_etc_subscription($info);
}});

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
    "set-offline-key" => [ __PACKAGE__, 'set_offline_key', ['data'] ],
    delete => [ 'PVE::API2::Subscription', 'delete', undef, { node => $nodename } ],
};

1;
