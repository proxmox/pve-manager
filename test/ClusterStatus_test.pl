#!/usr/bin/perl

use v5.36;

use lib ('.', '..');

use Test::MockModule;
use Test::More;

use PVE::JSONSchema;

use PVE::API2::Cluster;
use PVE::API2::Subscription;

my $nodename = 'node1';
my $cluster_id = 'm4q7z2kd3x6ab5tyw3hc';

my $clinfo;
my $cluster_id_result; # code returning the result of reading the cluster ID

my $cluster_mock = Test::MockModule->new('PVE::Cluster');
$cluster_mock->redefine(
    cfs_update => sub { },
    get_clinfo => sub { return $clinfo },
    get_members => sub { return $clinfo->{nodelist} },
    rrd_dump => sub { return {} },
    remote_node_ip => sub { return '192.0.2.1' },
    get_cluster_id => sub { return $cluster_id_result->() },
);

my $inotify_mock = Test::MockModule->new('PVE::INotify');
$inotify_mock->redefine(nodename => sub { return $nodename });

my $subscription_mock = Test::MockModule->new('PVE::API2::Subscription');
$subscription_mock->redefine(read_etc_subscription => sub { return { level => 'c' } });

my $cluster_info = {
    cluster => { name => 'testcluster', nodes => 2, version => 3, quorate => 1 },
    nodelist => {
        node1 => { id => 1, online => 1, ip => '192.0.2.1' },
        node2 => { id => 2, online => 0, ip => '192.0.2.2' },
    },
};
# what pmxcfs reports without a corosync configuration
my $standalone_info = { version => 1 };

my $method = PVE::API2::Cluster->map_method_by_name('get_status');

sub get_status() {
    my $res = PVE::API2::Cluster->handle($method, {});
    PVE::JSONSchema::validate($res, $method->{returns}, "return schema violated\n");
    return $res;
}

sub cluster_ids($res) {
    return { map { $_->{id} => $_->{'cluster-id'} } grep { exists($_->{'cluster-id'}) } @$res };
}

for my $case (
    {
        name => 'cluster with ID',
        clinfo => $cluster_info,
        read => sub { return $cluster_id },
        expected => { cluster => $cluster_id },
    },
    {
        name => 'cluster without ID',
        clinfo => $cluster_info,
        read => sub { return undef },
        expected => {},
    },
    {
        name => 'cluster, reading the ID fails',
        clinfo => $cluster_info,
        read => sub { die "Connection refused\n" },
        expected => {},
    },
    {
        name => 'standalone node with ID',
        clinfo => $standalone_info,
        read => sub { return $cluster_id },
        expected => { "node/$nodename" => $cluster_id },
    },
    {
        name => 'standalone node without ID',
        clinfo => $standalone_info,
        read => sub { return undef },
        expected => {},
    },
    {
        name => 'standalone node, reading the ID fails',
        clinfo => $standalone_info,
        read => sub { die "Connection refused\n" },
        expected => {},
    },
) {
    subtest $case->{name} => sub {
        $clinfo = $case->{clinfo};
        $cluster_id_result = $case->{read};

        my $res = eval { get_status() };
        is($@, '', 'status does not fail');
        is_deeply(cluster_ids($res), $case->{expected}, 'cluster ID on the expected entry');

        my $ids = [sort map { $_->{id} } @$res];
        if ($clinfo->{cluster}) {
            is_deeply($ids, ['cluster', 'node/node1', 'node/node2'], 'entry IDs unchanged');
        } else {
            is_deeply($ids, ["node/$nodename"], 'entry IDs unchanged');
        }
    };
}

done_testing();
