#!/usr/bin/perl

use strict;
use warnings;

use lib ('.', '..');

use Test::More;

use PVE::Ceph::Releases;

my $default = PVE::Ceph::Releases::get_default_ceph_release_codename();

my sub install_release {
    my ($nodename, %majors) = @_;
    my $versions = { map { $_ => { version => { parts => [$majors{$_}, 2, 0] } } } keys %majors };
    return PVE::Ceph::Releases::get_install_ceph_release_codename($versions, $nodename);
}

is(install_release('node1'), $default, 'default without Ceph in the cluster');
is(install_release('node1', node1 => 21), $default, 'entry of the local node is ignored');
is(install_release('node1', node1 => 19, node2 => 20, node3 => 21), 'umbrella', 'newest release');
eval { install_release('node1', node2 => 99) };
like($@, qr/unknown to this node/, 'unknown release');

done_testing();
