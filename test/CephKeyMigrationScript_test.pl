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
            return encode_json({ mon_auth_client_pending_key_auto_promote => 'true' })
                if $command->[3] eq 'config';
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
    is_deeply(
        $current->{manual_promotion},
        { supported => 1, disabled => 0, unsupported => [], unanswered => [] },
        'every monitor reporting the promotion option makes staging possible, once it is disabled',
    );
}

{
    my $rados = CurrentMonitorRados->new(
        mons => [qw(a b c)],
        quorum => [qw(a b)],
        metadata => [
            { name => 'a', hostname => 'node-a' },
            { name => 'b', hostname => 'node-b' },
            { name => 'c', hostname => 'node-c' },
        ],
    );
    my $current = $HOOKS->{collect_monitor_state}->(
        $rados,
        sub {
            my ($node, $command) = @_;
            return encode_json([]) if $command->[3] eq 'sessions';
            if ($command->[3] eq 'config') {
                return encode_json({ mon_auth_client_pending_key_auto_promote => 'false' })
                    if $node eq 'node-a';
                die "command failed on node '$node': error getting option\n";
            }
            return "ceph version 20.2.4\n" if $command->[3] eq 'version';
            die "unexpected command\n";
        },
    );
    is_deeply(
        $current->{manual_promotion},
        { supported => 0, disabled => 0, unsupported => ['b'], unanswered => ['c'] },
        'a monitor that answers without the option is old, one outside the quorum is unanswered',
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
        { apply => 1, 'confirm-clients-refreshed' => ['client.unknown'] },
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
    my $info = migrated_info(picture(1));
    $info->{allowed_ciphers} = ['aes', 'aes256k'];
    my $state = {};
    $HOOKS->{preflight}->($info, { apply => 0 }, 0, $state);
    ok(
        exists($state->{client_refresh}->{'client.crash'}),
        'a client key rotated before the tracking existed gets a seeded record',
    );
    ok(
        !exists(($state->{previous_keys} // {})->{'client.crash'}),
        'seeding leaves no previous-key stub behind for an entity the journal never knew',
    );
    is_deeply(
        [PVE::Ceph::KeyMigration::unfinished_entities($state)],
        [],
        'a seeded record does not count as an unfinished rotation',
    );
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
            { apply => 1, 'confirm-clients-refreshed' => ['client.crash'] },
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
                'confirm-clients-refreshed' => ['client.crash', 'client.crash'],
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
    my $state = {
        client_keys_seen => { 'client.crash' => key_fingerprint($NEW) },
        client_refresh => {
            'client.crash' => { rotated => 1, measurement_incomplete => 1 },
        },
    };
    my (@saved, $output);
    my $verdict;
    {
        no warnings qw(once redefine);
        local *main::file_set_contents = sub { push @saved, [@_] };
        open(my $stdout, '>', \$output) or die $!;
        local *STDOUT = $stdout;
        $verdict = $HOOKS->{preflight}->(
            migrated_info(picture(1)),
            { apply => 1, 'confirm-clients-refreshed' => ['client.crash'] },
            0,
            $state,
        );
    }
    cmp_ok($verdict, '<', 0, 'a singular confirmation first records a complete empty measurement');
    is_deeply(
        $state->{client_refresh}->{'client.crash'}->{session_ids},
        [],
        'the empty measurement is explicit in the refresh record',
    );
    ok(
        !$state->{client_refresh}->{'client.crash'}->{measurement_incomplete}
            && !defined($state->{client_refresh}->{'client.crash'}->{cleared}),
        'the complete measurement is durable without closing the record',
    );
    like(
        $output,
        qr/needed a first complete measurement; no client is currently connected.*complete empty measurement is now recorded.*Repeat the confirmation/s,
        'the refusal describes an empty measurement grammatically',
    );

    {
        no warnings qw(once redefine);
        local *main::file_set_contents = sub { push @saved, [@_] };
        $verdict = $HOOKS->{preflight}->(
            migrated_info(picture(1)),
            { apply => 1, 'confirm-clients-refreshed' => ['client.crash'] },
            0,
            $state,
        );
    }
    cmp_ok($verdict, '>=', 0, 'repeating the singular confirmation can close the measured record');
    ok(
        defined($state->{client_refresh}->{'client.crash'}->{cleared}),
        'the repeated confirmation closes it',
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
        qr/refusing to restrict.*awaits '--confirm-clients-refreshed client\.crash'/s,
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

# --- staged client keys ------------------------------------------------------------------------
{

    package StagedRotationRados;

    sub new {
        my ($class, %args) = @_;
        return bless { commands => [], config => [], %args }, $class;
    }

    sub mon_command {
        my ($self, $args) = @_;
        push $self->{commands}->@*, {%$args};
        my $prefix = $args->{prefix};
        die "simulated '$prefix' failure\n" if ($self->{fail_prefix} // '') eq $prefix;
        if ($prefix eq 'auth get') {
            return [{
                entity => $args->{entity},
                key => $self->{key},
                (defined($self->{pending}) ? (pending_key => $self->{pending}) : ()),
                caps => { mon => 'allow r' },
            }];
        }
        if ($prefix eq 'auth get-or-create-pending') {
            $self->{pending} //= $self->{pending_value} // $main::NEW;
            return [{
                entity => $args->{entity},
                key => $self->{key},
                pending_key => $self->{pending},
            }];
        }
        if ($prefix eq 'auth commit-pending') {
            $self->{key} = delete $self->{pending};
            return {};
        }
        if ($prefix eq 'auth clear-pending') {
            # a promotion that wins the race leaves nothing to clear, and Ceph says so with success
            $self->{key} = $self->{pending}
                if $self->{promote_on_clear} && defined($self->{pending});
            delete $self->{pending};
            return {};
        }
        return [
            map {
                { %$_ }
            } $self->{config}->@*
            ]
            if $prefix eq 'config dump';
        if ($prefix eq 'config set') {
            $self->{disabled} = $args->{value} eq 'false' ? 1 : 0;
            return {};
        }
        if ($prefix eq 'config rm') {
            $self->{disabled} = 0;
            return {};
        }
        die "unexpected monitor command '$prefix'\n";
    }

    sub issued {
        my ($self, $prefix) = @_;
        return scalar(grep { $_->{prefix} eq $prefix } $self->{commands}->@*);
    }
}

{

    package OrderedConfirmationRados;

    sub new {
        my ($class, @entities) = @_;
        return bless {
            commands => [],
            committed => [],
            entries => {
                map {
                    $_ => { entity => $_, key => $main::OLD, pending_key => $main::NEW }
                } @entities
            },
        }, $class;
    }

    sub mon_command {
        my ($self, $args) = @_;
        push $self->{commands}->@*, {%$args};
        my $entity = $args->{entity};
        return [{ $self->{entries}->{$entity}->%* }] if $args->{prefix} eq 'auth get';
        if ($args->{prefix} eq 'auth commit-pending') {
            $self->{entries}->{$entity}->{key} =
                delete $self->{entries}->{$entity}->{pending_key};
            push $self->{committed}->@*, $entity;
            return {};
        }
        die "unexpected monitor command '$args->{prefix}'\n";
    }
}

sub grace_collect {
    my ($rados, %override) = @_;
    return sub {
        return {
            manual_promotion => {
                supported => 1,
                disabled => $rados->{disabled} ? 1 : 0,
                unsupported => [],
                unanswered => [],
                %override,
            },
        };
    };
}

sub cp_picture {
    my ($complete, @ids) = @_;
    return {
        complete => $complete,
        clients => { 'client.cp' => [map { { global_id => $_, host => "node$_" } } @ids] },
    };
}

sub run_staging {
    my ($rados, $state, $collect, @snapshots) = @_;
    my $snapshot = sub { return shift(@snapshots) // die "unexpected extra session snapshot\n" };
    my $err;
    {
        no warnings qw(once redefine);
        local *main::file_set_contents = sub { };
        eval {
            $HOOKS->{stage_client}->(
                $rados, $state, { entity => 'client.cp', files => [] }, $snapshot, $collect,
            );
        };
        $err = $@;
    }
    return $err;
}

{
    my @entities = qw(client.admin client.zeta client.alpha);
    my $rados = OrderedConfirmationRados->new(@entities);
    my $info = migrated_info({ complete => 1, clients => {} });
    $info->{exported} = { map { $_ => { $rados->{entries}->{$_}->%* } } @entities };
    $info->{rados} = $rados;
    my $state = {
        client_keys_seen => { map { $_ => key_fingerprint($OLD) } @entities },
        client_refresh => { map { $_ => { rotated => 1, session_ids => [] } } @entities },
        staged => { map { $_ => { key => key_fingerprint($NEW), written => 1 } } @entities },
    };
    {
        no warnings qw(once redefine);
        local *main::file_set_contents = sub { };
        $HOOKS->{preflight}->(
            $info,
            {
                apply => 1,
                'confirm-clients-refreshed' =>
                    [qw(client.admin client.zeta client.alpha client.zeta)],
            },
            0,
            $state,
            {},
        );
    }
    is_deeply(
        $rados->{committed},
        [qw(client.zeta client.alpha client.admin)],
        'an explicit confirmation batch preserves user order, deduplicates, and commits admin last',
    );
}

{

    package AggregateConfirmationRados;

    sub new {
        my ($class, @entities) = @_;
        return bless {
            commands => [],
            committed => [],
            entries => {
                map {
                    $_ => { entity => $_, key => $main::OLD, pending_key => $main::NEW }
                } @entities
            },
        }, $class;
    }

    sub mon_command {
        my ($self, $args) = @_;
        push $self->{commands}->@*, {%$args};
        my $entity = $args->{entity};
        if ($args->{prefix} eq 'auth get') {
            return [{ $self->{entries}->{$entity}->%* }];
        }
        if ($args->{prefix} eq 'auth commit-pending') {
            if (($self->{fail_commit} // '') eq $entity) {
                delete $self->{fail_commit} if $self->{fail_once};
                die "simulated commit failure for '$entity'\n";
            }
            $self->{entries}->{$entity}->{key} =
                delete $self->{entries}->{$entity}->{pending_key};
            push $self->{committed}->@*, $entity;
            return {};
        }
        die "unexpected monitor command '$args->{prefix}'\n";
    }
}

sub aggregate_fixture {
    my ($sessions, @entities) = @_;
    my $rados = AggregateConfirmationRados->new(@entities);
    my $state = {
        client_keys_seen => { map { $_ => key_fingerprint($OLD) } @entities },
        client_refresh => {},
        staged => {},
    };
    for my $index (0 .. $#entities) {
        my $entity = $entities[$index];
        $state->{client_refresh}->{$entity} = { rotated => 1, session_ids => [100 + $index] };
        $state->{staged}->{$entity} = { key => key_fingerprint($NEW), written => 1 };
    }
    my $info = migrated_info($sessions);
    $info->{exported} = { map { $_ => { $rados->{entries}->{$_}->%* } } @entities };
    $info->{rados} = $rados;
    return ($rados, $info, $state);
}

sub run_aggregate_confirmation {
    my ($info, $state) = @_;
    no warnings qw(once redefine);
    local *main::file_set_contents = sub { };
    return $HOOKS->{preflight}->(
        $info, { apply => 1, 'confirm-all-clients-refreshed' => 1 }, 0, $state, {},
    );
}

{
    my ($rados, $info, $state) =
        aggregate_fixture({ complete => 1, clients => {} }, 'client.store', 'client.admin');
    my $verdict = run_aggregate_confirmation($info, $state);
    cmp_ok($verdict, '>=', 0, 'the aggregate accepts every ready open record');
    is_deeply(
        $rados->{committed},
        ['client.store', 'client.admin'],
        'all staged keys are committed with client.admin last',
    );
    ok(
        !scalar(keys $state->{staged}->%*)
            && defined($state->{client_refresh}->{'client.store'}->{cleared})
            && defined($state->{client_refresh}->{'client.admin'}->{cleared}),
        'every staged key is settled and every refresh record is closed',
    );
}

{
    my ($rados, $info, $state) =
        aggregate_fixture({ complete => 1, clients => {} }, qw(client.ready client.blocked));
    $info->{sessions}->{clients}->{'client.blocked'} =
        [{ global_id => 101, host => 'node-b' }];
    my $verdict = run_aggregate_confirmation($info, $state);
    cmp_ok($verdict, '<', 0, 'one recorded connected client refuses the aggregate');
    is_deeply($rados->{committed}, [], 'the ready staged key is not committed first');
    ok(
        !defined($state->{client_refresh}->{'client.ready'}->{cleared})
            && !defined($state->{client_refresh}->{'client.blocked'}->{cleared}),
        'neither the ready nor blocked record is closed',
    );
}

{
    my ($rados, $info, $state) =
        aggregate_fixture({ complete => 0, clients => {} }, qw(client.store client.admin));
    my ($verdict, $output);
    {
        open(my $stdout, '>', \$output) or die $!;
        local *STDOUT = $stdout;
        $verdict = run_aggregate_confirmation($info, $state);
    }
    cmp_ok($verdict, '<', 0, 'incomplete monitor responses refuse the aggregate');
    is_deeply($rados->{committed}, [], 'incomplete monitor data commits no staged key');
    my @diagnostics = $output =~ m/not every monitor answered the session query/g;
    is(
        scalar(@diagnostics),
        1,
        'one snapshot-wide diagnostic covers every entity in an incomplete aggregate request',
    );
}

{
    my ($rados, $info, $state) =
        aggregate_fixture({ complete => 1, clients => {} }, 'client.store');
    $state->{client_refresh}->{'client.store'} = {
        rotated => 1,
        measurement_incomplete => 1,
    };
    my @saved;
    my $verdict;
    {
        no warnings qw(once redefine);
        local *main::file_set_contents = sub { push @saved, [@_] };
        $verdict = $HOOKS->{preflight}->(
            $info, { apply => 1, 'confirm-all-clients-refreshed' => 1 }, 0, $state, {},
        );
    }
    cmp_ok($verdict, '<', 0, 'a record needing its first measurement refuses the aggregate');
    is_deeply(
        $state->{client_refresh}->{'client.store'}->{session_ids},
        [],
        'the complete first measurement is journalled before refusal',
    );
    ok(
        !$state->{client_refresh}->{'client.store'}->{measurement_incomplete} && scalar(@saved),
        'the measurement is durable without closing the record',
    );
    is_deeply($rados->{committed}, [], 'the newly measured staged key is not committed');
}

{
    my ($rados, $info, $state) =
        aggregate_fixture({ complete => 1, clients => {} }, 'client.store');
    delete $state->{staged}->{'client.store'}->{written};
    my $verdict = run_aggregate_confirmation($info, $state);
    cmp_ok($verdict, '<', 0, 'an unwritten managed copy refuses the aggregate');
    is_deeply($rados->{committed}, [], 'an incompletely written staged key is not committed');
    ok(
        !defined($state->{client_refresh}->{'client.store'}->{cleared}),
        'its refresh record remains open',
    );
}

{
    my ($rados, $info, $state) =
        aggregate_fixture({ complete => 1, clients => {} }, qw(client.a client.b));
    $rados->{fail_commit} = 'client.b';
    $rados->{fail_once} = 1;
    my $err = eval { run_aggregate_confirmation($info, $state); 1 } ? '' : $@;
    like($err, qr/simulated commit failure/, 'a later staged-key commit failure stops the run');
    is_deeply($rados->{committed}, ['client.a'], 'the completed staged commit stays recorded');
    ok(
        defined($state->{client_refresh}->{'client.a'}->{cleared})
            && !exists($state->{staged}->{'client.a'})
            && !defined($state->{client_refresh}->{'client.b'}->{cleared})
            && exists($state->{staged}->{'client.b'}),
        'the journal distinguishes completed and remaining work',
    );

    $info->{exported} = { map { $_ => { $rados->{entries}->{$_}->%* } } qw(client.a client.b) };
    my $verdict = run_aggregate_confirmation($info, $state);
    cmp_ok($verdict, '>=', 0, 'the aggregate retries the remaining open record');
    is_deeply($rados->{committed}, [qw(client.a client.b)], 'the retry commits only the remainder');
    ok(defined($state->{client_refresh}->{'client.b'}->{cleared}),
        'the retry closes the remainder');
}

{
    my $rados = StagedRotationRados->new(key => $OLD);
    my $state = { client_keys_seen => { 'client.cp' => key_fingerprint($OLD) } };
    my $err =
        run_staging($rados, $state, grace_collect($rados), cp_picture(1, 1), cp_picture(1, 1, 2));
    is($err, '', 'staging a client key succeeds when every monitor can hold two keys');
    is($rados->issued('config set'), 1, 'automatic promotion is disabled once for the monitors');
    is($rados->issued('auth get-or-create-pending'), 1, 'the new key is staged as pending key');
    is($rados->issued('auth rotate'), 0, 'and never replaces the active key');
    is($rados->{key}, $OLD, 'the active key is untouched');
    is($state->{staged}->{'client.cp'}->{key}, key_fingerprint($NEW), 'the staged key is recorded');
    ok($state->{staged}->{'client.cp'}->{written}, 'and marked as written to every copy');
    is($state->{previous_keys}->{'client.cp'}->{key}, $OLD, 'the previous key is journalled');
    ok(!$state->{done}->{'client.cp'}, 'a staged rotation is not done');
    is_deeply(
        $state->{client_refresh}->{'client.cp'}->{session_ids},
        [1, 2],
        'the consumers around the staging are recorded like around a replacement',
    );
    ok(exists($state->{client_grace}), 'the run remembers that it disabled automatic promotion');
    ok(!defined($state->{client_grace}->{previous}), 'with nothing explicit to put back');
    is_deeply(
        [PVE::Ceph::KeyMigration::unfinished_entities($state)],
        [],
        'a staged key waits on purpose and is not an unfinished rotation',
    );

    # a second run with the copies incomplete reuses the staged key rather than staging another
    delete $state->{staged}->{'client.cp'}->{written};
    $err = run_staging($rados, $state, grace_collect($rados));
    is($err, '', 'a rerun over a staged key succeeds without snapshots');
    is($rados->issued('auth get-or-create-pending'), 1, 'and stages nothing new');
    is($rados->issued('config set'), 1, 'nor sets the option again');
    ok($state->{staged}->{'client.cp'}->{written}, 'it only finishes the copies');

    # the confirmation commits the staged key and hands automatic promotion back
    my $mark = $state->{client_refresh}->{'client.cp'};
    my $info = migrated_info(picture(1));
    $info->{exported} = { 'client.cp' => { key => $OLD, pending_key => $NEW } };
    $info->{rados} = $rados;
    my $verdict;
    {
        no warnings qw(once redefine);
        local *main::file_set_contents = sub { };
        $verdict = $HOOKS->{preflight}->(
            $info,
            { apply => 1, 'confirm-clients-refreshed' => ['client.cp'] },
            0,
            $state,
            { 'client.cp' => [{ store => 'cp' }] },
        );
    }
    cmp_ok($verdict, '>=', 0, 'the confirmation of a staged key is accepted');
    is($rados->issued('auth commit-pending'), 1, 'and commits the staged key');
    is($rados->{key}, $NEW, 'which is the active key now');
    ok($state->{done}->{'client.cp'}, 'the rotation is done');
    ok(!exists($state->{staged}->{'client.cp'}), 'and no longer staged');
    is($state->{client_keys_seen}->{'client.cp'}, key_fingerprint($NEW), 'the fingerprint follows');
    is($rados->issued('config rm'), 1, 'the option is removed again once nothing is staged');
    ok(!exists($state->{client_grace}), 'and the run forgets it set it');
    ok(defined($mark->{cleared}), 'the consumer record is closed like after a replacement');
}

{
    my $rados = StagedRotationRados->new(key => $OLD, pending => "$NEW.foreign");
    my $state = {};
    my $err = run_staging($rados, $state, grace_collect($rados), picture(1));
    like($err, qr/did not stage/, 'a pending key staged by someone else is not written over');
    is($rados->issued('auth get-or-create-pending'), 0, 'and nothing is staged');
}

{
    my $rados = StagedRotationRados->new(key => $OLD);
    my $state = {};
    my $err = run_staging(
        $rados,
        $state,
        grace_collect($rados, supported => 0, unsupported => ['b'], unanswered => ['c']),
        picture(1),
    );
    like(
        $err,
        qr/not every monitor can keep two client keys valid.*b.*c/s,
        'a monitor without the option refuses staging by name',
    );
    is($rados->issued('config set'), 0, 'without touching the option');
}

{
    my $rados = StagedRotationRados->new(
        key => $OLD,
        config => [{
            section => 'mon',
            name => 'mon_auth_client_pending_key_auto_promote',
            value => 'true',
        }],
    );
    my $state = {};
    run_staging($rados, $state, grace_collect($rados), picture(1), picture(1));
    is($state->{client_grace}->{previous}, 'true', 'an explicit setting is remembered');
    {
        no warnings qw(once redefine);
        local *main::file_set_contents = sub { };
        $HOOKS->{release_grace}->($rados, $state);
        ok(exists($state->{client_grace}), 'the option stays disabled while a key is staged');
        delete $state->{staged}->{'client.cp'};
        $HOOKS->{release_grace}->($rados, $state);
    }
    my ($restore) =
        grep { $_->{prefix} eq 'config set' && $_->{value} eq 'true' } $rados->{commands}->@*;
    ok($restore, 'and put back as it was once nothing is staged');
    is($rados->issued('config rm'), 0, 'rather than removed');
}

{
    my $fp = key_fingerprint($NEW);
    my $rados = StagedRotationRados->new(key => $NEW);
    my $state = { staged => { 'client.cp' => { key => $fp } }, client_grace => {} };
    my $committed;
    {
        no warnings qw(once redefine);
        local *main::file_set_contents = sub { };
        $committed = $HOOKS->{commit_staged}->($rados, $state, 'client.cp');
    }
    ok(
        $committed && !exists($state->{staged}->{'client.cp'}),
        'a staged key that is already active is settled without a commit',
    );
    is($rados->issued('auth commit-pending'), 0, 'as there is nothing left to commit');

    $rados = StagedRotationRados->new(key => $OLD);
    $state = { staged => { 'client.cp' => { key => $fp } } };
    my $err;
    {
        no warnings qw(once redefine);
        local *main::file_set_contents = sub { };
        eval { $HOOKS->{commit_staged}->($rados, $state, 'client.cp') };
        $err = $@;
    }
    like($err, qr/gone without becoming active/, 'a lost staged key cannot be confirmed away');
    ok(exists($state->{staged}->{'client.cp'}), 'and keeps its record');
}

{
    my $fp = key_fingerprint($NEW);
    my $rados = StagedRotationRados->new(key => $OLD, pending => $NEW);
    my $state = {
        staged => { 'client.cp' => { key => $fp, written => 1 } },
        previous_keys => { 'client.cp' => { key => $OLD } },
        client_refresh => { 'client.cp' => { session_ids => [7] } },
        client_grace => {},
    };
    {
        no warnings qw(once redefine);
        local *main::file_set_contents = sub { };
        $HOOKS->{abort_staged}->($rados, $state, 'client.cp', { 'client.cp' => [] });
    }
    is($rados->issued('auth clear-pending'), 1, 'aborting drops the staged key');
    is($rados->{key}, $OLD, 'and leaves the current key active');
    ok(
        !exists($state->{staged}->{'client.cp'})
            && !exists($state->{client_refresh}->{'client.cp'}),
        'its records are gone with it',
    );

    my $err = eval { $HOOKS->{abort_staged}->($rados, $state, 'client.cp', {}); 1 } ? '' : $@;
    like($err, qr/no key is staged/, 'there is nothing to abort twice');
}

{
    my $fp = key_fingerprint($NEW);
    my $files = { 'client.cp' => [{ store => 'cp' }] };
    my $state = { staged => { 'client.cp' => { key => $fp, written => 1 } }, client_grace => {} };
    my $rados = StagedRotationRados->new(key => $NEW);
    {
        no warnings qw(once redefine);
        local *main::file_set_contents = sub { };
        $HOOKS->{settle_staged}->(
            $rados,
            { exported => { 'client.cp' => { key => $NEW } } },
            $state,
            { apply => 0 },
            $files,
        );
        ok(
            exists($state->{staged}->{'client.cp'}),
            'a dry run only reports a key promoted elsewhere',
        );
        $HOOKS->{settle_staged}->(
            $rados,
            { exported => { 'client.cp' => { key => $NEW } } },
            $state,
            { apply => 1 },
            $files,
        );
    }
    ok(
        !exists($state->{staged}->{'client.cp'}) && $state->{done}->{'client.cp'},
        'an apply run closes a record whose key was promoted elsewhere',
    );
    is($rados->issued('config rm'), 1, 'and hands automatic promotion back');

    $state = {
        staged => { 'client.cp' => { key => $fp, written => 1 } },
        previous_keys => { 'client.cp' => { key => $OLD, saved => 3 } },
    };
    {
        no warnings qw(once redefine);
        local *main::file_set_contents = sub { };
        $HOOKS->{settle_staged}->(
            $rados,
            { exported => { 'client.cp' => { key => $OLD } } },
            $state,
            { apply => 1 },
            $files,
        );
    }
    ok(!exists($state->{staged}->{'client.cp'}), 'a lost staged key drops its record');
    is_deeply(
        [PVE::Ceph::KeyMigration::unfinished_entities($state)],
        ['client.cp'],
        'and the rotation counts as unfinished again, so the option to redo it is named',
    );
}

{
    my $info = migrated_info(picture(1));
    $info->{exported} = { 'client.store' => { key => $OLD, pending_key => $NEW } };
    my $state = {
        client_keys_seen => { 'client.store' => key_fingerprint($OLD) },
        staged => { 'client.store' => { key => key_fingerprint($NEW), written => 1 } },
        client_refresh => { 'client.store' => { rotated => 1, session_ids => [] } },
    };
    my $files = { 'client.store' => [{ store => 'rbd-vm' }] };
    my $verdict;
    {
        no warnings qw(once redefine);
        local *main::file_set_contents = sub { };
        $verdict = $HOOKS->{preflight}->(
            $info, { apply => 0, 'rotate-storage-key' => ['rbd-vm'] }, 0, $state, $files,
        );
    }
    cmp_ok($verdict, '>=', 0, 'a pending key this script staged does not refuse the run');
}

# --- what the review of the staged flow asked for --------------------------------------------
{
    # a confirmation must not commit a staged key whose copies are not all written
    my $fp = key_fingerprint($NEW);
    my $rados = StagedRotationRados->new(key => $OLD, pending => $NEW);
    my $info = migrated_info(picture(1));
    $info->{exported} = { 'client.cp' => { key => $OLD, pending_key => $NEW } };
    $info->{rados} = $rados;
    my $state = {
        client_keys_seen => { 'client.cp' => key_fingerprint($OLD) },
        staged => { 'client.cp' => { key => $fp } },
        client_refresh => { 'client.cp' => { rotated => 1, session_ids => [] } },
    };
    my $verdict;
    {
        no warnings qw(once redefine);
        local *main::file_set_contents = sub { };
        $verdict = $HOOKS->{preflight}->(
            $info,
            { apply => 1, 'confirm-clients-refreshed' => ['client.cp'] },
            0,
            $state,
            { 'client.cp' => [{ store => 'cp' }] },
        );
    }
    cmp_ok($verdict, '<', 0, 'a staged key with unwritten copies is not confirmed');
    is($rados->issued('auth commit-pending'), 0, 'and not committed');
    ok(!defined($state->{client_refresh}->{'client.cp'}->{cleared}), 'its record stays open');
}

{
    # a failed commit leaves the confirmation to be repeated
    my $fp = key_fingerprint($NEW);
    my $rados = StagedRotationRados->new(
        key => $OLD,
        pending => $NEW,
        fail_prefix => 'auth commit-pending',
    );
    my $info = migrated_info(picture(1));
    $info->{exported} = { 'client.cp' => { key => $OLD, pending_key => $NEW } };
    $info->{rados} = $rados;
    my $state = {
        client_keys_seen => { 'client.cp' => key_fingerprint($OLD) },
        staged => { 'client.cp' => { key => $fp, written => 1 } },
        client_refresh => { 'client.cp' => { rotated => 1, session_ids => [] } },
    };
    my $err;
    {
        no warnings qw(once redefine);
        local *main::file_set_contents = sub { };
        eval {
            $HOOKS->{preflight}->(
                $info,
                { apply => 1, 'confirm-clients-refreshed' => ['client.cp'] },
                0,
                $state,
                { 'client.cp' => [{ store => 'cp' }] },
            );
        };
        $err = $@;
    }
    like($err, qr/simulated 'auth commit-pending' failure/, 'a failing commit fails the run');
    ok(!defined($state->{client_refresh}->{'client.cp'}->{cleared}), 'without closing the record');
    ok(exists($state->{staged}->{'client.cp'}), 'and the staged key stays recorded');
}

{
    # a dry run reports a leftover option but leaves the cluster configuration alone
    my $rados = StagedRotationRados->new(key => $NEW, disabled => 1);
    my $info = migrated_info(picture(1));
    $info->{exported} = { 'client.cp' => { key => $NEW } };
    $info->{rados} = $rados;
    my $state =
        { client_keys_seen => { 'client.cp' => key_fingerprint($NEW) }, client_grace => {} };
    {
        no warnings qw(once redefine);
        local *main::file_set_contents = sub { };
        $HOOKS->{preflight}->($info, { apply => 0 }, 0, $state, {});
        $HOOKS->{settle_staged}->($rados, $info, $state, { apply => 0 }, {});
    }
    is($rados->issued('config rm') + $rados->issued('config set'), 0,
        'a dry run changes no option');
    ok(exists($state->{client_grace}), 'and keeps the record of who set it');
    {
        no warnings qw(once redefine);
        local *main::file_set_contents = sub { };
        $HOOKS->{settle_staged}->($rados, $info, $state, { apply => 1 }, {});
    }
    is($rados->issued('config rm'), 1, 'an apply run puts a leftover option back');
    ok(!exists($state->{client_grace}), 'and forgets it');
}

{
    # a waiting rotation is only safe while every monitor keeps the option disabled
    my $fp = key_fingerprint($NEW);
    my $files = { 'client.cp' => [{ store => 'cp' }] };
    my $exported = { 'client.cp' => { key => $OLD, pending_key => $NEW } };
    my $state = { staged => { 'client.cp' => { key => $fp, written => 1 } }, client_grace => {} };

    my $rados = StagedRotationRados->new(key => $OLD, pending => $NEW);
    my $enabled = {
        exported => $exported,
        manual_promotion =>
            { supported => 1, disabled => 0, unsupported => [], unanswered => [] },
    };
    {
        no warnings qw(once redefine);
        local *main::file_set_contents = sub { };
        $HOOKS->{settle_staged}->($rados, $enabled, $state, { apply => 0 }, $files);
        is($rados->issued('config set'), 0, 'a dry run only warns about a re-enabled option');
        $HOOKS->{settle_staged}
            ->($rados, $enabled, $state, { apply => 1 }, $files, grace_collect($rados));
    }
    is($rados->issued('config set'), 1, 'an apply run disables it again while a key is staged');

    $rados = StagedRotationRados->new(key => $OLD, pending => $NEW, disabled => 1);
    my $lost_support = {
        exported => $exported,
        manual_promotion =>
            { supported => 0, disabled => 0, unsupported => ['b'], unanswered => [] },
    };
    {
        no warnings qw(once redefine);
        local *main::file_set_contents = sub { };
        $HOOKS->{settle_staged}
            ->($rados, $lost_support, $state, { apply => 1 }, $files, grace_collect($rados));
    }
    is($rados->issued('config set'), 0, 'an old monitor cannot be made to hold the option');
    ok(exists($state->{staged}->{'client.cp'}), 'the endangered rotation is reported, not closed');
}

{
    # a key promoted elsewhere before every copy was written has those copies rewritten
    my $fp = key_fingerprint($NEW);
    my $files = {
        'client.cp' =>
            [{ path => '/etc/pve/priv/ceph/cp.keyring', format => 'keyring', scope => 'cluster' }],
    };
    my $state = { staged => { 'client.cp' => { key => $fp } }, client_grace => {} };
    my $rados = StagedRotationRados->new(key => $NEW, disabled => 1);
    my $info = {
        exported => { 'client.cp' => { key => $NEW } },
        manual_promotion => { supported => 1, disabled => 1 },
    };
    my @saved;
    {
        no warnings qw(once redefine);
        local *main::file_set_contents = sub { push @saved, [@_] };
        $HOOKS->{settle_staged}->($rados, $info, $state, { apply => 0 }, $files);
        is(scalar(grep { $_->[0] =~ m/cp\.keyring/ } @saved), 0, 'a dry run rewrites nothing');
        $HOOKS->{settle_staged}->($rados, $info, $state, { apply => 1 }, $files);
    }
    my ($copy) = grep { $_->[0] =~ m/cp\.keyring/ } @saved;
    ok($copy && $copy->[1] =~ m/\Q$NEW\E/, 'an apply run writes the promoted key into the copies');
    ok(
        $state->{done}->{'client.cp'} && !exists($state->{staged}->{'client.cp'}),
        'and closes the rotation',
    );
}

{
    # an abort that loses the race against a promotion ends with the promoted key in every copy
    my $fp = key_fingerprint($NEW);
    my $files = {
        'client.cp' =>
            [{ path => '/etc/pve/priv/ceph/cp.keyring', format => 'keyring', scope => 'cluster' }],
    };
    my $rados = StagedRotationRados->new(key => $OLD, pending => $NEW, promote_on_clear => 1);
    my $state = {
        staged => { 'client.cp' => { key => $fp, written => 1 } },
        previous_keys => { 'client.cp' => { key => $OLD } },
        client_refresh => { 'client.cp' => { session_ids => [7] } },
    };
    my @saved;
    {
        no warnings qw(once redefine);
        local *main::file_set_contents = sub { push @saved, [@_] };
        $HOOKS->{abort_staged}->($rados, $state, 'client.cp', $files);
    }
    my @copies = map { $_->[1] } grep { $_->[0] =~ m/cp\.keyring/ } @saved;
    is(scalar(@copies), 2, 'the copies are written twice: the current key, then the promoted one');
    like($copies[0], qr/\Q$OLD\E/, 'first with the key that was current');
    like($copies[1], qr/\Q$NEW\E/, 'then with the key the monitors promoted meanwhile');
    ok(
        $state->{done}->{'client.cp'} && !exists($state->{staged}->{'client.cp'}),
        'the rotation counts as done rather than aborted',
    );
    is($rados->{key}, $NEW, 'and the active key is the promoted one');
}

{
    # an abort interrupted after its journal entry is finished by the next apply run
    my $fp = key_fingerprint($NEW);
    my $files = { 'client.cp' => [] };
    my $rados = StagedRotationRados->new(key => $OLD, pending => $NEW, disabled => 1);
    my $state = {
        staged => { 'client.cp' => { key => $fp, aborting => 5 } },
        previous_keys => { 'client.cp' => { key => $OLD } },
        client_grace => {},
    };
    my $info = {
        exported => { 'client.cp' => { key => $OLD, pending_key => $NEW } },
        manual_promotion => { supported => 1, disabled => 1 },
    };
    {
        no warnings qw(once redefine);
        local *main::file_set_contents = sub { };
        $HOOKS->{settle_staged}->($rados, $info, $state, { apply => 0 }, $files);
        is($rados->issued('auth clear-pending'), 0, 'a dry run leaves an interrupted abort alone');
        $HOOKS->{settle_staged}->($rados, $info, $state, { apply => 1 }, $files);
    }
    is($rados->issued('auth clear-pending'), 1, 'an apply run finishes the interrupted abort');
    ok(!exists($state->{staged}->{'client.cp'}), 'and drops its record');
    is($rados->issued('config rm'), 1, 'then hands automatic promotion back');
}

{
    # a staged key of the wrong cipher is dropped again, and stays owned if that fails
    my $rados = StagedRotationRados->new(key => $OLD, pending_value => $OLD);
    my $state = {};
    my $err = run_staging($rados, $state, grace_collect($rados), picture(1));
    like($err, qr/dropped again/, 'a pending key of the wrong cipher is dropped');
    is($rados->issued('auth clear-pending'), 1, 'through the monitors');
    ok(!exists($state->{staged}->{'client.cp'}), 'and leaves no record behind');

    $rados = StagedRotationRados->new(
        key => $OLD,
        pending_value => $OLD,
        fail_prefix => 'auth clear-pending',
    );
    $state = {};
    $err = run_staging($rados, $state, grace_collect($rados), picture(1));
    like($err, qr/could not be dropped again.*by hand/s, 'a drop that fails names the manual step');
    is(
        $state->{staged}->{'client.cp'}->{key},
        key_fingerprint($OLD),
        'and keeps the ownership record',
    );
    $err = run_staging($rados, $state, grace_collect($rados));
    like($err, qr/uses the 'aes' cipher.*by hand/s,
        'a rerun refuses to reuse the wrong-cipher key');
}

{
    # a key already staged is never replaced at once when the monitors lost the option
    my $fp = key_fingerprint($NEW);
    my $rados = StagedRotationRados->new(key => $OLD, pending => $NEW);
    my $state = { staged => { 'client.cp' => { key => $fp } }, client_grace => {} };
    my $err = run_staging(
        $rados, $state, grace_collect($rados, supported => 0, unsupported => ['b']),
    );
    like(
        $err,
        qr/cannot be finished.*--abort-staged-key client\.cp/s,
        'finishing its copies is refused with the way out named',
    );
    is(
        $rados->issued('auth rotate') + $rados->issued('auth get-or-create-pending'),
        0,
        'and nothing else is staged or rotated',
    );
    ok(exists($state->{staged}->{'client.cp'}), 'the record stays for the abort');
}

{
    # an abort is work of its own, so a migrated cluster does not answer it with a no-op
    my $info = migrated_info(picture(1));
    my $verdict;
    {
        no warnings qw(once redefine);
        local *main::file_set_contents = sub { };
        $verdict = $HOOKS->{preflight}->(
            $info,
            { apply => 1, 'abort-staged-key' => ['client.cp'] },
            0,
            { client_keys_seen => { 'client.crash' => key_fingerprint($NEW) } },
            {},
        );
    }
    cmp_ok($verdict, '>', 0, 'a run asked to abort a staged key gets past the no-op return');
}

{
    # the main orchestration rejects an abort plus rotation before it connects to Ceph
    my $connected = 0;
    my $err;
    {
        no warnings qw(once redefine);
        local *PVE::RPCEnvironment::setup_default_cli_env = sub { };
        local *PVE::Ceph::Tools::check_ceph_inited = sub { };
        local *PVE::Ceph::Tools::get_config = sub { '/etc/pve/ceph.conf' };
        local *PVE::Storage::config = sub {
            return { ids => { cp => { type => 'rbd', username => 'cp' } } };
        };
        local *PVE::Ceph::Services::ResilientRados::new = sub {
            $connected = 1;
            die "unexpected monitor connection\n";
        };
        eval {
            $HOOKS->{run_migration}->({
                apply => 1,
                'abort-staged-key' => ['client.cp'],
                'rotate-storage-key' => ['cp'],
            });
        };
        $err = $@;
    }
    like($err, qr/contradicts the rotation option/, 'main rejects the contradictory operations');
    is($connected, 0, 'before opening a monitor connection');
}

{
    # a staged admin key is not an interrupted replacement: repairing the keyring from the active
    # key would put the previous key back and, after the commit, lock the command line out
    my $fp = key_fingerprint($NEW);
    my $staged = {
        previous_keys => { 'client.admin' => { key => $OLD, saved => 5 } },
        staged => { 'client.admin' => { key => $fp, written => 6 } },
    };
    ok(
        !$HOOKS->{admin_rotation_unfinished}->($staged),
        'a staged client.admin rotation needs no admin keyring repair',
    );
    delete $staged->{staged};
    ok(
        $HOOKS->{admin_rotation_unfinished}->($staged),
        'while a replacement without a done marker still does',
    );
}

{
    # one option selects every cluster-owned key without selecting client decisions or finalization
    my $selected = { 'rotate-cluster-keys' => 1, apply => 0 };
    $HOOKS->{expand_cluster_key_option}->($selected);
    is_deeply(
        {
            map { $_ => $selected->{$_} // 0 }
                qw(
                rotate-mon-key rotate-client-keys rotate-lockbox-keys
                rotate-admin-key rotate-storage-key restrict-ciphers wipe-rotating-keys
                )
        },
        {
            'rotate-mon-key' => 1,
            'rotate-client-keys' => 1,
            'rotate-lockbox-keys' => 1,
            'rotate-admin-key' => 0,
            'rotate-storage-key' => 0,
            'restrict-ciphers' => 0,
            'wipe-rotating-keys' => 0,
        },
        'the cluster key option includes only work that needs no client decision',
    );

    my $apply = { 'rotate-cluster-keys' => 1, apply => 1 };
    $HOOKS->{expand_cluster_key_option}->($apply);
    is_deeply(
        [map { $apply->{$_} } qw(rotate-mon-key rotate-client-keys rotate-lockbox-keys)],
        [map { $selected->{$_} } qw(rotate-mon-key rotate-client-keys rotate-lockbox-keys)],
        'a dry run and an apply run select the same keys',
    );

    my $individual = { 'rotate-mon-key' => 1 };
    $HOOKS->{expand_cluster_key_option}->($individual);
    is_deeply($individual, { 'rotate-mon-key' => 1 }, 'individual options stay unchanged');

    my $limited = { 'rotate-cluster-keys' => 1, only => ['osd'] };
    my $err = eval { $HOOKS->{expand_cluster_key_option}->($limited); 1 } ? '' : $@;
    like($err, qr/cannot be combined with '--only'/, 'the aggregate cannot become a partial run');
    like(
        $HOOKS->{usage}->(),
        qr/--rotate-cluster-keys.*cluster-owned.*Does not select 'client\.admin',.*Ceph storage users, ticket wipes, or cipher restriction/s,
        'the help names the aggregate and its exclusions',
    );

    local @ARGV = qw(--rotate-cluster-keys --only osd);
    $err = eval { $HOOKS->{parse_options}->(); 1 } ? '' : $@;
    like($err, qr/cannot be combined with '--only'/, 'the command line accepts the aggregate');
}

{
    my $state = { client_keys_seen => { 'client.crash' => key_fingerprint($OLD) } };
    my $rados = ClientRotationRados->new($OLD);
    my $output = '';
    {
        open(my $stdout, '>', \$output) or die $!;
        local *STDOUT = $stdout;
        run_client_rotation($rados, $state, picture(1, 501), picture(1, 501));
    }
    like(
        $output,
        qr/remained connected through the immediate replacement.*next reconnect can fail immediately.*only an upper bound.*Live-migrate/s,
        'post-apply advice is remedial and does not promise a grace period',
    );
}

{
    # Contradicting requests are refused before the cluster is touched.
    local @ARGV = qw(--apply --confirm-clients-refreshed client.cp --abort-staged-key client.cp);
    my $err = eval { $HOOKS->{parse_options}->(); 1 } ? '' : $@;
    like(
        $err,
        qr/contradict each other for client\.cp/,
        'confirming and aborting the same key is refused',
    );
}

{
    my $help = $HOOKS->{usage}->();
    like($help, qr/--confirm-clients-refreshed USER/, 'help uses the public USER placeholder');
    unlike(
        $help,
        qr/--confirm-clients-refreshed ENTITY/,
        'help does not expose the internal entity term for the per-user option',
    );
    my ($per_user_help) =
        $help =~ m/(--confirm-clients-refreshed USER.*?)(?=\n  --confirm-all-clients-refreshed)/s;
    like(
        $per_user_help // '',
        qr/disconnected consumers.*key copies.*outside\s+Proxmox VE/s,
        'per-user help states the trust boundary outside Proxmox VE',
    );
    like(
        $per_user_help // '',
        qr/For a staged key,\s+this commits the new key/s,
        'per-user help explains how staged keys are committed',
    );
    like($help, qr/--confirm-all-clients-refreshed/, 'help names the aggregate confirmation');
    my ($aggregate_help) =
        $help =~ m/(--confirm-all-clients-refreshed.*?)(?=\n  --restrict-ciphers)/s;
    like(
        $aggregate_help // '',
        qr/every open Ceph user key refresh record.*operator confirms.*disconnected consumers.*key copies.*outside\s+Proxmox VE/s,
        'aggregate help names open refresh records and the operator trust boundary',
    );
    like(
        $help,
        qr/staged next to each other.*--confirm-clients-refreshed.*once\s+every open record is ready.*--confirm-all-clients-refreshed/s,
        'staged-key help names per-user and conditionally ready aggregate completion',
    );
    like($help, qr/--verbose/, 'help names verbose plan output');

    {
        local @ARGV = qw(--verbose --help);
        open(my $stdout, '>', \my $output) or die $!;
        local *STDOUT = $stdout;
        my ($opts, $status) = $HOOKS->{parse_options}->();
        is($status, 0, 'the parser accepts verbose');
        like($output, qr/--verbose/, 'verbose remains visible in parser help output');
    }

    {
        local @ARGV = ('--ack-refreshed', 'client.cp');
        open(my $stderr, '>', \my $errors) or die $!;
        local *STDERR = $stderr;
        my ($opts, $status) = $HOOKS->{parse_options}->();
        is($status, 1, 'the obsolete option is rejected by the parser');
        ok(!defined($opts), 'a rejected obsolete option produces no option set');
    }

    for my $case (
        [
            [qw(--confirm-clients-refreshed client.cp)],
            qr/confirm-clients-refreshed.*needs '--apply'/,
            'the per-user confirmation requires apply',
        ],
        [
            [qw(--confirm-all-clients-refreshed)],
            qr/confirm-all-clients-refreshed.*needs.*--apply/s,
            'the aggregate confirmation requires apply',
        ],
    ) {
        local @ARGV = $case->[0]->@*;
        my $err = eval { $HOOKS->{parse_options}->(); 1 } ? '' : $@;
        like($err, $case->[1], $case->[2]);
    }
}

{
    for my $case (
        [
            [qw(
                --apply --confirm-all-clients-refreshed
                --confirm-clients-refreshed client.cp
            )],
            qr/cannot be combined with '--confirm-clients-refreshed'/,
            'aggregate plus per-user confirmation',
        ],
        [
            [qw(
                --apply --confirm-all-clients-refreshed
                --abort-staged-key client.cp
            )],
            qr/cannot be combined with '--abort-staged-key'/,
            'aggregate plus abort',
        ],
    ) {
        my ($entered_run, $connected, $locked) = (0, 0, 0);
        no warnings qw(once redefine);
        local *PVE::RPCEnvironment::setup_default_cli_env = sub { $entered_run++ };
        local *PVE::Ceph::Services::ResilientRados::new = sub { $connected++ };
        local *PVE::Ceph::KeyMigration::ClusterLock::take = sub { $locked++ };
        local @ARGV = $case->[0]->@*;
        my $err = eval { $HOOKS->{main}->(); 1 } ? '' : $@;
        like($err, $case->[1], "$case->[2] is rejected");
        is_deeply(
            [$entered_run, $connected, $locked],
            [0, 0, 0],
            "$case->[2] is rejected before setup, RADOS, or locks",
        );
    }
}

{
    my $client_health = sub {
        return {
            AUTH_INSECURE_CLIENT_KEY_TYPE => {
                detail => [map { { message => "entity $_ using insecure key type: aes" } } @_],
            },
        };
    };
    my $info = {
        insecure_entities => { 'osd.7' => 'aes' },
        health_checks => $client_health->(qw(client.store client.admin)),
        allowed_ciphers => [qw(aes aes256k)],
        preferred_cipher => 'aes',
        mon_key_in_auth_db => 0,
        manual_promotion => { supported => 1, disabled => 0 },
        sessions => {
            complete => 1,
            clients => {
                'client.store' => [{ global_id => 9, host => 'node-client' }],
            },
        },
        daemons => {
            mon => [],
            mgr => [],
            mds => [],
            osd => [{ type => 'osd', id => 7, entity => 'osd.7', node => 'node-daemon' }],
        },
    };
    my $plan = {
        mon_key => 0,
        daemons => [$info->{daemons}->{osd}->@*],
        client_keys => [
            {
                entity => 'client.store',
                reason => "used by storage 'store'",
                files => [{ path => '/etc/pve/priv/ceph/store.keyring' }],
                staged => 1,
                kernel => 1,
            },
            {
                entity => 'client.admin',
                reason => 'asked for with --rotate-admin-key',
                files => [{ path => '/etc/pve/priv/ceph.client.admin.keyring' }],
                staged => 0,
                kernel => 0,
            },
        ],
        lockbox_keys => [{
            entity => 'client.osd-lockbox.1234',
            node => 'node-daemon',
            device => '/dev/mapper/osd-block-1234',
        }],
        service_cipher => 1,
        stages_pending_keys => 1,
    };
    my $opts = {
        'rotate-admin-key' => 1,
        'rotate-storage-key' => ['store'],
        'wipe-rotating-keys' => 1,
        'restrict-ciphers' => 1,
        'restart-daemons' => 0,
    };
    my $render = sub {
        my (
            $verbose,
            $selected_plan,
            $selected_opts,
            $selected_storage_entities,
            $selected_info,
        ) = @_;
        $selected_plan //= $plan;
        $selected_opts //= $opts;
        $selected_storage_entities //= {
            'client.admin' => ['default-rbd'],
            'client.store' => ['store'],
        };
        $selected_info //= $info;
        my $output = '';
        open(my $stdout, '>', \$output) or die $!;
        local *STDOUT = $stdout;
        $HOOKS->{print_plan}->(
            $selected_info,
            $selected_plan,
            {},
            { %$selected_opts, verbose => $verbose },
            $selected_storage_entities,
        );
        return $output;
    };

    my $concise = $render->(0);
    like($concise, qr/Why HEALTH_ERR.*hence HEALTH_ERR/s, 'the default keeps the health reason');
    unlike(
        $concise,
        qr/Ceph user keys not selected:[^\n]*'client\.admin'/,
        'the default does not call a selected Ceph user untouched',
    );
    unlike(
        $concise,
        qr/Additional actions not selected:/,
        'the default does not call selected ticket wiping and cipher restriction untouched',
    );
    like(
        $concise,
        qr/Step 1: rotate 1 OSD key.*Step 2: rotate 2 selected Ceph user keys.*Step 3: rotate the lockbox key of 1 encrypted OSD/s,
        'the default keeps numbered category counts with natural plurals',
    );
    like(
        $concise,
        qr/Ceph user 'client\.store': staged next to the current key.*Ceph user 'client\.admin': replaced at once/s,
        'the default lists every selected Ceph user and puts client.admin last',
    );
    like(
        $concise,
        qr/For each staged Ceph user key, both the current and new keys authenticate.*committed with '--confirm-clients-refreshed USER' or, once every open record is ready, '--confirm-all-clients-refreshed'/s,
        'the default names both staged completion paths without offering the aggregate early',
    );
    like(
        $concise,
        qr/For each Ceph user marked 'replaced at once'.*stop every consumer before applying.*Apply the replacement only after all are stopped.*update every key copy outside Proxmox VE.*restart the consumers.*removes the active key immediately.*reconnect can fail as soon as the key changes.*monitor-ticket expiry is only an upper bound/s,
        'the default gives the safe replace-at-once sequence before apply',
    );
    unlike(
        $concise,
        qr/old key.*must then be refreshed/s,
        'the default does not defer the replace-at-once prerequisite until after apply',
    );
    unlike($concise, qr/key\(s\)/, 'the default uses natural singular and plural key wording');
    my $single = $render->(
        0,
        {
            %$plan,
            daemons => [],
            client_keys => [$plan->{client_keys}->[0]],
            lockbox_keys => [],
            service_cipher => 0,
        },
        {
            'rotate-storage-key' => ['store'],
            'restart-daemons' => 0,
        },
    );
    like(
        $single,
        qr/Step 1: rotate 1 selected Ceph user key\b/,
        'the default renders the singular Ceph user key label',
    );
    like(
        $concise,
        qr/stopped, rotated and started again.*stop every consumer.*No OSD is stopped/s,
        'the default keeps restart and disruption effects',
    );
    like($concise, qr/records migration progress/, 'the default keeps the journal warning');
    unlike($concise, qr/osd\.7 on node-daemon/, 'the default hides full daemon inventory');
    unlike(
        $concise,
        qr{/etc/pve/priv/ceph(?:/store|\.client\.admin)\.keyring},
        'the default hides keyring paths',
    );
    unlike(
        $concise,
        qr/client\.osd-lockbox\.1234|osd-block-1234/,
        'the default hides lockbox identity and device rows',
    );
    unlike($concise, qr/ceph (?:mon set|auth wipe)/, 'the default hides equivalent Ceph commands');
    unlike(
        $concise,
        qr/'auth_preferred_cipher' \(currently/,
        'the default hides preferred-cipher lifecycle detail',
    );

    my $scope = $render->(
        0,
        {
            mon_key => 0,
            daemons => [],
            client_keys => [],
            lockbox_keys => [],
            service_cipher => 0,
            stages_pending_keys => 0,
        },
        { 'restart-daemons' => 0 },
        { 'client.admin' => ['local-rbd'] },
        { %$info, health_checks => $client_health->(qw(client.crash client.admin)) },
    );
    like(
        $scope,
        qr/Not touched by this run:.*Ceph user keys not selected: bootstrap and crash users; 'client\.admin'\..*Other keys not selected: the shared 'mon\.' key; encrypted OSD lockbox keys\..*Additional actions not selected: service-ticket wiping; cipher restriction\./s,
        'the default states unselected key scope and final actions',
    );
    unlike(
        $scope,
        qr/dedicated storage users/,
        'the default names no storage user when no dedicated one is configured',
    );

    my $empty_plan = {
        mon_key => 0,
        daemons => [],
        client_keys => [],
        lockbox_keys => [],
        service_cipher => 0,
        stages_pending_keys => 0,
    };
    my $fully_migrated = $render->(
        0,
        $empty_plan,
        { 'restart-daemons' => 0 },
        {
            'client.admin' => ['default-rbd'],
            'client.store' => ['rbd-a'],
        },
        { %$info, health_checks => {} },
    );
    unlike(
        $fully_migrated,
        qr/Ceph user keys not selected:/,
        'a fully migrated cluster lists no Ceph users as open old-cipher work',
    );

    my $shared_selected = $render->(
        0,
        $empty_plan,
        { 'restart-daemons' => 0, 'rotate-storage-key' => ['rbd-a'] },
        { 'client.shared' => [qw(rbd-a rbd-b)] },
        { %$info, health_checks => $client_health->('client.shared') },
    );
    unlike(
        $shared_selected,
        qr/dedicated storage users/,
        'selecting one storage selects its shared dedicated Ceph user',
    );

    my $one_unselected = $render->(
        0,
        $empty_plan,
        { 'restart-daemons' => 0, 'rotate-storage-key' => ['rbd-b'] },
        {
            'client.admin' => ['default-rbd'],
            'client.other' => ['rbd-c'],
            'client.shared' => [qw(rbd-a rbd-b)],
        },
        { %$info, health_checks => $client_health->(qw(client.shared client.other)) },
    );
    like(
        $one_unselected,
        qr/Ceph user keys not selected:.*dedicated storage users 'client\.other'/,
        'the default names a genuinely unselected dedicated Ceph user',
    );
    unlike(
        $one_unselected,
        qr/dedicated storage users[^\n]*client\.shared/,
        'the default excludes a shared Ceph user selected through any storage ID',
    );

    my $verbose = $render->(1);
    like($verbose, qr/osd\.7 on node-daemon/, 'verbose includes full daemon inventory');
    like(
        $verbose,
        qr/Ceph user 'client\.store' \(used by storage 'store'\).*\/etc\/pve\/priv\/ceph\/store\.keyring/s,
        'verbose includes selection reasons and keyring paths',
    );
    like(
        $verbose,
        qr/client\.osd-lockbox\.1234.*osd-block-1234/s,
        'verbose includes lockbox identity and device rows',
    );
    like($verbose, qr/ceph mon set auth_service_cipher/, 'verbose includes Ceph commands');
    like(
        $verbose,
        qr/'auth_preferred_cipher' \(currently/,
        'verbose includes preferred-cipher lifecycle detail',
    );
}

done_testing();
