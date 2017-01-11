package PVE::CLI::vzdump;

use strict;
use warnings;

use PVE::CLIHandler;
use PVE::API2::VZDump;

use base qw(PVE::CLIHandler);

# Note: use string 'vmid' as $arg_param option, to allow vmid lists
our $cmddef = [ 'PVE::API2::VZDump', 'vzdump', 'vmid', undef,
		sub {
		    my $upid = shift;
		    exit(0) if $upid eq 'OK';
		    my $status = PVE::Tools::upid_read_status($upid);
		    exit($status eq 'OK' ? 0 : -1);
		}];

1;
