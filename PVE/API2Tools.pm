package PVE::API2Tools;

use strict;
use warnings;


sub extract_vm_stats {
    my ($vmid, $data, $rrd) = @_;

    my $entry = {
	id => "$data->{type}/$vmid",
	vmid => $vmid + 0, 
	node => $data->{node},
	type => $data->{type},
    };

    if (my $d = $rrd->{"pve2-vm/$vmid"}) {

	$entry->{uptime} = ($d->[0] || 0) + 0;
	$entry->{name} = $d->[1];

	$entry->{maxcpu} = ($d->[3] || 0) + 0;
	$entry->{cpu} = ($d->[4] || 0) + 0;
	$entry->{maxmem} = ($d->[5] || 0) + 0;
	$entry->{mem} = ($d->[6] || 0) + 0;
	$entry->{maxdisk} = ($d->[7] || 0) + 0;
	$entry->{disk} = ($d->[8] || 0) + 0;
    };

    return $entry;
};

sub extract_storage_stats {
    my ($storeid, $scfg, $node, $rrd) = @_;

    my $entry = {
	id => "storage/$node/$storeid",
	storage => $storeid, 
	node => $node, 
	type => 'storage', 
    }; 

    if (my $d = $rrd->{"pve2-storage/$node/$storeid"}) {
	$entry->{maxdisk} = ($d->[1] || 0) + 0;
	$entry->{disk} = ($d->[2] || 0) + 0;
    }

    return $entry;
};

1;
