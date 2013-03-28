#!/usr/bin/perl -w

use lib '../../';
use strict;
use Time::HiRes qw( usleep ualarm gettimeofday tv_interval );
use PVE::INotify;
use PVE::AccessControl;

my $hostname = PVE::INotify::read_file("hostname");

# normally you use username/password,
# but we can simply create a ticket if we are root
my $ticket = PVE::AccessControl::assemble_ticket('root@pam');


my $cmd = "ab -c 2 -n 1000 -C 'PVEAuthCookie=$ticket'  https://$hostname:8006/api2/json";
print "$cmd\n";
system($cmd) == 0 || die "command failed - $!\n";
