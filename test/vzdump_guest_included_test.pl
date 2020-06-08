#!/usr/bin/perl

# Some of the tests can only be applied once the whole include logic is moved
# into one single method. Right now parts of it, (all, exclude)  are in the
# PVE::VZDump->exec_backup() method.

use strict;
use warnings;

use lib '..';

use Test::More tests => 7;
use Test::MockModule;

use PVE::VZDump;

use Data::Dumper;

my $vmlist = {
    'ids' => {
	100 => {
	    'type' => 'qemu',
	    'node' => 'node1',
	},
	101 => {
	    'type' => 'qemu',
	    'node' => 'node1',
	},
	112 => {
	    'type' => 'lxc',
	    'node' => 'node1',
	},
	113 => {
	    'type' => 'lxc',
	    'node' => 'node1',
	},
	200 => {
	    'type' => 'qemu',
	    'node' => 'node2',
	},
	201 => {
	    'type' => 'qemu',
	    'node' => 'node2',
	},
	212 => {
	    'type' => 'lxc',
	    'node' => 'node2',
	},
	213 => {
	    'type' => 'lxc',
	    'node' => 'node2',
	},
    }
};

my $pools = {
    testpool => [100, 101, 200, 201],
};

my $pve_cluster_module = Test::MockModule->new('PVE::Cluster');
$pve_cluster_module->mock(
    get_vmlist => sub {
	return $vmlist;
    }
);

my $pve_inotify = Test::MockModule->new('PVE::INotify');
$pve_inotify->mock(
    nodename => sub {
	return 'node1';
    }
);

my $pve_api2tools = Test::MockModule->new('PVE::API2Tools');
$pve_api2tools->mock(
    get_resource_pool_guest_members => sub {
	return $pools->{testpool};
    }
);

my $tests = [];
my $addtest = sub {
    my ($name, $test) = @_;
    push @$tests, {
        name => $name,
        test => $test,
    };
};

# is handled in the PVE::VZDump->exec_backup() method for now
# $addtest->('Test all guests', {
#     expected_vmids => [ 100, 101, 112, 113, 200, 201, 212, 213 ],
#     expected_skiplist => [ ],
#     param => {
# 	all => 1,
#     }
# });

# is handled in the PVE::VZDump->exec_backup() method for now
# $addtest->('Test all guests with cluster node limit', {
#     expected_vmids => [ 100, 101, 112, 113, 200, 201, 212, 213 ],
#     expected_skiplist => [],
#     param => {
# 	all => 1,
# 	node => 'node2',
#     }
# });

# is handled in the PVE::VZDump->exec_backup() method for now
# $addtest->('Test all guests with local node limit', {
#     expected_vmids => [ 100, 101, 112, 113 ],
#     expected_skiplist => [ 200, 201, 212, 213 ],
#     param => {
# 	all => 1,
# 	node => 'node1',
#     }
# });
#
# TODO: all test variants with exclude

$addtest->('Test pool members', {
    expected_vmids => [ 100, 101 ],
    expected_skiplist => [ 200, 201 ],
    param => {
	pool => 'testpool',
    }
});

$addtest->('Test pool members with cluster node limit', {
    expected_vmids => [ 100, 101, 200, 201 ],
    expected_skiplist => [],
    param => {
	pool => 'testpool',
	node => 'node2',
    }
});

$addtest->('Test pool members with local node limit', {
    expected_vmids => [ 100, 101 ],
    expected_skiplist => [ 200, 201 ],
    param => {
	pool => 'testpool',
	node => 'node1',
    }
});

$addtest->('Test selected VMIDs', {
    expected_vmids => [ 100 ],
    expected_skiplist => [ 201, 212 ],
    param => {
	vmid => '100, 201, 212',
    }
});


$addtest->('Test selected VMIDs with cluster node limit', {
    expected_vmids => [ 100, 201, 212 ],
    expected_skiplist => [],
    param => {
	vmid => '100, 201, 212',
	node => 'node2',
    }
});

$addtest->('Test selected VMIDs with local node limit', {
    expected_vmids => [ 100 ],
    expected_skiplist => [ 201, 212 ],
    param => {
	vmid => '100, 201, 212',
	node => 'node1',
    }
});

$addtest->('Test selected VMIDs on other nodes', {
    expected_vmids => [],
    expected_skiplist => [ 201, 212 ],
    param => {
	vmid => '201, 212',
	node => 'node1',
    }
});


for my $test (@{$tests}) {
    my $testname = $test->{name};
    my $testdata = $test->{test};

    note($testname);
    my $expected = [ $testdata->{expected_vmids}, $testdata->{expected_skiplist} ];

    my ($local, $cluster)  = PVE::VZDump::get_included_guests($testdata->{param});
    my $result = [ $local, $cluster ];

    # print "Expected: " . Dumper($expected);
    # print "Returned: " . Dumper($result);

    is_deeply($result, $expected, $testname);
}

exit(0);
