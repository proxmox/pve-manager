#!/usr/bin/perl

use v5.36;

use lib ('.', '..');

use JSON;
use Test::MockModule;
use Test::More;

use PVE::JSONSchema;

use PVE::API2::Cluster;

my $uid_100 = 'k3d7q2mxa5vb4n6pw2fz';
my $uid_101 = 'r6t2w4y7z3c5e2g4h7jm';
my $uid_104 = 'q2w3e4r5t6y7u2i3o4pa';

# top-level config values per guest as decoded from the pmxcfs reply, plus whether the user has
# VM.Audit on it; node2 is offline
my $guests;
my $default_guests = {
    100 => {
        type => 'qemu',
        node => 'node1',
        audit => 1,
        meta => "creation-qemu=9.2.0,ctime=1700000000,rtime=1731600000123,uid=$uid_100",
    },
    101 => { type => 'lxc', node => 'node2', audit => 1, meta => "uid=$uid_101" },
    102 => {
        type => 'qemu',
        node => 'node1',
        audit => 1,
        meta => 'rtime=1731600000123,uid=NOT-A-UID',
    },
    103 => { type => 'qemu', node => 'node1', audit => 1 },
    104 => { type => 'qemu', node => 'node2', audit => 1, meta => "rtime=12x,uid=$uid_104" },
    105 => {
        type => 'lxc',
        node => 'node1',
        audit => 0,
        meta => "rtime=1731600000123,uid=$uid_100",
    },
};

my $default_identities = {
    100 => { uid => $uid_100, rtime => 1731600000123 },
    101 => { uid => $uid_101 },
    102 => {},
    103 => {},
    104 => { uid => $uid_104 },
};

my $cluster_mock = Test::MockModule->new('PVE::Cluster');
$cluster_mock->redefine(
    get_nodelist => sub { return ['node1', 'node2'] },
    get_members => sub {
        return { node1 => { id => 1, online => 1 }, node2 => { id => 2, online => 0 } };
    },
    rrd_dump => sub { return {} },
    get_node_kv => sub { return {} },
    get_vmlist => sub {
        my $ids = {};
        for my $vmid (keys %$guests) {
            my $guest = $guests->{$vmid};
            $ids->{$vmid} = { node => $guest->{node}, type => $guest->{type}, version => 1 };
        }
        return { ids => $ids };
    },
    get_guest_config_properties => sub($properties, $vmid = undef) {
        die "only the request for all guests is expected\n" if defined($vmid);

        my $res = {};
        for my $id (keys %$guests) {
            for my $prop (@$properties) {
                my $value = $guests->{$id}->{$prop} // next;
                $res->{$id}->{$prop} = $value;
            }
        }
        return $res;
    },
);

my $ha_config_mock = Test::MockModule->new('PVE::HA::Config');
$ha_config_mock->redefine(
    read_manager_status => sub { return {} },
    read_resources_config => sub { return { ids => {} } },
);

my $storage_mock = Test::MockModule->new('PVE::Storage');
$storage_mock->redefine(
    config => sub { return { ids => {} } },
    storage_ids => sub { return () },
);

my $rpcenv = bless { user_cfg => { pools => { p1 => {} }, vms => { 100 => 'p1' } } },
    'PVE::RPCEnvironment::Test';
sub PVE::RPCEnvironment::Test::get_user { return 'auditor@pve'; }

sub PVE::RPCEnvironment::Test::check($self, $user, $path, $privs, $noerr) {
    return 1 if $path eq '/pool/p1' && grep { $_ eq 'Pool.Audit' } @$privs;
    my ($vmid) = $path =~ m!^/vms/(\d+)$! or return 0;
    return $guests->{$vmid}->{audit} && grep { $_ eq 'VM.Audit' } @$privs;
}
my $rpc_mock = Test::MockModule->new('PVE::RPCEnvironment');
$rpc_mock->redefine(get => sub { return $rpcenv });

my $method = PVE::API2::Cluster->map_method_by_name('resources');

# returns the rows and their JSON encoding, which is what API clients see
sub get_rows($param) {
    my $res = PVE::API2::Cluster->handle($method, $param);
    my $json = JSON->new->utf8->canonical->encode($res);

    PVE::JSONSchema::validate($res, $method->{returns}, "return schema violated\n");

    return ($res, $json);
}

sub guest_rows($res) {
    return { map { $_->{vmid} => $_ } grep { $_->{type} =~ m/^(?:qemu|lxc)$/ } @$res };
}

sub identity_view($res) {
    my $rows = guest_rows($res);

    my $view = {};
    for my $vmid (keys %$rows) {
        my $row = $rows->{$vmid};
        $view->{$vmid} = { map { $_ => $row->{$_} } grep { exists($row->{$_}) } qw(uid rtime) };
    }
    return $view;
}

subtest 'identity of guests with valid, partial, invalid and missing meta' => sub {
    $guests = {%$default_guests};

    my ($res, $json) = get_rows({ type => 'vm' });

    is_deeply(
        identity_view($res),
        $default_identities,
        'uid and rtime only where valid, guests without VM.Audit are not listed',
    );

    like($json, qr/"rtime":1731600000123[,}]/, 'rtime is encoded as JSON number');
    like($json, qr/"uid":"$uid_100"/, 'uid is encoded as JSON string');

    for my $key (qw(meta ctime creation-qemu)) {
        ok(!grep({ exists($_->{$key}) } @$res), "no '$key' in any row");
    }
};

subtest 'listing of all resource types' => sub {
    $guests = {%$default_guests};

    my ($res) = get_rows({});

    is_deeply(identity_view($res), $default_identities, 'same identities as for type vm');

    my @others = grep { $_->{type} !~ m/^(?:qemu|lxc)$/ } @$res;
    is_deeply(
        [sort map { $_->{id} } @others],
        ['/pool/p1', 'node/node1', 'node/node2'],
        'pool and node rows are listed',
    );
    ok(!grep({ exists($_->{uid}) || exists($_->{rtime}) } @others),
        'no identity on other rows');
};

done_testing();
