package PVE::API2Tools;

use strict;
use warnings;
use PVE::Tools;
use Digest::MD5 qw(md5_hex);

my $hwaddress;

sub get_hwaddress {
    
    return $hwaddress if defined ($hwaddress);

    my $fn = '/etc/ssh/ssh_host_rsa_key.pub';
    my $sshkey = PVE::Tools::file_get_contents($fn);
    $hwaddress = uc(md5_hex($sshkey));

    return $hwaddress;
}

sub extract_node_stats {
    my ($node, $members, $rrd) = @_;

    my $entry = {
	id => "node/$node",
	node => $node,
	type => "node",
    };

    if (my $d = $rrd->{"pve2-node/$node"}) {
		    
	if (!$members || # no cluster
	    ($members->{$node} && $members->{$node}->{online})) {
	    $entry->{uptime} = ($d->[0] || 0) + 0;
	    $entry->{cpu} = ($d->[5] || 0) + 0;
	    $entry->{mem} = ($d->[8] || 0) + 0;
	    $entry->{disk} = ($d->[12] || 0) + 0;
	}
	$entry->{level} = $d->[1];
	$entry->{maxcpu} = ($d->[4] || 0) + 0;
	$entry->{maxmem} = ($d->[7] || 0) + 0;
	$entry->{maxdisk} = ($d->[11] || 0) + 0;
    }

    return $entry;
}

sub extract_vm_stats {
    my ($vmid, $data, $rrd) = @_;

    my $entry = {
	id => "$data->{type}/$vmid",
	vmid => $vmid + 0, 
	node => $data->{node},
	type => $data->{type},
    };

    my $d;

    if ($d = $rrd->{"pve2-vm/$vmid"}) {

	$entry->{uptime} = ($d->[0] || 0) + 0;
	$entry->{name} = $d->[1];
	$entry->{status} = $entry->{uptime} ? 'running' : 'stopped';
	$entry->{maxcpu} = ($d->[3] || 0) + 0;
	$entry->{cpu} = ($d->[4] || 0) + 0;
	$entry->{maxmem} = ($d->[5] || 0) + 0;
	$entry->{mem} = ($d->[6] || 0) + 0;
	$entry->{maxdisk} = ($d->[7] || 0) + 0;
	$entry->{disk} = ($d->[8] || 0) + 0;
	$entry->{netin} = ($d->[9] || 0) + 0;
	$entry->{netout} = ($d->[10] || 0) + 0;
	$entry->{diskread} = ($d->[11] || 0) + 0;
	$entry->{diskwrite} = ($d->[12] || 0) + 0;
    
    } elsif ($d = $rrd->{"pve2.3-vm/$vmid"}) {

	$entry->{uptime} = ($d->[0] || 0) + 0;
	$entry->{name} = $d->[1];
	$entry->{status} = $d->[2];
	$entry->{template} = $d->[3] + 0;

	$entry->{maxcpu} = ($d->[5] || 0) + 0;
	$entry->{cpu} = ($d->[6] || 0) + 0;
	$entry->{maxmem} = ($d->[7] || 0) + 0;
	$entry->{mem} = ($d->[8] || 0) + 0;
	$entry->{maxdisk} = ($d->[9] || 0) + 0;
	$entry->{disk} = ($d->[10] || 0) + 0;
	$entry->{netin} = ($d->[11] || 0) + 0;
	$entry->{netout} = ($d->[12] || 0) + 0;
	$entry->{diskread} = ($d->[13] || 0) + 0;
	$entry->{diskwrite} = ($d->[14] || 0) + 0;
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
