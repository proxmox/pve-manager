#!/usr/bin/perl -w


use strict;
use PVE::API2Client;
use PVE::AccessControl;
use PVE::INotify;

use Data::Dumper;

my $hostname = PVE::INotify::read_file("hostname");

# normally you use username/password,
# but we can simply create a ticket if we are root
my $ticket = PVE::AccessControl::assemble_ticket('root');

my $conn = PVE::API2Client->new(
#    username => 'root',
#    password => 'yourpassword',
    ticket => $ticket,
    host => $hostname,
    );

my $res = $conn->get("api2/json/", {});

print "TEST: " . Dumper($res);
