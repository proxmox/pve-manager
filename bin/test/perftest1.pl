#!/usr/bin/perl -w


use strict;
use Time::HiRes qw( usleep ualarm gettimeofday tv_interval );
use PVE::API2Client;
use PVE::INotify;

use Data::Dumper;

my $hostname = PVE::INotify::read_file("hostname");

# normally you use username/password,
# but we can simply create a ticket if we are root
my $ticket = PVE::AccessControl::assemble_ticket('root@pam');

my $wcount = 4;
my $qcount = 500;

sub test_rpc {
    my ($host) = @_;

    my $conn = PVE::API2Client->new(
	#username => 'root@pam',
	#password => 'yourpassword',
	ticket => $ticket,
	host => $host,
	);

    for (my $i = 0; $i < $qcount; $i++) {
	eval {
	    my $res = $conn->get("api2/json", {});
	};

	my $err = $@;

	if ($err) {

	    print "ERROR: $err\n";
	    last;
	}
    }
}

sub run_tests {
    my ($host) = @_;
    
    my $workers;

    my $starttime = [gettimeofday];

    for (my $i = 0; $i < $wcount; $i++) {
	if (my $pid = fork ()) {
	    $workers->{$pid} = 1;
	} else {
	    test_rpc ($host);
	    exit (0);
	}
    }

    # wait for children
    1 while (wait > 0);

    my $elapsed = int(tv_interval ($starttime) * 1000);

    my $tpq = $elapsed / ($wcount*$qcount);

    print "$host: $tpq ms per query\n";
}

# TODO: Apache is much slower, why? 

run_tests("localhost"); # test 'pvedaemon'

run_tests($hostname); # test 'apache'
