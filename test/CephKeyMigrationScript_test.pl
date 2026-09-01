#!/usr/bin/perl

use strict;
use warnings;

use lib ('.', '..');

use JSON qw(encode_json);
use Test::More;

use PVE::Ceph::KeyMigration qw(key_fingerprint);

our $NEW = 'AgCk941qku/sDSAAIjO5RhRv/ogXhuxccNS4DZxlXS1LUgzEGFIiY/U7IlI=';
our $OLD = 'AQCP/Y5qflfDFxAAPII6O9qSA7p65js5CEJYDA==';

our $SCRIPT =
    -f './bin/pve-cephx-rotate-service-keys'
    ? './bin/pve-cephx-rotate-service-keys'
    : '../bin/pve-cephx-rotate-service-keys';
do $SCRIPT or die "could not load '$SCRIPT': " . ($@ || $!);
our $HOOKS = key_migration_test_hooks();

{

    package ClientRotationRados;

    sub new {
        my ($class, $key) = @_;
        return bless { key => $key, commands => [] }, $class;
    }

    sub mon_command {
        my ($self, $args) = @_;
        push $self->{commands}->@*, {%$args};
        return [{ entity => $args->{entity}, key => $self->{key} }]
            if $args->{prefix} eq 'auth get';
        if ($args->{prefix} eq 'auth rotate') {
            $self->{key} = $main::NEW;
            return [{ entity => $args->{entity}, key => $self->{key} }];
        }
        die "unexpected monitor command '$args->{prefix}'\n";
    }
}

sub picture {
    my ($complete, @ids) = @_;
    return {
        complete => $complete,
        clients => {
            'client.crash' => [map { { global_id => $_, host => "node$_" } } @ids],
        },
    };
}

sub run_client_rotation {
    my ($rados, $state, @snapshots) = @_;
    my $calls = 0;
    my $snapshot = sub {
        $calls++;
        return shift(@snapshots) // die "unexpected extra session snapshot\n";
    };

    my @saved;
    {
        no warnings qw(once redefine);
        local *main::file_set_contents = sub {
            my ($path, $content) = @_;
            push @saved, [$path, $content];
        };
        $HOOKS->{migrate_client}->(
            $rados, $state, { entity => 'client.crash', files => [] }, $snapshot,
        );
    }
    return ($calls, \@saved);
}

{
    my $startup = picture(1, 1);
    my $state = { client_keys_seen => { 'client.crash' => key_fingerprint($OLD) } };
    my $rados = ClientRotationRados->new($OLD);
    my ($calls) = run_client_rotation(
        $rados, $state, picture(1, 1, 2), picture(1, 1, 2, 3),
    );

    is($calls, 2, 'a client-key rotation takes fresh snapshots before and after the auth change');
    is_deeply(
        $state->{client_refresh}->{'client.crash'}->{session_ids},
        [1, 2, 3],
        'clients appearing after the startup snapshot or across the rotation are retained',
    );
    is_deeply(
        [map { $_->{global_id} } $startup->{clients}->{'client.crash'}->@*],
        [1],
        'the startup picture alone did not contain those consumers',
    );
    ok(
        !$state->{client_refresh}->{'client.crash'}->{measurement_incomplete},
        'two complete boundary snapshots produce a measured record',
    );

    $state->{client_refresh}->{'client.crash'}->{cleared} = 10;
    $rados->{key} = $OLD;
    run_client_rotation($rados, $state, picture(1, 4), picture(1, 5));
    is_deeply(
        $state->{client_refresh}->{'client.crash'}->{session_ids},
        [1, 2, 3, 4, 5],
        'a repeated helper rotation unions its instances with every retained ID',
    );
    ok(
        !defined($state->{client_refresh}->{'client.crash'}->{cleared}),
        'a repeated rotation reopens a confirmed record',
    );
}

{
    my $state = { client_keys_seen => { 'client.crash' => key_fingerprint($OLD) } };
    my $rados = ClientRotationRados->new($OLD);
    run_client_rotation($rados, $state, picture(0, 20), picture(1, 21));
    is_deeply(
        $state->{client_refresh}->{'client.crash'}->{session_ids},
        [20, 21],
        'a partial boundary poll keeps every ID it did return',
    );
    ok(
        $state->{client_refresh}->{'client.crash'}->{measurement_incomplete},
        'one partial boundary poll keeps the record marked as incompletely measured',
    );
}

{
    my $state = {
        client_keys_seen => { 'client.crash' => key_fingerprint($OLD) },
        client_refresh => {
            'client.crash' => { rotated => 1, session_ids => [30], cleared => 2 },
        },
    };
    my @saved;
    {
        no warnings qw(once redefine);
        local *main::file_set_contents = sub { push @saved, [@_] };
        $HOOKS->{reconcile_clients}->(
            $state, { 'client.crash' => { key => $NEW } }, picture(1, 31), { apply => 1 },
        );
        $HOOKS->{reconcile_clients}->(
            $state,
            { 'client.crash' => { key => "$NEW.changed" } },
            picture(0, 32),
            { apply => 1 },
        );
    }
    is_deeply(
        $state->{client_refresh}->{'client.crash'}->{session_ids},
        [30, 31, 32],
        'repeated external rotations retain old and newly visible instance IDs',
    );
    ok(
        !defined($state->{client_refresh}->{'client.crash'}->{cleared}),
        'an external rotation also reopens a confirmed record',
    );
    ok(
        $state->{client_refresh}->{'client.crash'}->{measurement_incomplete},
        'an external rotation remains conservative because its exact boundary was not observed',
    );
}

{

    package CurrentMonitorRados;

    sub new {
        my ($class, %args) = @_;
        return bless { %args, commands => [] }, $class;
    }

    sub mon_command {
        my ($self, $args) = @_;
        push $self->{commands}->@*, {%$args};
        return { mons => [map { { name => $_ } } $self->{mons}->@*] }
            if $args->{prefix} eq 'mon dump';
        return { quorum_names => [$self->{quorum}->@*] }
            if $args->{prefix} eq 'quorum_status';
        return [
            map {
                { %$_ }
            } $self->{metadata}->@*
            ]
            if $args->{prefix} eq 'mon metadata';
        die "unexpected monitor command '$args->{prefix}'\n";
    }
}

{
    my $rados = CurrentMonitorRados->new(
        mons => [qw(a b)],
        quorum => [qw(a b)],
        metadata => [
            { name => 'a', hostname => 'node-a' }, { name => 'b', hostname => 'node-b' },
        ],
    );
    my @queried;
    my $current = $HOOKS->{collect_monitor_state}->(
        $rados,
        sub {
            my ($node, $command) = @_;
            push @queried, $command->[2];
            my ($id) = $command->[2] =~ m/^mon\.(.+)$/;
            return encode_json([
                {
                    con_type => 'client',
                    entity_name => 'client.crash',
                    global_id => $id eq 'b' ? 51 : 50,
                    socket_addr => { addr => "$node:0" },
                },
            ]);
        },
    );
    ok($current->{sessions}->{complete}, 'the fresh monitor inventory was queried completely');
    is_deeply(
        \@queried,
        ['mon.a', 'mon.b'],
        'a monitor that rejoined after startup is included in a rotation-time session sweep',
    );
}

{
    my $rados = CurrentMonitorRados->new(
        mons => [qw(a b)],
        quorum => [qw(a b)],
        metadata => [{ name => 'a', hostname => 'node-a' }],
    );
    my $current = $HOOKS->{collect_monitor_state}->(
        $rados, sub { return encode_json([]) },
    );
    ok(!$current->{sessions}->{complete}, 'missing fresh monitor metadata marks the sweep partial');
}

{
    my @inventories = (
        ['an empty monitor map', [], [], [], qr/refresh the monitor map/],
        [
            'an empty quorum',
            ['a'],
            [],
            [{ name => 'a', hostname => 'node-a' }],
            qr/refresh the monitor quorum status/,
        ],
        [
            'a foreign quorum member',
            ['a'],
            ['b'],
            [{ name => 'a', hostname => 'node-a' }],
            qr/refresh the monitor quorum status/,
        ],
    );
    for my $case (@inventories) {
        my ($label, $mons, $quorum, $metadata, $error) = @$case;
        my $rados = CurrentMonitorRados->new(
            mons => $mons,
            quorum => $quorum,
            metadata => $metadata,
        );
        eval {
            $HOOKS->{collect_monitor_state}->($rados, sub { return encode_json([]) });
        };
        like($@, $error, "$label fails closed");
    }
}

{
    my $rados = CurrentMonitorRados->new(
        mons => ['a'],
        quorum => ['a'],
        metadata => [{ name => 'a', hostname => 'node-a' }],
    );
    my $current = $HOOKS->{collect_monitor_state}->(
        $rados, sub { return encode_json({ malformed => 1 }) },
    );
    ok(!$current->{sessions}->{complete}, 'a malformed monitor session result is incomplete');
}

done_testing();
