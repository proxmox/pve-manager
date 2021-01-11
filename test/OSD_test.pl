#!/usr/bin/perl

use strict;
use warnings;

use lib ('.', '..');

use JSON;
use Test::More;
use PVE::API2::Ceph::OSD;

use Data::Dumper;

my $tree = {
    nodes => [
	{
	    id => -3,
	    name => 'pveA',
	    children => [ 0,1,2,3 ],
	}, {
	    id => -5,
	    name => 'pveB',
	    children => [ 4,5,6,7 ],
	}, {
	    id => -7,
	    name => 'pveC',
	    children => [ 8,9,10,11 ],
	},
    ],
};


# Check if all the grep and casts are correct
my @belong_to_B = ( 4,5 );
my @not_belong_to_B = ( -1,1,10,15 );
foreach (@belong_to_B) {
    is (
	PVE::API2::Ceph::OSD::osd_belongs_to_node($tree, 'pveB', $_),
	1,
	"OSD $_ belongs to node pveB",
    );
}
foreach (@not_belong_to_B) {
    is (
	PVE::API2::Ceph::OSD::osd_belongs_to_node($tree, 'pveB', $_),
	0,
	"OSD $_ does not belong to node pveB",
    );
}


my $double_nodes_tree = {
    nodes => [
	{
	    name => 'pveA',
	},
	{
	    name => 'pveA',
	}
    ]
};
eval { PVE::API2::Ceph::OSD::osd_belongs_to_node($double_nodes_tree, 'pveA') };
like($@, qr/not be more than one/, "Die if node occurs too often");

my $tree_without_nodes = {
    dummy => 'dummy',
};
eval { PVE::API2::Ceph::OSD::osd_belongs_to_node(undef) };
like($@, qr/No tree nodes/, "Die if tree has no nodes");


done_testing(@belong_to_B + @not_belong_to_B + 2);