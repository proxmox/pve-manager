#!/usr/bin/perl

use v5.36;

use lib ('.', '..');

use JSON;
use Test::MockModule;
use Test::More;

use PVE::GuestIdentity;
use PVE::RPCEnvironment;

use PVE::API2::Cluster::BulkAction::Guest;

my $new = PVE::GuestIdentity::MIN_PVE_MANAGER_VERSION;
# the Proxmox VE version that each node reports
my $versions = { old1 => '9.1.1', old2 => '9.1.1', new1 => $new, new2 => $new };
my $default_guests = { 100 => 'old1', 101 => 'new1', 102 => 'old2', 103 => 'new2' };
my $guests; # VMID to node

my $cluster_mock = Test::MockModule->new('PVE::Cluster');
$cluster_mock->redefine(
    check_node_exists => sub { },
    get_vmlist => sub {
        return {
            ids => { map { $_ => { node => $guests->{$_}, type => 'qemu' } } keys %$guests } };
    },
    get_node_kv => sub($key, $node) {
        return {} if !defined($versions->{$node});
        return { $node => encode_json({ version => $versions->{$node} }) };
    },
);

my $started; # whether the handler got to start the migration task
my $rpcenv = bless {}, 'PVE::RPCEnvironment';
my $rpcenv_mock = Test::MockModule->new('PVE::RPCEnvironment');
$rpcenv_mock->redefine(
    get => sub { return $rpcenv },
    get_user => sub { return 'root@pam' },
    check => sub { return 1 },
    fork_worker => sub { $started = 1; return 'UPID:test' },
);

my $method = PVE::API2::Cluster::BulkAction::Guest->map_method_by_name('migrate');

my $too_old = qr/^node 'old2' runs Proxmox VE 9\.1\.1, keeping the guest identity requires/;

for my $case (
    { name => 'older source, older target', vms => [100], target => 'old2' },
    {
        name => 'newer source, older target',
        vms => [101],
        target => 'old2',
        refused => $too_old,
    },
    { name => 'newer source, newer target', vms => [101], target => 'new2' },
    { name => 'older source, newer target', vms => [100], target => 'new2' },
    {
        name => 'older and newer source, older target',
        vms => [100, 101],
        target => 'old2',
        refused => $too_old,
    },
    { name => 'guest that is on the older target already', vms => [102], target => 'old2' },
    { name => 'guest that does not exist', vms => [999], target => 'old2' },
    { name => 'all guests, older target', target => 'old2', refused => $too_old },
    { name => 'all guests, newer target', target => 'new2' },
    {
        name => 'all guests on older nodes, older target',
        guests => { 100 => 'old1', 102 => 'old2' },
        target => 'old2',
    },
    { name => 'no guests, older target', guests => {}, target => 'old2' },
    { name => 'empty guest list, older target', vms => [], target => 'old2' },
) {
    subtest $case->{name} => sub {
        $guests = $case->{guests} // $default_guests;
        $started = 0;

        my $param = { target => $case->{target} };
        $param->{vms} = $case->{vms} if $case->{vms};
        eval { PVE::API2::Cluster::BulkAction::Guest->handle($method, $param) };
        my $err = $@;

        if (my $refused = $case->{refused}) {
            like($err, $refused, 'target is refused');
            ok(!$started, 'no task is started');
        } else {
            is($err, '', 'target is not refused');
            ok($started, 'task is started');
        }
    };
}

done_testing();
