#!/usr/bin/perl

use strict;
use warnings;

use lib ('.', '..');

use JSON qw(decode_json encode_json);
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

sub current_monitor_picture {
    my ($service_cipher) = @_;
    return {
        monmap_mons => ['a'],
        quorum => ['a'],
        monitor_metadata => [{ name => 'a', hostname => 'node-a' }],
        sessions => picture(1),
        service_cipher => $service_cipher // 'aes256k',
        preferred_cipher => 'aes256k',
        allowed_ciphers => ['aes256k'],
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
        die "simulated '$args->{prefix}' failure\n"
            if ($self->{fail_prefix} // '') eq $args->{prefix};
        return $self->{mon_dump_reply}
            if $args->{prefix} eq 'mon dump' && exists($self->{mon_dump_reply});
        return {
            mons => [map { { name => $_ } } $self->{mons}->@*],
            auth_service_cipher => { name => $self->{service_cipher} // 'aes256k' },
            auth_preferred_cipher => { name => $self->{preferred_cipher} // 'aes256k' },
            auth_allowed_ciphers =>
                [map { { name => $_ } } @{ $self->{allowed_ciphers} // ['aes256k'] }],
            }
            if $args->{prefix} eq 'mon dump';
        return { quorum_names => [$self->{quorum}->@*] }
            if $args->{prefix} eq 'quorum_status';
        return [
            map {
                { %$_ }
            } $self->{metadata}->@*
            ]
            if $args->{prefix} eq 'mon metadata';
        return $self->{auth_export_reply}
            if $args->{prefix} eq 'auth export' && exists($self->{auth_export_reply});
        return [
            map {
                { %$_ }
            } ($self->{exported} // [])->@*
            ]
            if $args->{prefix} eq 'auth export';
        return $self->{health_reply}
            if $args->{prefix} eq 'health' && exists($self->{health_reply});
        return { checks => { %{ $self->{health_checks} // {} } } }
            if $args->{prefix} eq 'health';
        if ($args->{prefix} eq 'mon set') {
            $self->{service_cipher} = $args->{value}
                if $args->{name} eq 'auth_service_cipher';
            return {};
        }
        if ($args->{prefix} eq 'auth wipe-rotating-service-keys') {
            $self->{service_cipher} = $self->{after_wipe_cipher}
                if defined($self->{after_wipe_cipher});
            return {};
        }
        die "unexpected monitor command '$args->{prefix}'\n";
    }
}

sub fresh_test_restriction_snapshot {
    my ($rados) = @_;
    return $HOOKS->{restriction_snapshot}->(
        $rados,
        sub {
            return $HOOKS->{collect_monitor_state}->(
                $rados, sub { return encode_json([]) },
            );
        },
        sub { return $NEW },
    );
}

sub restriction_is_offered {
    my ($open) = @_;
    return 1 if grep { m/--restrict-ciphers/ } $open->{next}->@*;
    return ($open->{command} // '') =~ m/--restrict-ciphers/ ? 1 : 0;
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
        $current->{monitor_metadata},
        [
            { name => 'a', hostname => 'node-a' }, { name => 'b', hostname => 'node-b' },
        ],
        'the fresh monitor metadata remains part of the current snapshot',
    );
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

sub migrated_info {
    my ($sessions) = @_;
    return {
        quorum_features => ['cephx_auth_aes256k'],
        allowed_ciphers => ['aes256k'],
        preferred_cipher => 'aes256k',
        service_cipher => 'aes256k',
        insecure_entities => {},
        health_checks => {},
        ghost_daemons => [],
        exported => { 'client.crash' => { key => $NEW } },
        sessions => $sessions,
        mon_entry => {},
        pve_mon_key => $NEW,
        monmap_mons => [],
        quorum => [],
        daemons => { mon => [], mgr => [], mds => [], osd => [] },
        lockbox => {},
    };
}

{
    my $state = { client_keys_seen => { 'client.crash' => key_fingerprint($NEW) } };
    my $verdict = $HOOKS->{preflight}->(
        migrated_info(picture(1)),
        { apply => 1, 'ack-refreshed' => ['client.unknown'] },
        0,
        $state,
    );
    cmp_ok($verdict, '<', 0, 'an unknown acknowledgment fails before the migrated no-op return');
    is($verdict == 0 ? 0 : 1, 1, 'the refused preflight verdict maps to a nonzero main status');
}

{
    my $info = migrated_info(picture(1));
    $info->{exported} = { 'client.store' => { key => $NEW, pending_key => $OLD } };
    my $state = { client_keys_seen => { 'client.store' => key_fingerprint($NEW) } };
    my $files = { 'client.store' => [{ store => 'rbd-vm' }] };
    my $verdict = $HOOKS->{preflight}->(
        $info, { apply => 0, 'rotate-storage-key' => ['rbd-vm'] }, 0, $state, $files,
    );
    cmp_ok(
        $verdict,
        '<',
        0,
        'a pending key staged for a selected storage user refuses the rotation',
    );

    $verdict = $HOOKS->{preflight}->($info, { apply => 0 }, 0, $state, $files);
    is($verdict, 0, 'a pending key for an unrelated storage user only warns');
}

{
    my $state = {
        client_keys_seen => { 'client.crash' => key_fingerprint($NEW) },
        client_refresh => {
            'client.crash' => {
                rotated => 1,
                session_ids => [45],
                cleared => 2,
                acknowledged => 2,
            },
        },
    };
    my @saved;
    my $verdict;
    {
        no warnings qw(once redefine);
        local *main::file_set_contents = sub { push @saved, [@_] };
        $verdict = $HOOKS->{preflight}->(
            migrated_info(picture(0, 45)),
            { apply => 1, 'ack-refreshed' => ['client.crash'] },
            0,
            $state,
        );
    }
    cmp_ok($verdict, '<', 0, 'a returning client in a partial poll keeps the run fail closed');
    ok(
        !defined($state->{client_refresh}->{'client.crash'}->{cleared})
            && !defined($state->{client_refresh}->{'client.crash'}->{acknowledged}),
        'positive returning-ID evidence immediately reopens both record fields',
    );
    my $persisted = decode_json($saved[-1]->[1]);
    ok(
        !defined($persisted->{client_refresh}->{'client.crash'}->{cleared})
            && !defined($persisted->{client_refresh}->{'client.crash'}->{acknowledged}),
        'apply mode persists the reopened record despite the incomplete session picture',
    );
}

{
    my $state = {
        client_keys_seen => { 'client.crash' => key_fingerprint($NEW) },
        client_refresh => {
            'client.crash' => {
                rotated => 1,
                session_ids => [46],
                cleared => 2,
                acknowledged => 2,
            },
        },
    };
    my @saved;
    {
        no warnings qw(once redefine);
        local *main::file_set_contents = sub { push @saved, [@_] };
        $HOOKS->{preflight}->(migrated_info(picture(1, 46)), { apply => 0 }, 0, $state);
    }
    my $persisted = decode_json($saved[-1]->[1]);
    ok(
        !defined($persisted->{client_refresh}->{'client.crash'}->{cleared})
            && !defined($persisted->{client_refresh}->{'client.crash'}->{acknowledged}),
        'a dry run durably reopens an acknowledged record when its exact client ID returns',
    );
}

{
    my $state = {
        client_keys_seen => { 'client.crash' => key_fingerprint($NEW) },
        client_refresh => { 'client.crash' => { rotated => 1, measurement_incomplete => 1 } },
    };
    my @saved;
    my $verdict;
    {
        no warnings qw(once redefine);
        local *main::file_set_contents = sub { push @saved, [@_] };
        $verdict = $HOOKS->{preflight}->(
            migrated_info(picture(1, 40)),
            {
                apply => 1,
                'ack-refreshed' => ['client.crash', 'client.crash'],
            },
            0,
            $state,
        );
    }
    cmp_ok($verdict, '<', 0, 'a duplicated unmeasured acknowledgment still exits nonzero');
    is(scalar(@saved), 1, 'duplicate acknowledgment options are processed only once');
    is_deeply(
        $state->{client_refresh}->{'client.crash'}->{session_ids},
        [40],
        'the one request measures the visible consumer',
    );
    ok(
        !defined($state->{client_refresh}->{'client.crash'}->{cleared}),
        'the duplicate cannot accept the record after measuring it in the same run',
    );
}

{
    my $rados = CurrentMonitorRados->new(
        mons => [qw(a b)],
        quorum => [qw(a b)],
        metadata => [{ name => 'a', hostname => 'node-a' }],
        exported => [],
    );
    my $current = $HOOKS->{collect_monitor_state}->(
        $rados, sub { return encode_json([]) },
    );
    ok(!$current->{sessions}->{complete}, 'missing fresh monitor metadata marks the sweep partial');

    my $state = { client_keys_seen => {} };
    eval {
        $HOOKS->{assert_consumers}->(
            $rados,
            $state,
            { apply => 0, force => 0 },
            'wipe the rotating service keys',
            sub { return $current },
        );
    };
    like(
        $@,
        qr/refusing to wipe.*not every monitor answered/s,
        'the wipe guard fails closed on an incomplete fresh monitor inventory',
    );
}

sub wipe_monitor_picture {
    my ($service_cipher, @ids) = @_;
    return {
        sessions => picture(1, @ids),
        service_cipher => $service_cipher // 'aes256k',
    };
}

{
    my $rados = CurrentMonitorRados->new(
        exported => [{ entity => 'client.crash', key => $NEW }],
    );
    my $state = {
        client_keys_seen => { 'client.crash' => key_fingerprint($NEW) },
        client_refresh => {
            'client.crash' => {
                rotated => 1,
                session_ids => [47],
                cleared => 2,
                acknowledged => 2,
            },
        },
    };
    my @saved;
    {
        no warnings qw(once redefine);
        local *main::file_set_contents = sub { push @saved, [@_] };
        eval {
            $HOOKS->{assert_consumers}->(
                $rados,
                $state,
                { apply => 1, force => 0 },
                'wipe the rotating service keys',
                sub { return wipe_monitor_picture('aes256k', 47) },
            );
        };
    }
    like($@, qr/refusing to wipe.*recorded live client/s, 'a returning client refuses the wipe');
    my $persisted = decode_json($saved[-1]->[1]);
    ok(
        !defined($persisted->{client_refresh}->{'client.crash'}->{cleared})
            && !defined($persisted->{client_refresh}->{'client.crash'}->{acknowledged}),
        'the action-time wipe poll durably reopens the returned client record',
    );

    eval {
        $HOOKS->{assert_consumers}->(
            $rados,
            $state,
            { apply => 1, force => 0 },
            'wipe the rotating service keys',
            sub { return wipe_monitor_picture() },
        );
    };
    like(
        $@,
        qr/refusing to wipe.*not confirmed refreshed/s,
        'a later no-session poll cannot reuse the superseded acknowledgment',
    );
}

{
    my $rados = CurrentMonitorRados->new(exported => []);
    my $state = { client_keys_seen => { 'client.crash' => key_fingerprint($NEW) } };
    eval {
        $HOOKS->{assert_consumers}->(
            $rados,
            $state,
            { apply => 1, force => 0 },
            'wipe the rotating service keys',
            sub { return wipe_monitor_picture() },
        );
    };
    like(
        $@,
        qr/refusing to wipe.*no auth entry exists/s,
        'a connected client whose auth entry disappeared blocks the wipe',
    );
}

{
    my $rados = CurrentMonitorRados->new(
        exported => [{ entity => 'client.crash', key => $NEW }],
    );
    my $state = { client_keys_seen => { 'client.crash' => key_fingerprint($NEW) } };
    eval {
        $HOOKS->{assert_consumers}->(
            $rados,
            $state,
            { apply => 1, force => 0 },
            'wipe the rotating service keys',
            sub { return wipe_monitor_picture('aes') },
        );
    };
    like(
        $@,
        qr/refusing to wipe.*regenerated with the 'aes' cipher/s,
        'the action-time service cipher must already be aes256k before the wipe',
    );
}

{
    my $rados = CurrentMonitorRados->new(
        mons => ['a'],
        exported => [{ entity => 'client.crash', key => $NEW }],
        service_cipher => 'aes256k',
        after_wipe_cipher => 'aes',
    );
    my $state = { client_keys_seen => { 'client.crash' => key_fingerprint($NEW) } };
    {
        no warnings qw(once redefine);
        local *main::file_set_contents = sub { };
        eval {
            $HOOKS->{wipe_rotating_keys}->(
                $rados,
                $state,
                { apply => 1, force => 0 },
                sub { return wipe_monitor_picture('aes256k') },
            );
        };
    }
    like(
        $@,
        qr/rotating keys were regenerated with the 'aes' cipher/,
        'the service cipher is verified again after the wipe',
    );
    is_deeply(
        [map { $_->{prefix} } $rados->{commands}->@*],
        ['auth export', 'auth wipe-rotating-service-keys', 'mon dump'],
        'the post-wipe verification immediately follows the destructive command',
    );
}

{
    my $monitor = current_monitor_picture();
    my $rados = CurrentMonitorRados->new(
        exported => [{ entity => 'client.crash', key => $NEW, pending_key => $OLD }],
    );
    my $snapshot = $HOOKS->{restriction_snapshot}->(
        $rados, sub { return $monitor }, sub { return $NEW },
    );
    is(
        $snapshot->{exported}->{'client.crash'}->{pending_key},
        $OLD,
        'the fresh restriction snapshot retains pending keys from the auth export',
    );
    is($snapshot->{pve_mon_key}, $NEW, 'the fresh restriction snapshot reads the stored mon. key');

    eval {
        $HOOKS->{restriction_snapshot}->(
            $rados, sub { return {} }, sub { return $NEW },
        );
    };
    like($@, qr/current monitor state/, 'a malformed fresh monitor result fails closed');

    my @invalid_inventories = (
        ['an empty map', { $monitor->%*, monmap_mons => [] }],
        ['an empty quorum', { $monitor->%*, quorum => [] }],
        ['a foreign quorum member', { $monitor->%*, quorum => ['b'] }],
    );
    for my $case (@invalid_inventories) {
        my ($label, $invalid) = @$case;
        eval {
            $HOOKS->{restriction_snapshot}->(
                $rados, sub { return $invalid }, sub { return $NEW },
            );
        };
        like($@, qr/current monitor state/, "$label cannot prove a restriction snapshot");
    }

    $rados = CurrentMonitorRados->new(auth_export_reply => [{}]);
    eval {
        $HOOKS->{restriction_snapshot}->(
            $rados, sub { return $monitor }, sub { return $NEW },
        );
    };
    like($@, qr/auth export is malformed/, 'a malformed fresh auth result fails closed');

    $rados = CurrentMonitorRados->new(exported => [], health_reply => { checks => [] });
    eval {
        $HOOKS->{restriction_snapshot}->(
            $rados, sub { return $monitor }, sub { return $NEW },
        );
    };
    like($@, qr/refresh the cluster health/, 'a malformed fresh health result fails closed');

    $rados = CurrentMonitorRados->new(exported => [], fail_prefix => 'health');
    eval {
        $HOOKS->{restriction_snapshot}->(
            $rados, sub { return $monitor }, sub { return $NEW },
        );
    };
    like($@, qr/simulated 'health' failure/, 'a failed fresh health query fails closed');

    $rados = CurrentMonitorRados->new(
        mon_dump_reply => { mons => [{ name => undef }] },
    );
    eval {
        $HOOKS->{collect_monitor_state}->($rados, sub { return encode_json([]) });
    };
    like($@, qr/refresh the monitor map/, 'malformed monitor-map data fails closed');
}

{
    my $rados = CurrentMonitorRados->new(
        mons => ['a'],
        quorum => ['a'],
        metadata => [{ name => 'a', hostname => 'node-a' }],
        service_cipher => 'aes',
        exported => [{ entity => 'client.crash', key => $NEW }],
        health_checks => { AUTH_INSECURE_KEYS_ALLOWED => {} },
    );
    my $state = { client_keys_seen => { 'client.crash' => key_fingerprint($NEW) } };
    my $startup = fresh_test_restriction_snapshot($rados);
    my $open = $HOOKS->{open_actions_from_snapshot}->({}, {}, $state, $startup);
    ok(!restriction_is_offered($open), 'the old startup service cipher withholds the finish');

    {
        no warnings qw(once redefine);
        local *main::file_set_contents = sub { };
        $HOOKS->{set_service_cipher}->($rados, $state);
    }
    my $fresh = fresh_test_restriction_snapshot($rados);
    $open = $HOOKS->{open_actions_from_snapshot}->({}, {}, $state, $fresh);
    ok(
        restriction_is_offered($open),
        'the service-cipher switch made by this run enables the fresh finishing offer',
    );
}

{
    my $rados = CurrentMonitorRados->new(
        mons => ['a'],
        quorum => ['a'],
        metadata => [{ name => 'a', hostname => 'node-a' }],
        service_cipher => 'aes256k',
        exported => [{ entity => 'client.crash', key => $NEW }],
        health_checks => { AUTH_INSECURE_KEYS_ALLOWED => {} },
    );
    my $baseline = { client_keys_seen => { 'client.crash' => key_fingerprint($NEW) } };
    my $startup = fresh_test_restriction_snapshot($rados);
    my $open = $HOOKS->{open_actions_from_snapshot}->({}, {}, {%$baseline}, $startup);
    ok(restriction_is_offered($open), 'the clean startup snapshot permits the finishing offer');

    my @changes = (
        [
            'an external old active key',
            [{ entity => 'client.crash', key => $OLD }],
            { AUTH_INSECURE_KEYS_ALLOWED => {} },
        ],
        [
            'an external old pending key',
            [{ entity => 'client.crash', key => $NEW, pending_key => $OLD }],
            { AUTH_INSECURE_KEYS_ALLOWED => {} },
        ],
        [
            'an external emergency override',
            [{ entity => 'client.crash', key => $NEW }],
            { AUTH_INSECURE_KEYS_ALLOWED => {}, AUTH_EMERGENCY_CIPHERS_SET => {} },
        ],
    );
    for my $change (@changes) {
        my ($label, $exported, $checks) = @$change;
        $rados->{exported} = $exported;
        $rados->{health_checks} = $checks;
        my $state = { client_keys_seen => { $baseline->{client_keys_seen}->%* } };
        my $fresh = fresh_test_restriction_snapshot($rados);
        $open = $HOOKS->{open_actions_from_snapshot}->({}, {}, $state, $fresh);
        ok(
            !restriction_is_offered($open),
            "$label added after startup prevents the fresh finishing offer",
        );
        ok(
            $state->{client_refresh}->{'client.crash'},
            'the external active-key change is reconciled before options are offered',
        ) if $label =~ m/active key/;
    }
}

{
    my $info = migrated_info(picture(1));
    $info->{service_cipher} = 'aes';
    $info->{preferred_cipher} = 'aes';
    $info->{allowed_ciphers} = [qw(aes aes256k)];
    my $state = { client_keys_seen => { 'client.crash' => key_fingerprint($NEW) } };
    my $verdict = $HOOKS->{preflight}->(
        $info,
        {
            apply => 0,
            force => 0,
            only => { mgr => 1 },
            'restrict-ciphers' => 1,
        },
        0,
        $state,
    );
    cmp_ok(
        $verdict,
        '<',
        0,
        "a scoped '--only' run cannot restrict while the service cipher remains old",
    );
}

{
    my $rados = CurrentMonitorRados->new(
        mons => ['a'],
        quorum => ['a'],
        metadata => [{ name => 'a', hostname => 'node-a' }],
        exported => [{ entity => 'client.crash', key => $NEW }],
    );
    my $monitor = current_monitor_picture('aes256k');
    $monitor->{sessions} = picture(1, 48);
    my $state = {
        client_keys_seen => { 'client.crash' => key_fingerprint($NEW) },
        client_refresh => {
            'client.crash' => {
                rotated => 1,
                session_ids => [48],
                cleared => 2,
                acknowledged => 2,
            },
        },
    };
    my @saved;
    {
        no warnings qw(once redefine);
        local *main::file_set_contents = sub { push @saved, [@_] };
        eval {
            $HOOKS->{restrict_ciphers}->(
                $rados,
                $state,
                { apply => 1, force => 0 },
                sub { return $monitor },
                sub { return $NEW },
            );
        };
    }
    like(
        $@,
        qr/refusing to restrict.*recorded live client/s,
        'a returning client refuses the action-time cipher restriction',
    );
    my $persisted = decode_json($saved[-1]->[1]);
    ok(
        !defined($persisted->{client_refresh}->{'client.crash'}->{cleared})
            && !defined($persisted->{client_refresh}->{'client.crash'}->{acknowledged}),
        'the action-time restriction poll durably reopens the returned client record',
    );

    $monitor->{sessions} = picture(1);
    eval {
        $HOOKS->{restrict_ciphers}->(
            $rados,
            $state,
            { apply => 1, force => 0 },
            sub { return $monitor },
            sub { return $NEW },
        );
    };
    like(
        $@,
        qr/refusing to restrict.*awaits '--ack-refreshed client\.crash'/s,
        'a later no-session restriction cannot reuse the superseded acknowledgment',
    );
}

{
    my $rados = CurrentMonitorRados->new(
        mons => ['a'],
        quorum => ['a'],
        metadata => [{ name => 'a', hostname => 'node-a' }],
        exported => [{ entity => 'client.crash', key => $NEW, pending_key => $OLD }],
    );
    my $monitor = current_monitor_picture('aes256k');
    my $state = { client_keys_seen => { 'client.crash' => key_fingerprint($NEW) } };
    eval {
        $HOOKS->{restrict_ciphers}->(
            $rados,
            $state,
            { apply => 1, force => 0 },
            sub { return $monitor },
            sub { return $NEW },
        );
    };
    like(
        $@,
        qr/refusing to restrict.*pending/s,
        'an old pending key staged after preflight is caught by the action-time auth export',
    );
    ok(
        !(grep { $_->{prefix} eq 'mon set' } $rados->{commands}->@*),
        'the action-time pending-key refusal happens before either cipher setting changes',
    );
}

{
    my $rados = CurrentMonitorRados->new(
        mons => ['a'],
        quorum => ['a'],
        metadata => [{ name => 'a', hostname => 'node-a' }],
        exported => [{ entity => 'client.crash', key => $NEW }],
    );
    my $monitor = current_monitor_picture('aes');
    my $state = { client_keys_seen => { 'client.crash' => key_fingerprint($NEW) } };
    eval {
        $HOOKS->{restrict_ciphers}->(
            $rados,
            $state,
            { apply => 1, force => 0 },
            sub { return $monitor },
            sub { return $NEW },
        );
    };
    like(
        $@,
        qr/refusing to restrict.*service tickets still use the 'aes' cipher/s,
        'a fresh old service cipher also blocks execution after preflight',
    );
}

done_testing();
