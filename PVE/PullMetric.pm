package PVE::PullMetric;
use strict;
use warnings;

use Proxmox::RS::SharedCache;
use PVE::Network;

use constant OLD_GENERATIONS => 180;
use constant LOCK_TIMEOUT => 2;

my $cache;
my $get_cache = sub {
    if (!defined($cache)) {

	my $uid = getpwnam('root');
	my $gid = getgrnam('www-data');

	$cache = Proxmox::RS::SharedCache->new({
		path => "/run/pve/metrics",
		owner => $uid,
		group => $gid,
		entry_mode =>  0640, # Entry permissions
		keep_old => OLD_GENERATIONS,
	    }
	);
    }

    return $cache;
};

# Return the number of generations stored by the metrics cache
sub max_generations {
    # Number of old stats plus the most recent ones
    return OLD_GENERATIONS + 1;
}

sub transaction_start {
    return {};
}

sub transaction_finish {
    my ($txn) = @_;

    $get_cache->()->set($txn, 2);
}

sub update {
    my ($txn, $subsystem, $data, $timestamp) = @_;

    $txn->{$subsystem}->{data} = $data;
    $txn->{$subsystem}->{timestamp} = $timestamp;
}

1;
