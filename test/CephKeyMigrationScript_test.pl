#!/usr/bin/perl

use strict;
use warnings;

use lib ('.', '..');

use JSON qw(decode_json encode_json);
use File::Temp qw(tempdir);
use Test::More;

use PVE::Ceph::KeyMigration qw(key_fingerprint);

# The helper caches terminal detection before we capture its output for plain-text assertions.
local $ENV{ANSI_COLORS_DISABLED} = 1;

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
            'client.app' => [map { { global_id => $_, host => "node$_" } } @ids],
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
            $rados, $state, { entity => 'client.app', files => [] }, $snapshot,
        );
    }
    return ($calls, \@saved);
}

{
    my $startup = picture(1, 1);
    my $state = { client_keys_seen => { 'client.app' => key_fingerprint($OLD) } };
    my $rados = ClientRotationRados->new($OLD);
    my ($calls) = run_client_rotation(
        $rados, $state, picture(1, 1, 2), picture(1, 1, 2, 3),
    );

    is($calls, 2, 'a client-key rotation takes fresh snapshots before and after the auth change');
    is_deeply(
        $state->{client_refresh}->{'client.app'}->{session_ids},
        [1, 2, 3],
        'clients appearing after the startup snapshot or across the rotation are retained',
    );
    is_deeply(
        [map { $_->{global_id} } $startup->{clients}->{'client.app'}->@*],
        [1],
        'the startup picture alone did not contain those consumers',
    );
    ok(
        !$state->{client_refresh}->{'client.app'}->{measurement_incomplete},
        'two complete boundary snapshots produce a measured record',
    );

    $state->{client_refresh}->{'client.app'}->{cleared} = 10;
    $rados->{key} = $OLD;
    run_client_rotation($rados, $state, picture(1, 4), picture(1, 5));
    is_deeply(
        $state->{client_refresh}->{'client.app'}->{session_ids},
        [1, 2, 3, 4, 5],
        'a repeated helper rotation unions its instances with every retained ID',
    );
    ok(
        !defined($state->{client_refresh}->{'client.app'}->{cleared}),
        'a repeated rotation reopens a confirmed record',
    );
}

{
    my $state = { client_keys_seen => { 'client.app' => key_fingerprint($OLD) } };
    my $rados = ClientRotationRados->new($OLD);
    run_client_rotation($rados, $state, picture(0, 20), picture(1, 21));
    is_deeply(
        $state->{client_refresh}->{'client.app'}->{session_ids},
        [20, 21],
        'a partial boundary poll keeps every ID it did return',
    );
    ok(
        $state->{client_refresh}->{'client.app'}->{measurement_incomplete},
        'one partial boundary poll keeps the record marked as incompletely measured',
    );
}

{
    my $state = {
        client_keys_seen => { 'client.app' => key_fingerprint($OLD) },
        client_refresh => {
            'client.app' => { rotated => 1, session_ids => [30], cleared => 2 },
        },
    };
    my @saved;
    {
        no warnings qw(once redefine);
        local *main::file_set_contents = sub { push @saved, [@_] };
        $HOOKS->{reconcile_clients}->(
            $state, { 'client.app' => { key => $NEW } }, picture(1, 31), { apply => 1 },
        );
        $HOOKS->{reconcile_clients}->(
            $state,
            { 'client.app' => { key => "$NEW.changed" } },
            picture(0, 32),
            { apply => 1 },
        );
    }
    is_deeply(
        $state->{client_refresh}->{'client.app'}->{session_ids},
        [30, 31, 32],
        'repeated external rotations retain old and newly visible instance IDs',
    );
    ok(
        !defined($state->{client_refresh}->{'client.app'}->{cleared}),
        'an external rotation also reopens a confirmed record',
    );
    ok(
        $state->{client_refresh}->{'client.app'}->{measurement_incomplete},
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
            $self->{preferred_cipher} = $args->{value}
                if $args->{name} eq 'auth_preferred_cipher' && !$self->{ignore_preferred};
            $self->{allowed_ciphers} = [$args->{value}]
                if $args->{name} eq 'auth_allowed_ciphers';
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

{
    my $entry =
        { entity => 'client.app', key => $NEW, pending_key => $OLD, caps => { mon => 'allow r' } };
    my @invalid = (
        ['missing export', undef, qr/could not export/],
        ['non-array export', {}, qr/could not export/],
        ['non-object entry', [undef], qr/auth export is malformed/],
        ['duplicate identity', [$entry, $entry], qr/auth export is malformed/],
    );
    for my $field (qw(entity key)) {
        for my $case (['missing', undef], ['empty', ''], ['non-scalar', {}]) {
            my ($label, $value) = @$case;
            push @invalid,
                ["$label $field", [{ %$entry, $field => $value }], qr/auth export is malformed/];
        }
    }
    for my $case (@invalid) {
        my ($label, $reply, $error) = @$case;
        my $rados = CurrentMonitorRados->new(auth_export_reply => $reply);
        eval { $HOOKS->{collect_client_snapshot}->($rados, \&current_monitor_picture); };
        like($@, $error, "client snapshot rejects $label");
    }
    my $rados = CurrentMonitorRados->new(auth_export_reply => [$entry]);
    my $snapshot = $HOOKS->{collect_client_snapshot}->($rados, \&current_monitor_picture);
    is_deeply(
        $snapshot->{exported},
        { 'client.app' => $entry },
        'client snapshots index fresh auth entries without discarding keys or caps',
    );

    for my $pending ($OLD, undef, '', {}) {
        my $auth = [{ %$entry, pending_key => $pending }];
        for my $kind (qw(client restriction wipe)) {
            my $rados = CurrentMonitorRados->new(auth_export_reply => $auth);
            eval {
                if ($kind eq 'client') {
                    $HOOKS->{collect_client_snapshot}->($rados, \&current_monitor_picture);
                } elsif ($kind eq 'restriction') {
                    $HOOKS->{restriction_snapshot}
                        ->($rados, \&current_monitor_picture, sub { $NEW });
                } else {
                    $HOOKS->{assert_consumers}
                        ->($rados, {}, {}, 'wipe', \&current_monitor_picture);
                }
            };
            if (ref($pending) && $kind ne 'wipe') {
                like($@, qr/auth export is malformed/, "$kind validates the pending-key shape");
            } else {
                is($@, '', "$kind accepts its supported pending-key representation");
            }
        }
    }
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
                    entity_name => 'client.app',
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
        exported => { 'client.app' => { key => $NEW } },
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
    my $state = { client_keys_seen => { 'client.app' => key_fingerprint($NEW) } };
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
        exists($state->{client_refresh}->{'client.app'}),
        'a client key rotated before the tracking existed gets a seeded record',
    );
    ok(
        !exists(($state->{previous_keys} // {})->{'client.app'}),
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
        client_keys_seen => { 'client.app' => key_fingerprint($NEW) },
        client_refresh => {
            'client.app' => {
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
            { apply => 1, 'confirm-clients-refreshed' => ['client.app'] },
            0,
            $state,
        );
    }
    cmp_ok($verdict, '<', 0, 'a returning client in a partial poll keeps the run fail closed');
    ok(
        !defined($state->{client_refresh}->{'client.app'}->{cleared})
            && !defined($state->{client_refresh}->{'client.app'}->{acknowledged}),
        'positive returning-ID evidence immediately reopens both record fields',
    );
    my $persisted = decode_json($saved[-1]->[1]);
    ok(
        !defined($persisted->{client_refresh}->{'client.app'}->{cleared})
            && !defined($persisted->{client_refresh}->{'client.app'}->{acknowledged}),
        'apply mode persists the reopened record despite the incomplete session picture',
    );
}

{
    my $state = {
        client_keys_seen => { 'client.app' => key_fingerprint($NEW) },
        client_refresh => {
            'client.app' => {
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
        !defined($persisted->{client_refresh}->{'client.app'}->{cleared})
            && !defined($persisted->{client_refresh}->{'client.app'}->{acknowledged}),
        'a dry run durably reopens an acknowledged record when its exact client ID returns',
    );
}

{
    my $state = {
        client_keys_seen => { 'client.app' => key_fingerprint($NEW) },
        client_refresh => { 'client.app' => { rotated => 1, measurement_incomplete => 1 } },
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
                'confirm-clients-refreshed' => ['client.app', 'client.app'],
            },
            0,
            $state,
        );
    }
    cmp_ok($verdict, '<', 0, 'a duplicated unmeasured acknowledgment still exits nonzero');
    is(scalar(@saved), 1, 'duplicate acknowledgment options are processed only once');
    is_deeply(
        $state->{client_refresh}->{'client.app'}->{session_ids},
        [40],
        'the one request measures the visible consumer',
    );
    ok(
        !defined($state->{client_refresh}->{'client.app'}->{cleared}),
        'the duplicate cannot accept the record after measuring it in the same run',
    );
}

{
    my $state = {
        client_keys_seen => { 'client.app' => key_fingerprint($NEW) },
        client_refresh => {
            'client.app' => { rotated => 1, measurement_incomplete => 1 },
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
            { apply => 1, 'confirm-clients-refreshed' => ['client.app'] },
            0,
            $state,
        );
    }
    cmp_ok($verdict, '<', 0, 'a singular confirmation first records a complete empty measurement');
    is_deeply(
        $state->{client_refresh}->{'client.app'}->{session_ids},
        [],
        'the empty measurement is explicit in the refresh record',
    );
    ok(
        !$state->{client_refresh}->{'client.app'}->{measurement_incomplete}
            && !defined($state->{client_refresh}->{'client.app'}->{cleared}),
        'the complete measurement is durable without closing the record',
    );
    like(
        $output,
        qr/needed a first complete measurement; no possibly stale session is currently visible.*complete measurement is now recorded.*Repeat the confirmation/s,
        'the refusal describes an empty measurement grammatically',
    );

    {
        no warnings qw(once redefine);
        local *main::file_set_contents = sub { push @saved, [@_] };
        $verdict = $HOOKS->{preflight}->(
            migrated_info(picture(1)),
            { apply => 1, 'confirm-clients-refreshed' => ['client.app'] },
            0,
            $state,
        );
    }
    cmp_ok($verdict, '>=', 0, 'repeating the singular confirmation can close the measured record');
    ok(
        defined($state->{client_refresh}->{'client.app'}->{cleared}),
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
        exported => [{ entity => 'client.app', key => $NEW }],
    );
    my $state = {
        client_keys_seen => { 'client.app' => key_fingerprint($NEW) },
        client_refresh => {
            'client.app' => {
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
        !defined($persisted->{client_refresh}->{'client.app'}->{cleared})
            && !defined($persisted->{client_refresh}->{'client.app'}->{acknowledged}),
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
    my $rados = CurrentMonitorRados->new(
        exported => [{ entity => 'client.app', key => $NEW }],
    );
    my $state = {
        client_keys_seen => { 'client.app' => key_fingerprint($NEW) },
        client_refresh => {
            'client.app' => {
                rotated => 1,
                session_ids => [100],
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
                sub {
                    return {
                        service_cipher => 'aes256k',
                        sessions => {
                            complete => 1,
                            clients => {
                                'client.app' => [{
                                    global_id => 999,
                                    host => 'node-new',
                                    key_fingerprint => key_fingerprint($OLD),
                                }],
                            },
                        },
                    };
                },
            );
        };
    }
    like(
        $@,
        qr/refusing to wipe.*recorded live client/s,
        'a new session positively using the old key refuses the wipe',
    );
    my $persisted = decode_json($saved[-1]->[1]);
    ok(
        !defined($persisted->{client_refresh}->{'client.app'}->{cleared}),
        'old-key fingerprint evidence reopens a previously cleared record',
    );
}

{
    my $rados = CurrentMonitorRados->new(exported => []);
    my $state = { client_keys_seen => { 'client.app' => key_fingerprint($NEW) } };
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
        exported => [{ entity => 'client.app', key => $NEW }],
    );
    my $state = { client_keys_seen => { 'client.app' => key_fingerprint($NEW) } };
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
        exported => [{ entity => 'client.app', key => $NEW }],
        service_cipher => 'aes256k',
        after_wipe_cipher => 'aes',
    );
    my $state = { client_keys_seen => { 'client.app' => key_fingerprint($NEW) } };
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
        exported => [{ entity => 'client.app', key => $NEW, pending_key => $OLD }],
    );
    my $snapshot = $HOOKS->{restriction_snapshot}->(
        $rados, sub { return $monitor }, sub { return $NEW },
    );
    is(
        $snapshot->{exported}->{'client.app'}->{pending_key},
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
        allowed_ciphers => [qw(aes aes256k)],
        exported => [{ entity => 'client.app', key => $NEW }],
        health_checks => { AUTH_INSECURE_KEYS_ALLOWED => {} },
    );
    my $state = { client_keys_seen => { 'client.app' => key_fingerprint($NEW) } };
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
        allowed_ciphers => [qw(aes aes256k)],
        exported => [{ entity => 'client.app', key => $NEW }],
        health_checks => { AUTH_INSECURE_KEYS_ALLOWED => {} },
    );
    my $baseline = { client_keys_seen => { 'client.app' => key_fingerprint($NEW) } };
    my $startup = fresh_test_restriction_snapshot($rados);
    my $open = $HOOKS->{open_actions_from_snapshot}->({}, {}, {%$baseline}, $startup);
    ok(restriction_is_offered($open), 'the clean startup snapshot permits the finishing offer');

    my @changes = (
        [
            'an external old active key',
            [{ entity => 'client.app', key => $OLD }],
            { AUTH_INSECURE_KEYS_ALLOWED => {} },
        ],
        [
            'an external old pending key',
            [{ entity => 'client.app', key => $NEW, pending_key => $OLD }],
            { AUTH_INSECURE_KEYS_ALLOWED => {} },
        ],
        [
            'an external emergency override',
            [{ entity => 'client.app', key => $NEW }],
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
            $state->{client_refresh}->{'client.app'},
            'the external active-key change is reconciled before options are offered',
        ) if $label =~ m/active key/;
    }
}

{
    my $info = migrated_info(picture(1));
    $info->{service_cipher} = 'aes';
    $info->{preferred_cipher} = 'aes';
    $info->{allowed_ciphers} = [qw(aes aes256k)];
    my $state = { client_keys_seen => { 'client.app' => key_fingerprint($NEW) } };
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
        exported => [{ entity => 'client.app', key => $NEW }],
    );
    my $monitor = current_monitor_picture('aes256k');
    $monitor->{sessions} = picture(1, 48);
    my $state = {
        client_keys_seen => { 'client.app' => key_fingerprint($NEW) },
        client_refresh => {
            'client.app' => {
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
        !defined($persisted->{client_refresh}->{'client.app'}->{cleared})
            && !defined($persisted->{client_refresh}->{'client.app'}->{acknowledged}),
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
        qr/refusing to restrict.*awaits your confirmation with '--confirm-clients-refreshed client\.app --apply'/s,
        'a later no-session restriction cannot reuse the superseded acknowledgment',
    );
}

{
    my $rados = CurrentMonitorRados->new(
        mons => ['a'],
        quorum => ['a'],
        metadata => [{ name => 'a', hostname => 'node-a' }],
        preferred_cipher => 'aes',
        allowed_ciphers => [qw(aes aes256k)],
        exported => [{ entity => 'client.app', key => $NEW, pending_key => $OLD }],
    );
    my $monitor = current_monitor_picture('aes256k');
    my $state = { client_keys_seen => { 'client.app' => key_fingerprint($NEW) } };
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
        qr/refusing to restrict.*pending/s,
        'an old pending key staged after preflight is caught by the action-time auth export',
    );
    ok(
        (
            grep {
                $_->{prefix} eq 'mon set' && $_->{name} eq 'auth_preferred_cipher'
            } $rados->{commands}->@*
            )
            && !(
                grep {
                    $_->{prefix} eq 'mon set' && $_->{name} eq 'auth_allowed_ciphers'
                } $rados->{commands}->@*
            ),
        'the refusal happens after the preferred setting but before cipher restriction',
    );
    is(
        $state->{preferred_cipher_was},
        'aes',
        'a refusal leaves durable intent to restore the preferred cipher',
    );
    my $durable = decode_json($saved[-1]->[1]);
    {
        no warnings qw(once redefine);
        local *main::file_set_contents = sub { };
        $HOOKS->{release_preferred}->($rados, $durable);
    }
    is($rados->{preferred_cipher}, 'aes', 'recovery restores the default after a refusal');
    ok(
        !defined($durable->{preferred_cipher_was}),
        'verified restoration consumes the durable intent',
    );
}

{
    my $rados = CurrentMonitorRados->new(
        mons => ['a'],
        quorum => ['a'],
        metadata => [{ name => 'a', hostname => 'node-a' }],
        preferred_cipher => 'aes',
        allowed_ciphers => [qw(aes aes256k)],
        exported => [{ entity => 'client.app', key => $NEW }],
    );
    my $monitor = current_monitor_picture('aes256k');
    my $state = { client_keys_seen => { 'client.app' => key_fingerprint($NEW) } };
    {
        no warnings qw(once redefine);
        local *main::file_set_contents = sub { };
        $HOOKS->{restrict_ciphers}->(
            $rados,
            $state,
            { apply => 1, force => 0 },
            sub { return $monitor },
            sub { return $NEW },
        );
    }
    my @commands = $rados->{commands}->@*;
    my ($preferred) = grep {
        $commands[$_]->{prefix} eq 'mon set'
            && $commands[$_]->{name} eq 'auth_preferred_cipher'
    } 0 .. $#commands;
    my ($export) = grep { $commands[$_]->{prefix} eq 'auth export' } 0 .. $#commands;
    my ($allowed) = grep {
        $commands[$_]->{prefix} eq 'mon set'
            && $commands[$_]->{name} eq 'auth_allowed_ciphers'
    } 0 .. $#commands;
    cmp_ok($preferred, '<', $export, 'the preferred cipher is set before the final auth export');
    cmp_ok($allowed, '>', $export, 'the allowed cipher changes only after fresh validation');
    ok(!defined($state->{preferred_cipher_was}), 'successful restriction consumes restore intent');
}

{
    my $rados = CurrentMonitorRados->new(
        mons => ['a'],
        quorum => ['a'],
        metadata => [{ name => 'a', hostname => 'node-a' }],
        preferred_cipher => 'aes',
        allowed_ciphers => [qw(aes aes256k)],
        exported => [{ entity => 'client.app', key => $NEW }],
    );
    my $state = { client_keys_seen => { 'client.app' => key_fingerprint($NEW) } };
    my $durable;
    my $err;
    {
        no warnings qw(once redefine);
        local *main::file_set_contents = sub {
            my ($path, $content) = @_;
            die "simulated final journal failure\n"
                if $rados->{allowed_ciphers}->@* == 1;
            $durable = decode_json($content);
        };
        eval {
            $HOOKS->{restrict_ciphers}->(
                $rados,
                $state,
                { apply => 1, force => 0 },
                sub { return current_monitor_picture('aes256k') },
                sub { return $NEW },
            );
        };
        $err = $@;
    }
    like($err, qr/simulated final journal failure/,
        'the final restriction save can be interrupted');
    is($durable->{preferred_cipher_was}, 'aes', 'the last durable state retains restore intent');
    is_deeply($rados->{allowed_ciphers}, ['aes256k'], 'cipher restriction was already applied');
    {
        no warnings qw(once redefine);
        local *main::file_set_contents = sub { };
        $HOOKS->{release_preferred}->($rados, $durable);
    }
    is(
        $rados->{preferred_cipher},
        'aes256k',
        'recovery does not restore an incompatible default after restriction',
    );
    ok(
        !defined($durable->{preferred_cipher_was}),
        'verified applied restriction consumes stale restoration intent',
    );
}

{
    my $rados = CurrentMonitorRados->new(
        preferred_cipher => 'aes256k',
        allowed_ciphers => ['aes256k'],
        fail_prefix => 'mon dump',
    );
    my $state = { preferred_cipher_was => 'aes' };
    {
        no warnings qw(once redefine);
        local *main::file_set_contents = sub { };
        $HOOKS->{release_preferred}->($rados, $state);
    }
    is(
        $state->{preferred_cipher_was},
        'aes',
        'an unreadable applied setting retains restoration intent',
    );
    ok(
        !(grep { $_->{prefix} eq 'mon set' } $rados->{commands}->@*),
        'query failure does not guess at a preferred-cipher restoration',
    );
}

{
    my $rados = CurrentMonitorRados->new(
        mons => ['a'],
        quorum => ['a'],
        metadata => [{ name => 'a', hostname => 'node-a' }],
        preferred_cipher => 'aes',
        ignore_preferred => 1,
        exported => [{ entity => 'client.app', key => $NEW }],
    );
    my $state = { client_keys_seen => { 'client.app' => key_fingerprint($NEW) } };
    my $err;
    {
        no warnings qw(once redefine);
        local *main::file_set_contents = sub { };
        eval {
            $HOOKS->{restrict_ciphers}->(
                $rados,
                $state,
                { apply => 1, force => 0 },
                sub { return current_monitor_picture('aes256k') },
                sub { return $NEW },
            );
        };
        $err = $@;
    }
    like($err, qr/did not apply 'auth_preferred_cipher/, 'an unapplied default fails closed');
    ok(
        !(grep { $_->{prefix} eq 'auth export' } $rados->{commands}->@*),
        'validation does not start before the preferred setting is verified',
    );
    is($state->{preferred_cipher_was}, 'aes', 'the failed verification keeps restore intent');
}

{
    my $rados = CurrentMonitorRados->new(
        mons => ['a'],
        quorum => ['a'],
        metadata => [{ name => 'a', hostname => 'node-a' }],
        exported => [{ entity => 'client.app', key => $NEW }],
    );
    my $monitor = current_monitor_picture('aes');
    my $state = { client_keys_seen => { 'client.app' => key_fingerprint($NEW) } };
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
    my $script = $HOOKS->{cephfs_remount_script};
    unlike($script, qr/\['umount', '-[fl]'/, 'the CephFS refresh never force or lazy unmounts');
    like(
        $script,
        qr/my \$state = \$failure =~ m\/timeout.*'timed out'/s,
        'an ordinary unmount timeout leaves the mount in place',
    );

    my $state = {};
    my $item = {
        entity => 'client.cp',
        files => [{ store => 'cp', format => 'secret' }],
    };
    my @calls;
    my $run = sub {
        my ($node, $storeid, $phase) = @_;
        push @calls, "$node/$storeid/$phase";
        return "mounted\n" if $phase eq 'inspect';
        return $node eq 'a' ? "remounted\n" : "timed out, left alone\n";
    };
    {
        no warnings qw(once redefine);
        local *main::file_set_contents = sub { };
        $HOOKS->{refresh_cephfs_mounts}->(
            $state,
            $item,
            target => key_fingerprint($NEW),
            reads => 'the staged key',
            nodes => [qw(a b)],
            run => $run,
        );
    }
    is_deeply(
        \@calls,
        ['a/cp/inspect', 'a/cp/remount', 'b/cp/inspect', 'b/cp/remount'],
        'the first refresh records mounted storage before ordinary remounts',
    );
    ok(
        $state->{mount_refresh}->{'client.cp'}->{completed}->{cp}->{a}
            && $state->{mount_refresh}->{'client.cp'}->{pending}->{cp}->{b},
        'completed and unresolved mount refreshes are journalled separately',
    );

    @calls = ();
    {
        no warnings qw(once redefine);
        local *main::file_set_contents = sub { };
        $HOOKS->{refresh_cephfs_mounts}->(
            $state,
            $item,
            target => key_fingerprint($NEW),
            reads => 'the staged key',
            nodes => [qw(a b)],
            run => sub {
                my ($node, $storeid, $phase) = @_;
                push @calls, "$node/$storeid/$phase";
                return "remounted\n";
            },
        );
    }
    is_deeply(
        \@calls,
        ['b/cp/remount'],
        'a later apply retries only activation of the unresolved mount',
    );
    ok(
        !PVE::Ceph::KeyMigration::mount_refresh_pending($state, 'client.cp'),
        'the mount work is complete after that retry',
    );

    my $activation = {};
    @calls = ();
    {
        no warnings qw(once redefine);
        local *main::file_set_contents = sub { };
        $HOOKS->{refresh_cephfs_mounts}->(
            $activation,
            $item,
            target => key_fingerprint($NEW),
            nodes => ['a'],
            run => sub {
                my ($node, $storeid, $phase) = @_;
                push @calls, $phase;
                return $phase eq 'inspect' ? "mounted\n" : "unmounted, but not mounted again\n";
            },
        );
    }
    is_deeply(\@calls, [qw(inspect remount)], 'failed activation follows a durable mounted probe');
    is(
        $activation->{mount_refresh}->{'client.cp'}->{pending}->{cp}->{a}->{phase},
        'remount',
        'failed activation retains the reactivation phase',
    );
    @calls = ();
    {
        no warnings qw(once redefine);
        local *main::file_set_contents = sub { };
        $HOOKS->{refresh_cephfs_mounts}->(
            $activation,
            $item,
            target => key_fingerprint($NEW),
            nodes => ['a'],
            run => sub {
                my ($node, $storeid, $phase) = @_;
                push @calls, $phase;
                return "remounted\n";
            },
        );
    }
    is_deeply(\@calls, ['remount'], 'an absent mount caused by this helper is reactivated');
    ok(
        !PVE::Ceph::KeyMigration::mount_refresh_pending($activation, 'client.cp'),
        'successful reactivation completes the pending pair',
    );

    my $interrupted = {};
    my @durable;
    {
        no warnings qw(once redefine);
        local *main::file_set_contents = sub {
            my ($path, $content) = @_;
            push @durable, decode_json($content);
        };
        $HOOKS->{refresh_cephfs_mounts}->(
            $interrupted,
            $item,
            target => key_fingerprint($NEW),
            nodes => ['a'],
            run => sub {
                my ($node, $storeid, $phase) = @_;
                return "mounted\n" if $phase eq 'inspect';
                die "connection lost after ordinary unmount\n";
            },
        );
    }
    is(
        $durable[-1]->{mount_refresh}->{'client.cp'}->{pending}->{cp}->{a}->{phase},
        'remount',
        'the journal requires reactivation before the unmounting call can be interrupted',
    );
    @calls = ();
    {
        no warnings qw(once redefine);
        local *main::file_set_contents = sub { };
        $HOOKS->{refresh_cephfs_mounts}->(
            $interrupted,
            $item,
            target => key_fingerprint($NEW),
            nodes => ['a'],
            run => sub {
                my ($node, $storeid, $phase) = @_;
                push @calls, $phase;
                return "remounted\n";
            },
        );
    }
    is_deeply(\@calls, ['remount'], 'interrupted activation resumes without an absence probe');

    my $absent = {};
    @calls = ();
    {
        no warnings qw(once redefine);
        local *main::file_set_contents = sub { };
        $HOOKS->{refresh_cephfs_mounts}->(
            $absent,
            $item,
            target => key_fingerprint($NEW),
            nodes => ['a'],
            run => sub {
                my ($node, $storeid, $phase) = @_;
                push @calls, $phase;
                return "not mounted\n";
            },
        );
    }
    is_deeply(\@calls, ['inspect'], 'an originally unmounted storage is never activated');
    ok(
        !PVE::Ceph::KeyMigration::mount_refresh_pending($absent, 'client.cp'),
        'an originally absent pair is complete',
    );
}

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
        if ($prefix eq 'auth export') {
            return [{
                entity => $args->{entity} // 'client.cp',
                key => $self->{key},
                (defined($self->{pending}) ? (pending_key => $self->{pending}) : ()),
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
        if ($args->{prefix} eq 'auth export') {
            return [map { { $self->{entries}->{$_}->%* } } sort keys $self->{entries}->%*];
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

{
    my ($rados, $info, $state) =
        aggregate_fixture({ complete => 1, clients => {} }, 'client.app');
    $info->{manual_promotion} = {
        supported => 1,
        disabled => 1,
        unsupported => [],
        unanswered => [],
    };
    my $files = {
        'client.app' => [{
            store => 'fs',
            format => 'secret',
            scope => 'cluster',
            path => '/unused/fs.secret',
        }],
    };
    my $opts = { 'rotate-storage-key' => ['fs'] };
    my $output = '';
    {
        open(my $stdout, '>', \$output) or die $!;
        local *STDOUT = $stdout;
        $HOOKS->{settle_staged}->($rados, $info, $state, { apply => 0 }, $files);
        $HOOKS->{print_open_options}->({}, {}, $state, $info, 0, $files);
    }
    like(
        $output,
        qr/CephFS mounts need inspection: fs.*--apply.*inspect and refresh.*busy mounts are left alone/s,
        'a dry run exposes uninitialized CephFS work from an older written journal',
    );
    ok(
        !exists($state->{mount_refresh}->{'client.app'}),
        'the dry run does not claim that unknown mount work was initialized',
    );
    my ($plan) = PVE::Ceph::KeyMigration::plan_client_keys($info, $state, $opts, $files);
    ok(
        scalar(@$plan) == 1 && $plan->[0]->{refresh_only},
        'the planner selects the older journal for mount refresh without restaging',
    );

    my $commands = scalar($rados->{commands}->@*);
    my @remote;
    {
        no warnings qw(once redefine);
        local *main::file_set_contents = sub { };
        local *PVE::Cluster::cfs_update = sub { };
        local *PVE::Cluster::get_nodelist = sub { return [PVE::INotify::nodename()] };
        local *main::run_command = sub {
            my ($command, %param) = @_;
            push @remote, [@$command];
            $param{outfunc}->('not mounted');
        };
        $HOOKS->{settle_staged}->(
            $rados,
            $info,
            $state,
            { apply => 1 },
            $files,
            sub { return { manual_promotion => $info->{manual_promotion} } },
        );
    }
    ok(
        $state->{mount_refresh}->{'client.app'}->{finished},
        'apply initializes and completes the previously unknown managed pair',
    );
    is(scalar($rados->{commands}->@*), $commands, 'mount initialization changes no auth key');
    is(scalar(@remote), 1, 'the unknown managed pair is inspected once');
    ($plan) = PVE::Ceph::KeyMigration::plan_client_keys($info, $state, $opts, $files);
    is(scalar(@$plan), 0, 'completed mount work is not planned again');

    my ($rbd_rados, $rbd_info, $rbd_state) =
        aggregate_fixture({ complete => 1, clients => {} }, 'client.app');
    $rbd_info->{manual_promotion} = $info->{manual_promotion};
    my $rbd_files = {
        'client.app' => [{
            store => 'rbd',
            format => 'keyring',
            scope => 'cluster',
            path => '/unused/rbd.keyring',
        }],
    };
    $HOOKS->{settle_staged}->(
        $rbd_rados, $rbd_info, $rbd_state, { apply => 0 }, $rbd_files,
    );
    ok(
        !exists($rbd_state->{mount_refresh}->{'client.app'}),
        'an older RBD-only staged record acquires no mount work',
    );
    ($plan) = PVE::Ceph::KeyMigration::plan_client_keys(
        $rbd_info, $rbd_state, { 'rotate-storage-key' => ['rbd'] }, $rbd_files,
    );
    is(scalar(@$plan), 0, 'RBD-only staged work remains waiting for confirmation');
}

{
    my ($rados, $info, $state) =
        aggregate_fixture({ complete => 1, clients => {} }, 'client.app');
    $rados->{entries}->{'client.app'} = { entity => 'client.app', key => $NEW };
    $info->{exported}->{'client.app'} = { $rados->{entries}->{'client.app'}->%* };
    delete $state->{staged}->{'client.app'}->{written};
    my $files = {
        'client.app' => [{
            store => 'fs',
            format => 'secret',
            scope => 'cluster',
            path => '/unused/fs.secret',
        }],
    };
    my $durable;
    my $err;
    {
        no warnings qw(once redefine);
        local *PVE::Cluster::cfs_update = sub { };
        local *PVE::Cluster::get_nodelist = sub { return [PVE::INotify::nodename()] };
        local *main::file_set_contents = sub {
            my ($path, $content) = @_;
            return if $path !~ m/cephx-key-migration\.json$/;
            $durable = decode_json($content);
            die "simulated interruption after durable mount queue\n"
                if $durable->{mount_refresh}->{'client.app'}->{pending};
        };
        eval { $HOOKS->{settle_staged}->($rados, $info, $state, { apply => 1 }, $files); };
        $err = $@;
    }
    like($err, qr/interruption after durable mount queue/, 'the queue save is interruptible');
    ok(
        !$durable->{staged}->{'client.app'}->{written}
            && PVE::Ceph::KeyMigration::mount_refresh_pending($durable, 'client.app'),
        'the durable queue precedes the promoted-key written marker',
    );

    my @remote;
    {
        no warnings qw(once redefine);
        local *main::file_set_contents = sub { };
        local *PVE::Cluster::cfs_update = sub { };
        local *PVE::Cluster::get_nodelist = sub { return [PVE::INotify::nodename()] };
        local *main::run_command = sub {
            my ($command, %param) = @_;
            push @remote, [@$command];
            $param{outfunc}->('not mounted');
        };
        $HOOKS->{settle_staged}->($rados, $info, $durable, { apply => 1 }, $files);
    }
    is(scalar(@remote), 1, 'resumed promoted-key recovery inspects the queued mount');
    ok(
        !exists($durable->{staged}->{'client.app'}),
        'the promoted record closes only after queued mount work completes',
    );
}

{
    my $target = key_fingerprint($NEW);
    my $state = {
        mount_refresh => {
            'client.app' => {
                target => $target,
                pending => { fs => { 'node-a' => { phase => 'remount' } } },
                completed => {},
            },
        },
    };
    my $durable = decode_json(encode_json($state));
    my $item = {
        entity => 'client.app',
        files => [{ store => 'fs', format => 'secret' }],
    };
    my $err;
    {
        no warnings qw(once redefine);
        local *main::file_set_contents = sub {
            my ($path, $content) = @_;
            die "simulated mount completion journal failure\n"
                if !PVE::Ceph::KeyMigration::mount_refresh_pending($state, 'client.app');
        };
        eval {
            $HOOKS->{refresh_cephfs_mounts}->(
                $state,
                $item,
                target => $target,
                nodes => ['node-a'],
                run => sub { return "remounted\n" },
            );
        };
        $err = $@;
    }
    like(
        $err,
        qr/mount completion journal failure/,
        'completion remains interruptible after the remote remount succeeds',
    );
    ok(
        PVE::Ceph::KeyMigration::mount_refresh_pending($durable, 'client.app'),
        'the last durable state still requires the remount after completion-save failure',
    );
    my @phases;
    {
        no warnings qw(once redefine);
        local *main::file_set_contents = sub { };
        $HOOKS->{refresh_cephfs_mounts}->(
            $durable,
            $item,
            target => $target,
            nodes => ['node-a'],
            run => sub {
                my ($node, $storeid, $phase) = @_;
                push @phases, $phase;
                return "remounted\n";
            },
        );
    }
    is_deeply(\@phases, ['remount'], 'recovery retries an unjournalled remote completion');
    ok(
        !PVE::Ceph::KeyMigration::mount_refresh_pending($durable, 'client.app'),
        'the retried completion is durable',
    );
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
    my $fresh = sub {
        my ($entity, $fingerprint) = @_;
        return {
            sessions => {
                complete => 1,
                clients => {
                    $entity => [{
                        global_id => 900,
                        host => 'node-new',
                        key_fingerprint => $fingerprint,
                    }],
                },
            },
        };
    };
    my $verdict;
    {
        no warnings qw(once redefine);
        local *main::file_set_contents = sub { };
        $verdict = $HOOKS->{preflight}->(
            $info,
            { apply => 1, 'confirm-all-clients-refreshed' => 1 },
            0,
            $state,
            {},
            sub { return $fresh->('client.b', key_fingerprint($OLD)) },
        );
    }
    cmp_ok($verdict, '<', 0, 'a fresh aggregate precheck catches a newly visible stale session');
    is_deeply($rados->{committed}, [], 'the aggregate precheck commits no ready key');
}

{
    my ($rados, $info, $state) =
        aggregate_fixture({ complete => 1, clients => {} }, qw(client.a client.b));
    $rados->{entries}->{'client.b'} = { entity => 'client.b', key => $NEW };
    $info->{exported}->{'client.b'} = { $rados->{entries}->{'client.b'}->%* };
    delete $state->{staged}->{'client.b'};
    $state->{client_keys_seen}->{'client.b'} = key_fingerprint($NEW);
    $state->{client_refresh}->{'client.b'}->{cleared} = 2;
    $state->{client_refresh}->{'client.b'}->{acknowledged} = 2;
    my $verdict;
    {
        no warnings qw(once redefine);
        local *main::file_set_contents = sub { };
        $verdict = $HOOKS->{preflight}->(
            $info,
            { apply => 1, 'confirm-all-clients-refreshed' => 1 },
            0,
            $state,
            {},
            sub {
                return {
                    sessions => {
                        complete => 1,
                        clients => {
                            'client.b' => [{
                                global_id => 901,
                                host => 'node-returned',
                                key_fingerprint => key_fingerprint($OLD),
                            }],
                        },
                    },
                };
            },
        );
    }
    cmp_ok($verdict, '<', 0, 'fresh aggregate selection includes a reopened record');
    is_deeply($rados->{committed}, [], 'a blocker in the reopened record prevents every commit');
    ok(
        !defined($state->{client_refresh}->{'client.a'}->{cleared})
            && !defined($state->{client_refresh}->{'client.b'}->{cleared}),
        'both aggregate records remain open after the refusal',
    );
}

{
    my ($rados, $info, $state) =
        aggregate_fixture({ complete => 1, clients => {} }, qw(client.a client.b));
    my $poll = 0;
    my $collector = sub {
        $poll++;
        my $sessions = { complete => 1, clients => {} };
        if ($poll == 3) {
            $sessions->{clients}->{'client.b'} = [{
                global_id => 901,
                host => 'node-returned',
                key_fingerprint => key_fingerprint($OLD),
            }];
        }
        return { sessions => $sessions };
    };
    my $verdict;
    {
        no warnings qw(once redefine);
        local *main::file_set_contents = sub { };
        $verdict = $HOOKS->{preflight}->(
            $info,
            { apply => 1, 'confirm-all-clients-refreshed' => 1 },
            0,
            $state,
            {},
            $collector,
        );
    }
    cmp_ok($verdict, '<', 0, 'a session appearing inside the commit batch refuses its key');
    is_deeply($rados->{committed}, ['client.a'], 'an earlier completed promotion stays committed');
    ok(
        exists($state->{staged}->{'client.b'})
            && !defined($state->{client_refresh}->{'client.b'}->{cleared}),
        'the newly blocked key and its refresh record remain open',
    );
}

{
    my ($rados, $info, $state) =
        aggregate_fixture({ complete => 1, clients => {} }, 'client.app');
    $info->{allowed_ciphers} = [qw(aes aes256k)];
    $info->{health_checks} = { AUTH_INSECURE_KEYS_ALLOWED => {} };
    my $restriction = sub {
        return {
            sessions => { complete => 1, clients => {} },
            exported =>
                { map { $_ => { $rados->{entries}->{$_}->%* } } keys $rados->{entries}->%* },
            pve_mon_key => $NEW,
            service_cipher => 'aes256k',
            preferred_cipher => 'aes256k',
            allowed_ciphers => [qw(aes aes256k)],
            health_checks => { AUTH_INSECURE_KEYS_ALLOWED => {} },
        };
    };
    my $files = {
        'client.app' => [{
            store => 'data',
            format => 'keyring',
            scope => 'cluster',
            path => '/unused/data.keyring',
        }],
    };
    my $opts = {
        apply => 1,
        'confirm-all-clients-refreshed' => 1,
        'rotate-storage-key' => ['data'],
        'restrict-ciphers' => 1,
    };
    my $verdict;
    {
        no warnings qw(once redefine);
        local *main::file_set_contents = sub { };
        $verdict = $HOOKS->{preflight}->(
            $info,
            $opts,
            0,
            $state,
            $files,
            sub { return { sessions => { complete => 1, clients => {} } } },
            $restriction,
        );
    }
    cmp_ok($verdict, '>=', 0, 'combined confirmation recollects before restriction preflight');
    is_deeply($rados->{committed}, ['client.app'], 'the real staged promotion succeeds');
    is(
        $info->{exported}->{'client.app'}->{key},
        $NEW,
        'the caller receives the post-promotion auth export',
    );
    ok(!exists($info->{exported}->{'client.app'}->{pending_key}), 'the stale pending key is gone');
    is($info->{rados}, $rados, 'snapshot replacement preserves caller-only cluster information');
    my ($plan) = PVE::Ceph::KeyMigration::plan_client_keys($info, $state, $opts, $files);
    is(scalar(@$plan), 0, 'the subsequent planner does not stage the promoted key again');
    ok(
        !scalar(PVE::Ceph::KeyMigration::restrict_blockers($info, $state)->@*),
        'the shared post-promotion state is ready for restriction',
    );
}

{
    my ($rados, $info, $state) =
        aggregate_fixture({ complete => 1, clients => {} }, 'client.app');
    my $verdict;
    {
        no warnings qw(once redefine);
        local *main::file_set_contents = sub { };
        $verdict = $HOOKS->{preflight}->(
            $info,
            { apply => 1, 'confirm-all-clients-refreshed' => 1 },
            0,
            $state,
            {},
            sub { return { sessions => { complete => 1, clients => {} } } },
        );
    }
    cmp_ok($verdict, '>=', 0, 'confirmation without restriction completes normally');
    is(
        $info->{exported}->{'client.app'}->{key},
        $NEW,
        'non-restriction confirmation also refreshes the caller auth export',
    );
    ok(
        !exists($info->{exported}->{'client.app'}->{pending_key}),
        'non-restriction preflight does not retain the committed pending entry',
    );
}

{
    my ($rados, $info, $state) =
        aggregate_fixture({ complete => 1, clients => {} }, 'client.app');
    $info->{allowed_ciphers} = [qw(aes aes256k)];
    $info->{health_checks} = { AUTH_INSECURE_KEYS_ALLOWED => {} };
    my $verdict;
    {
        no warnings qw(once redefine);
        local *main::file_set_contents = sub { };
        $verdict = $HOOKS->{preflight}->(
            $info,
            {
                apply => 1,
                'confirm-all-clients-refreshed' => 1,
                'restrict-ciphers' => 1,
            },
            0,
            $state,
            {},
            sub { return { sessions => { complete => 1, clients => {} } } },
            sub {
                $rados->{entries}->{'client.app'}->{pending_key} = $OLD;
                return {
                    sessions => { complete => 1, clients => {} },
                    exported => {
                        'client.app' => { $rados->{entries}->{'client.app'}->%* },
                    },
                    pve_mon_key => $NEW,
                    service_cipher => 'aes256k',
                    preferred_cipher => 'aes256k',
                    allowed_ciphers => [qw(aes aes256k)],
                    health_checks => { AUTH_INSECURE_KEYS_ALLOWED => {} },
                };
            },
        );
    }
    cmp_ok($verdict, '<', 0, 'a blocker appearing after promotion refuses restriction preflight');
    is($rados->{entries}->{'client.app'}->{pending_key}, $OLD, 'the new pending key is retained');
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
    is($rados->issued('auth clear-pending'), 0, 'preparing the abort retires no key');
    is($rados->{key}, $OLD, 'and leaves the current key active');
    ok(
        $state->{staged}->{'client.cp'}->{aborting}
            && $state->{staged}->{'client.cp'}->{abort_written}
            && $state->{previous_keys}->{'client.cp'}->{key} eq $OLD,
        'the prepared rollback and both recoverable keys remain journalled',
    );

    {
        no warnings qw(once redefine);
        local *main::file_set_contents = sub { };
        $HOOKS->{retire_aborted}->(
            $rados, $state, ['client.cp'], sub { return { sessions => cp_picture(1) } },
        );
    }
    is($rados->issued('auth clear-pending'), 1, 'reverse-refresh confirmation retires the key');
    ok(
        !exists($state->{staged}->{'client.cp'})
            && !exists($state->{client_refresh}->{'client.cp'}),
        'successful retirement closes the rollback records',
    );
}

{
    my $fp = key_fingerprint($NEW);
    my $prepared = sub {
        return {
            staged => {
                'client.cp' => {
                    key => $fp,
                    aborting => 1,
                    abort_written => 1,
                    abort_key => key_fingerprint($OLD),
                },
            },
            previous_keys => { 'client.cp' => { key => $OLD } },
            client_refresh => { 'client.cp' => { session_ids => [] } },
        };
    };
    my $reverse_picture = sub {
        my ($fingerprint) = @_;
        my $session = { global_id => 70, host => 'node-a' };
        $session->{key_fingerprint} = $fingerprint if defined($fingerprint);
        return { sessions => { complete => 1, clients => { 'client.cp' => [$session] } } };
    };

    {
        my $rados = StagedRotationRados->new(key => $OLD, pending => $NEW);
        my $state = $prepared->();
        delete $state->{staged}->{'client.cp'}->{abort_written};
        my $err = eval {
            $HOOKS->{retire_aborted}->(
                $rados,
                $state,
                ['client.cp'],
                sub { return $reverse_picture->(key_fingerprint($OLD)) },
            );
            1;
        } ? '' : $@;
        like($err, qr/not every managed copy/, 'unrestored managed copies refuse retirement');
        is($rados->issued('auth clear-pending'), 0, 'the unwritten preparation retires no key');
    }

    for my $case (
        ['pending', key_fingerprint($NEW), qr/still use the staged key/],
        ['unknown', undef, qr/have no key fingerprint/],
    ) {
        my ($label, $fingerprint, $expected) = @$case;
        my $rados = StagedRotationRados->new(key => $OLD, pending => $NEW);
        my $state = $prepared->();
        my $err;
        {
            no warnings qw(once redefine);
            local *main::file_set_contents = sub { };
            eval {
                $HOOKS->{retire_aborted}->(
                    $rados,
                    $state,
                    ['client.cp'],
                    sub { return $reverse_picture->($fingerprint) },
                );
            };
            $err = $@;
        }
        like($err, $expected, "a $label-key session refuses pending-key retirement");
        like(
            $err,
            qr/19\.2\.6-pve4.*20\.2\.4-pve4.*restart/s,
            'unknown-key refusal names the monitor upgrade and restart requirement',
        ) if $label eq 'unknown';
        is($rados->issued('auth clear-pending'), 0, 'the refusal retires no key');
        ok(
            exists($state->{previous_keys}->{'client.cp'})
                && exists($state->{staged}->{'client.cp'}),
            'both recoverable keys remain journalled after refusal',
        );
    }

    my $rados = StagedRotationRados->new(key => $OLD, pending => $NEW);
    my $state = $prepared->();
    my $poll = 0;
    my $err;
    {
        no warnings qw(once redefine);
        local *main::file_set_contents = sub { };
        eval {
            $HOOKS->{retire_aborted}->(
                $rados,
                $state,
                ['client.cp'],
                sub {
                    $poll++;
                    return $reverse_picture->(
                        $poll == 1 ? key_fingerprint($OLD) : key_fingerprint($NEW),
                    );
                },
            );
        };
        $err = $@;
    }
    like(
        $err,
        qr/still use the staged key/,
        'a staged-key session appearing after preflight blocks',
    );
    is($rados->issued('auth clear-pending'), 0, 'the immediate mutation check preserves the key');
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
    my $rados = StagedRotationRados->new(key => $OLD, pending => $NEW);
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
        $rados->{key} = delete $rados->{pending};
        $HOOKS->{abort_staged}->($rados, $state, 'client.cp', $files);
    }
    my @copies = map { $_->[1] } grep { $_->[0] =~ m/cp\.keyring/ } @saved;
    is(scalar(@copies), 2, 'the copies are written once for preparation and once after promotion');
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
    is($rados->issued('auth clear-pending'), 0, 'an apply run retires no key without confirmation');
    ok(
        $state->{staged}->{'client.cp'}->{aborting}
            && $state->{staged}->{'client.cp'}->{abort_written},
        'and resumes only rollback preparation',
    );
    is($rados->issued('config rm'), 0, 'the grace option remains while both keys are valid');
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
            { client_keys_seen => { 'client.app' => key_fingerprint($NEW) } },
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
                rotate-admin-key rotate-storage-key rotate-all-storage-keys
                restrict-ciphers wipe-rotating-keys
                )
        },
        {
            'rotate-mon-key' => 1,
            'rotate-client-keys' => 1,
            'rotate-lockbox-keys' => 1,
            'rotate-admin-key' => 0,
            'rotate-storage-key' => 0,
            'rotate-all-storage-keys' => 0,
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
    my $state = { client_keys_seen => { 'client.app' => key_fingerprint($OLD) } };
    my $rados = ClientRotationRados->new($OLD);
    my $output = '';
    {
        open(my $stdout, '>', \$output) or die $!;
        local *STDOUT = $stdout;
        run_client_rotation($rados, $state, picture(1, 501), picture(1, 501));
    }
    like(
        $output,
        qr/remained connected through the immediate replacement.*next reconnect fails.*three days at most.*Live-migrate/s,
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
    like(
        $help,
        qr/--abort-staged-key USER.*Both keys remain valid.*--confirm-abort-clients-refreshed USER.*does not\s+report a key fingerprint.*Retires the staged key/s,
        'help separates rollback preparation from pending-key retirement',
    );
    my ($aggregate_help) =
        $help =~ m/(--confirm-all-clients-refreshed.*?)(?=\n  --restrict-ciphers)/s;
    like(
        $aggregate_help // '',
        qr/every open Ceph user key refresh record.*operator confirms.*disconnected consumers.*key copies.*outside\s+Proxmox VE/s,
        'aggregate help names open refresh records and the operator trust boundary',
    );
    like(
        $help,
        qr/keeping both keys valid.*--confirm-clients-refreshed.*once every open\s+record is ready.*--confirm-all-clients-refreshed/s,
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
        [
            [qw(--confirm-abort-clients-refreshed client.cp)],
            qr/confirm-abort-clients-refreshed.*needs '--apply'/,
            'the reverse-refresh confirmation requires apply',
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
        [
            [qw(
                --apply --confirm-clients-refreshed client.cp
                --confirm-abort-clients-refreshed client.cp
            )],
            qr/cannot be combined with forward confirmation/,
            'forward plus reverse confirmation',
        ],
        [
            [qw(
                --apply --abort-staged-key client.cp
                --confirm-abort-clients-refreshed client.cp
            )],
            qr/preparation and reverse-refresh confirmation need separate runs/,
            'rollback preparation plus its confirmation',
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
                staged => 1,
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
        $selected_info = { %{ $selected_info // $info } };
        $selected_info->{exported} //= {
            map { $_->{message} =~ m/^entity (\S+)/ ? ($1 => { key => $OLD }) : () } @{
                ($selected_info->{health_checks}->{AUTH_INSECURE_CLIENT_KEY_TYPE} // {})
                ->{detail} // []
            }
        };
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
        qr/Ceph user 'client\.store': staged next to the current key.*Ceph user 'client\.admin': staged next to the current key/s,
        'the default lists every selected Ceph user as staged and puts client.admin last',
    );
    like(
        $concise,
        qr/For each staged Ceph user key, both the current and new keys authenticate.*committed with '--confirm-clients-refreshed USER' or, once every open record is ready, '--confirm-all-clients-refreshed'/s,
        'the default names both staged completion paths without offering the aggregate early',
    );
    unlike(
        $concise,
        qr/For each Ceph user marked 'replaced at once'/,
        'the normal plan has no immediate long-lived client replacement',
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
    my $tool = sub {
        my ($entity) = @_;
        return {
            entity => $entity,
            reason => 'cluster key',
            files => [],
            staged => 0,
            kernel => 0,
        };
    };
    my $tools_only = $render->(
        0,
        {
            %$plan,
            daemons => [],
            lockbox_keys => [],
            client_keys =>
                [map { $tool->($_) } qw(client.bootstrap-osd client.bootstrap-mds client.crash)],
        },
    );
    like(
        $tools_only,
        qr/Plan\nStep 1: rotate 3 bootstrap and crash keys and rewrite every copy Proxmox VE keeps\. Only Ceph's own tools read them, so there is nothing to stop\./,
        'a step of tool keys alone says so in its heading, right below the plan title',
    );
    unlike($tools_only, qr/bootstrap and crash keys: replaced at once/, 'without a second line');
    unlike($tools_only, qr/CephFS mounts are redone/, 'nor the mount note that is about user keys');
    my $mixed = $render->(0,
        { %$plan, client_keys => [$plan->{client_keys}->@*, $tool->('client.crash')] });
    like(
        $mixed,
        qr/Step 2: rotate 2 selected Ceph user keys and the tool key 'client\.crash' and rewrite every copy/,
        'a mixed step counts the selected users and names the tool key',
    );
    like(
        $mixed,
        qr/the tool key 'client\.crash': replaced at once; only Ceph's own tools read it/,
        'with the tool line below the user keys',
    );
    like(
        $concise,
        qr/stopped, rotated and started again.*both the current and new keys authenticate.*No OSD is stopped/s,
        'the default keeps restart and staged-rotation effects',
    );
    unlike(
        $concise,
        qr/records migration progress/,
        'the default leaves the journal note to the closing warning',
    );
    like($render->(1), qr/records migration progress/, 'verbose output keeps it');
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
        {
            %$info,
            health_checks => {
                %{ $client_health->(qw(client.crash client.admin client.osd-lockbox.1234)) },
                AUTH_INSECURE_ROTATING_SERVICE_KEY_TYPE => {},
            },
        },
    );
    like(
        $scope,
        qr/Not touched by this run:.*Ceph user keys not selected: bootstrap and crash users; 'client\.admin'\..*Other keys not selected: the shared 'mon\.' key; encrypted OSD lockbox keys\..*Additional actions not selected: cipher restriction\./s,
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

# --- bulk rotation of dedicated storage users: command line and guards -------------------------
{
    local @ARGV = qw(--rotate-all-storage-keys --rotate-storage-key rbd-vm);
    my $err = eval { $HOOKS->{parse_options}->(); 1 } ? '' : $@;
    like(
        $err,
        qr/'--rotate-all-storage-keys' cannot be combined with '--rotate-storage-key'/,
        'the bulk option refuses a single-storage selection before the root check',
    );

    local @ARGV = qw(--rotate-all-storage-keys --rotate-cluster-keys --rotate-admin-key);
    $err = eval { $HOOKS->{parse_options}->(); 1 } ? '' : $@;
    like($err, qr/must run as root/, 'it combines with the cluster and admin key options');

    local @ARGV = qw(--rotate-all-storage-keys --only osd);
    $err = eval { $HOOKS->{parse_options}->(); 1 } ? '' : $@;
    like($err, qr/must run as root/, "and with '--only', which does not narrow client keys");

    my $help = $HOOKS->{usage}->();
    like(
        $help,
        qr/--rotate-all-storage-keys\s+rotate all dedicated users of managed local RBD and CephFS\s+storages\. Excludes 'client\.admin' and storages for external\s+clusters\. Requires Ceph 19\.2\.6-pve3, 20\.2\.4-pve3, or newer\s+installed on every monitor, followed by a restart of every\s+monitor\. Each key is staged rather than replaced at once\.\s+Refresh every consumer and external key copy, then confirm it\s+in a later run/,
        'help states scope, exclusions, the monitor requirement, staging, and the later'
            . ' confirmation',
    );
}

{
    my $files = { 'client.vm' => [{ store => 'rbd-vm' }], 'client.admin' => [{ store => 'cp' }] };
    my $bulk_abort = sub {
        my ($entity, $mapping) = @_;
        return eval {
            $HOOKS->{assert_abort_rotation_compatible}->(
                { 'rotate-all-storage-keys' => 1, 'abort-staged-key' => [$entity] }, $mapping,
            );
            1;
        } ? '' : $@;
    };
    like(
        $bulk_abort->('client.vm', $files),
        qr/rollback option for 'client\.vm' contradicts the rotation option/,
        'aborting a user the bulk option selects is refused',
    );
    is($bulk_abort->('client.admin', $files), '', 'client.admin is not selected by it');
    is($bulk_abort->('client.other', $files), '', 'nor is a user without a storage');
    is(
        $bulk_abort->('client.vm', { 'client.admin' => $files->{'client.admin'} }),
        '',
        'before the fresh mapping the user is not a storage user',
    );
    like(
        $bulk_abort->('client.vm', $files),
        qr/contradicts/,
        'the refreshed mapping after locking repeats the check',
    );
}

{
    my $files = { 'client.vm' => [{ store => 'rbd-vm' }] };
    my $guard = sub {
        my ($info, $opts, $state) = @_;
        return eval {
            $HOOKS->{assert_client_staging_supported}->($info, $opts, $state, $files);
            1;
        } ? '' : $@;
    };
    my $bulk = { 'rotate-all-storage-keys' => 1 };
    my $info = {
        exported => { 'client.vm' => { key => $OLD } },
        manual_promotion =>
            { supported => 0, disabled => 0, unsupported => ['b'], unanswered => [] },
    };
    like(
        $guard->($info, $bulk, {}),
        qr/the selected long-lived client keys were not changed because not every monitor can keep two client keys valid: monitors that do not report the option: b\. Install Ceph 19\.2\.6-pve3, 20\.2\.4-pve3, or newer on every monitor, and restart every monitor after the package update\. If that was already done, verify that the named monitors are running and that their nodes and admin sockets answer\./s,
        'an old monitor refuses the bulk option before any change and names the package floor,'
            . ' the restart, and the running-monitor check',
    );
    $info->{manual_promotion} =
        { supported => 0, disabled => 0, unsupported => [], unanswered => ['due'] };
    my $unanswered = $guard->($info, $bulk, {});
    like(
        $unanswered,
        qr/monitors that did not answer: due\. Install Ceph/,
        'an unanswered monitor is told apart from an old one and gets the same guidance',
    );
    unlike($unanswered, qr/do not report the option/, 'without calling it old');
    is($guard->($info, {}, {}), '', 'without a client-key option the guard is silent');
    is(
        $guard->({ %$info, exported => { 'client.vm' => { key => $NEW } } }, $bulk, {}),
        '',
        'a migrated user needs no monitor support',
    );
    is(
        $guard->(
            { %$info, exported => { 'client.vm' => { key => $OLD, pending_key => $NEW } } },
            $bulk,
            { staged => { 'client.vm' => { key => key_fingerprint($NEW), staged => 1 } } },
        ),
        '',
        'a key this script already staged resumes even after monitor support was lost',
    );
    $files = { 'client.admin' => [{ store => 'cp' }] };
    like(
        $guard->(
            { %$info, exported => { 'client.admin' => { key => $OLD } } },
            { 'rotate-all-storage-keys' => 1, 'rotate-admin-key' => 1 },
            {},
        ),
        qr/selected long-lived client keys were not changed/,
        'an admin-only bulk selection cannot bypass the staging support guard',
    );
}

{
    # the kernel gate sees the whole selected plan before any key changes
    my $plan = [
        { entity => 'client.vm', kernel => 1, staged => 1, bulk => 1 },
        { entity => 'client.shared', kernel => 0, staged => 1, bulk => 1 },
    ];
    my $old = { 'node-a' => { known => 1, supported => 0, release => '6.8.12-9-pve' } };
    my $output = '';
    my $verdict;
    {
        open(my $stdout, '>', \$output) or die $!;
        local *STDOUT = $stdout;
        $verdict = $HOOKS->{check_client_kernels}->($plan, { force => 0 }, $old);
    }
    is($verdict, 0, 'a node kernel without the new cipher refuses the bulk selection');
    like(
        $output,
        qr/The affected keys are: client\.vm\./,
        'and names the key a kernel client reads',
    );
    $output = '';
    {
        open(my $stdout, '>', \$output) or die $!;
        local *STDOUT = $stdout;
        $verdict = $HOOKS->{check_client_kernels}->(
            $plan, { force => 0 }, { 'node-a' => { known => 0, error => 'unreachable' } },
        );
    }
    is($verdict, 0, 'a node whose kernel cannot be verified refuses it too');
    like($output, qr/Could not verify kernel.*node-a.*unreachable/s, 'naming the node and why');
    is(
        $HOOKS->{check_client_kernels}->([$plan->[1]], { force => 0 }, $old),
        1,
        'a selection nothing in-kernel reads passes',
    );
}

# --- focused output: tool key summaries, no premature confirmation, no zero-node line ----------
{
    my $tools = $PVE::Ceph::KeyMigration::TOOL_CLIENT_KEYS;
    is(scalar(@$tools), 7, 'seven bootstrap and crash keys are the standard tool keys');
    my $info = migrated_info(picture(1));
    $info->{allowed_ciphers} = ['aes', 'aes256k'];
    $info->{exported} = {
        (map { $_ => { key => $NEW } } @$tools),
        'client.store' => { key => $OLD },
        'client.admin' => { key => $OLD },
    };
    $info->{manual_promotion} =
        { supported => 1, disabled => 0, unsupported => [], unanswered => [] };
    my $files = {
        'client.store' => [{ path => '/etc/pve/priv/ceph/store.keyring', store => 'store' }],
        'client.admin' => [{ path => '/etc/pve/priv/ceph.client.admin.keyring' }],
    };
    my $preflight = sub {
        my ($verbose, $apply) = @_;
        my $state = {};
        my $output = '';
        {
            no warnings qw(once redefine);
            local *main::file_set_contents = sub { };
            open(my $stdout, '>', \$output) or die $!;
            local *STDOUT = $stdout;
            $HOOKS->{preflight}->(
                $info,
                {
                    apply => $apply // 0,
                    verbose => $verbose,
                    'rotate-admin-key' => 1,
                    'rotate-storage-key' => ['store'],
                },
                0,
                $state,
                $files,
            );
        }
        return ($output, $state);
    };
    my ($concise, $state) = $preflight->(0);
    is(
        scalar(grep { defined($state->{client_refresh}->{$_}) } @$tools),
        7,
        'every tool key still gets its own refresh record',
    );
    my @summaries = grep { m/7 bootstrap and crash keys/ } split(/\n/, $concise);
    is(scalar(@summaries), 0, 'routine tool-key bookkeeping stays out of the default output');
    is(
        scalar(grep { defined($state->{client_refresh}->{$_}->{cleared}) } @$tools),
        7,
        'every tool record is closed in the in-memory preview',
    );
    unlike(
        $concise,
        qr/client\.bootstrap-mds|client\.crash/,
        'the default output does not list the tool keys one by one',
    );
    my ($verbose) = $preflight->(1);
    like(
        $verbose,
        qr/7 bootstrap and crash keys \(client\.bootstrap-mds, client\.bootstrap-mgr, client\.bootstrap-osd, client\.bootstrap-rbd, client\.bootstrap-rbd-mirror, client\.bootstrap-rgw, client\.crash\)/,
        'verbose output keeps every identity',
    );
    like(
        $verbose,
        qr/confirmation records will be closed on apply/,
        'a verbose dry run does not claim that it persisted the cleanup',
    );
    my ($applied) = $preflight->(1, 1);
    like(
        $applied,
        qr/confirmation records closed; Ceph's tools load keys afresh/,
        'verbose apply reports the completed bookkeeping, not another key rotation',
    );

    # the same records, already open, on a later run with every monitor answering
    my $reopened = {
        client_keys_seen => { map { $_ => key_fingerprint($NEW) } @$tools },
        client_refresh => { map { $_ => { rotated => 1, session_ids => [] } } @$tools },
    };
    my $later = '';
    {
        no warnings qw(once redefine);
        local *main::file_set_contents = sub { };
        open(my $stdout, '>', \$later) or die $!;
        local *STDOUT = $stdout;
        $HOOKS->{preflight}->($info, { apply => 0 }, 0, $reopened, $files);
    }
    unlike(
        $later,
        qr/bootstrap and crash keys/,
        'routine cleanup of existing tool records is also quiet by default',
    );
    unlike(
        $later,
        qr/no live session predates the key rotation of 'client\.bootstrap/,
        'not per key',
    );
    ok(
        !(grep { !defined($reopened->{client_refresh}->{$_}->{cleared}) } @$tools),
        'and none of them stays open to ask for a confirmation',
    );
    unlike($later, qr/--confirm-clients-refreshed client\.bootstrap/, 'so no command names them');
}

{
    # a run with nothing to plan, and the closing notes of an apply run, keep the exact commands
    my $snapshot = {
        health_checks => {},
        sessions => picture(1),
        exported => {
            'client.store' => { key => $NEW },
            'client.rgw.node1' => { key => $OLD },
            'client.osd-lockbox.1234' => { key => $OLD },
        },
        service_cipher => 'aes256k',
    };
    my $state = {
        client_keys_seen => { 'client.store' => key_fingerprint($NEW) },
        client_refresh => { 'client.store' => { rotated => 1, session_ids => [] } },
    };
    # what no option of this helper reaches, and the lockbox warning, are reported either way
    $snapshot->{health_checks} = {
        AUTH_INSECURE_CLIENT_KEY_TYPE => {
            detail => [
                map { { message => "entity $_ using insecure key type: aes" } }
                    qw(client.rgw.node1 client.osd-lockbox.1234)
            ],
        },
    };
    my $print = sub {
        my ($planned) = @_;
        my $output = '';
        no warnings qw(once redefine);
        local *main::file_set_contents = sub { };
        open(my $stdout, '>', \$output) or die $!;
        local *STDOUT = $stdout;
        $HOOKS->{print_open_options}->(
            { apply => 0 }, { 'client.store' => ['store'] }, $state, $snapshot, $planned,
        );
        return $output;
    };
    my $output = $print->(0);
    like(
        $output,
        qr/Ready for confirmation: client\.store\nConfirm only after refreshing every consumer, including disconnected ones and external key copies:\n\s+\S+ --apply --confirm-all-clients-refreshed/,
        'a ready record gets the direct heading and the exact confirmation command',
    );
    unlike($output, qr/only you can vouch for/, 'without the old phrase');
    {
        # Small inventories fit inline; large alias lists retain every identity when wrapped.
        my $offers = sub {
            my ($stores) = @_;
            my $offered = {
                health_checks => {
                    AUTH_INSECURE_CLIENT_KEY_TYPE => {
                        detail => [
                            map { { message => "entity $_ using insecure key type: aes" } }
                            sort keys %$stores
                        ],
                    },
                },
                sessions => picture(1),
                exported => { map { $_ => { key => $OLD } } sort keys %$stores },
                service_cipher => 'aes256k',
            };
            my $text = '';
            no warnings qw(once redefine);
            local *main::file_set_contents = sub { };
            open(my $fh, '>', \$text) or die $!;
            local *STDOUT = $fh;
            $HOOKS->{print_open_options}->({ apply => 0 }, $stores, {}, $offered, 0);
            return $text;
        };
        my $two = $offers->({ 'client.a' => ['rbd-a'], 'client.b' => ['rbd-b'] });
        like(
            $two,
            qr/--rotate-all-storage-keys: 'client\.a' \(storage rbd-a\); 'client\.b' \(storage rbd-b\)/,
            'several dedicated users are offered in bulk',
        );
        unlike(
            $two,
            qr/--rotate-storage-key/,
            'routine guidance keeps the documented bulk selection',
        );
        my $one = $offers->({ 'client.a' => ['rbd-a'] });
        like(
            $one,
            qr/--rotate-all-storage-keys: 'client\.a' \(storage rbd-a\)/,
            'a single dedicated user is offered the same way',
        );
        unlike($one, qr/compatible subset/, 'but there is no subset of one user to name');
        my @aliases = map { sprintf('storage%03d', $_) } 1 .. 50;
        my $shared = $offers->({ 'client.a' => \@aliases });
        my @lines = split(/\n/, $shared);
        ok(!grep({ length($_) > 100 } @lines), 'many aliases of one user keep bounded output');
        is_deeply(
            [sort($shared =~ m/\b(storage\d{3})\b/g)],
            \@aliases,
            'wrapping preserves every storage alias exactly once',
        );
        my $eight = $offers->({ map { ("client.user$_", ["storage$_"]) } 1 .. 8 });
        ok(
            !grep({ length($_) > 100 } split(/\n/, $eight)),
            'ordinary small batches are bounded too',
        );
        like(
            $one,
            qr/Rotate only when every consumer supports aes256k/,
            'and the kernel caveat stays',
        );
    }
    like(
        $output,
        qr/Remaining migration steps:.*--rotate-lockbox-keys/s,
        'and the remaining options are offered',
    );

    my $planned = $print->(1);
    unlike(
        $planned,
        qr/--apply|Ready for confirmation|Remaining migration steps/,
        'a dry run with a plan prints neither a confirmation command nor further options',
    );
    like(
        $planned,
        qr/Never rotate a 'client\.osd-lockbox' key by hand/,
        'but keeps the lockbox warning',
    );
    like(
        $planned,
        qr/Ready for their confirmation after this plan: client\.store/,
        'and names the rotations whose confirmation follows the plan',
    );
    like(
        $planned,
        qr/Left to whoever manages the client that reads them.*client\.rgw\.node1/s,
        'and the keys no option of this helper reaches',
    );
}

{
    my $output = '';
    {
        open(my $stdout, '>', \$output) or die $!;
        local *STDOUT = $stdout;
        $HOOKS->{probe_nodes}->(
            { daemons => { mon => [], mgr => [], mds => [], osd => [] } },
            { daemons => [], lockbox_keys => [], client_keys => [] },
            { apply => 1, verbose => 1 },
        );
    }
    unlike($output, qr/collecting daemon keyrings/, 'no node to probe prints no collection line');
}

{
    # the plan of a bulk selection: labels, counts, and the replace-at-once block
    my $info = {
        insecure_entities => {},
        exported => { map { $_ => { key => $OLD } } qw(client.crash client.vm client.other) },
        health_checks => {
            AUTH_INSECURE_CLIENT_KEY_TYPE => {
                detail => [
                    map { { message => "entity $_ using insecure key type: aes" } }
                        qw(client.crash client.vm client.other)
                ],
            },
        },
        allowed_ciphers => [qw(aes aes256k)],
        preferred_cipher => 'aes',
        mon_key_in_auth_db => 0,
        manual_promotion => { supported => 1, disabled => 0 },
        sessions => { complete => 1, clients => {} },
        daemons => { mon => [], mgr => [], mds => [], osd => [] },
    };
    my $stores = { 'client.vm' => ['rbd-vm'], 'client.other' => ['rbd-other'] };
    my $render = sub {
        my ($client_keys, $opts) = @_;
        my $plan = {
            mon_key => 0,
            daemons => [],
            client_keys => $client_keys,
            lockbox_keys => [],
            service_cipher => 0,
            stages_pending_keys => 1,
        };
        my $output = '';
        open(my $stdout, '>', \$output) or die $!;
        local *STDOUT = $stdout;
        $HOOKS->{print_plan}->($info, $plan, {}, { 'restart-daemons' => 0, %$opts }, $stores);
        return $output;
    };
    my $tool = {
        entity => 'client.crash',
        reason => "Ceph's own tools are the only ones that read it",
        files => [],
        staged => 0,
        kernel => 0,
    };
    my $resume = {
        entity => 'client.vm',
        reason => "used by managed local Ceph storage 'rbd-vm'",
        files => [{ path => '/etc/pve/priv/ceph/rbd-vm.keyring', store => 'rbd-vm' }],
        staged => 0,
        resume_only => 1,
        kernel => 0,
    };
    my $staged = {
        entity => 'client.other',
        reason => "used by managed local Ceph storage 'rbd-other'",
        files => [{ path => '/etc/pve/priv/ceph/rbd-other.keyring', store => 'rbd-other' }],
        staged => 1,
        bulk_new_staging => 1,
        kernel => 0,
    };

    my $mixed = $render->(
        [$tool, $resume], { 'rotate-all-storage-keys' => 1, 'rotate-client-keys' => 1 },
    );
    like(
        $mixed,
        qr/Ceph user 'client\.vm': resume writing its current key to every copy.*the tool key 'client\.crash': replaced at once; only Ceph's own tools read it, so there is nothing to stop/s,
        'a replaced tool key is one line without a consumer to stop, a resumed bulk user its own',
    );
    unlike(
        $mixed,
        qr/For each Ceph user marked 'replaced at once'/,
        'a tool key alone does not trigger the stop-consumers instruction',
    );
    unlike(
        $mixed,
        qr/bulk storage selection stages every newly rotated/,
        'the staging note is not printed when the plan stages no bulk key',
    );
    my $other = {
        entity => 'client.other',
        reason => "used by storage 'rbd-other'",
        files => [{ path => '/etc/pve/priv/ceph/rbd-other.keyring', store => 'rbd-other' }],
        staged => 0,
        kernel => 0,
    };
    like(
        $render->([$other, $resume], { 'rotate-storage-key' => ['rbd-other'] }),
        qr/Ceph user 'client\.other': replaced at once.*For each Ceph user marked 'replaced at once'.*stop every consumer/s,
        'a real user replaced at once keeps the safety block, whatever else the plan holds',
    );

    my $resume_alone = $render->([$resume], { 'rotate-all-storage-keys' => 1 });
    unlike(
        $resume_alone,
        qr/replaced at once/,
        'finishing the copies of a rotated key is not called a replacement',
    );

    my $staged_bulk = $render->([$staged, $resume], { 'rotate-all-storage-keys' => 1 });
    like(
        $staged_bulk,
        qr/Ceph user 'client\.other': staged next to the current key/,
        'a staged bulk key is listed as staged',
    );
    unlike(
        $staged_bulk,
        qr/bulk storage selection/,
        'without a policy line repeating what the key lines say',
    );
    unlike(
        $staged_bulk,
        qr/dedicated storage users 'client/,
        'the bulk selection leaves no dedicated storage user unselected',
    );
    like(
        $render->([$staged], { 'rotate-storage-key' => ['rbd-other'] }),
        qr/Ceph user keys not selected:.*dedicated storage users 'client\.vm'/,
        'a single-storage selection still names the dedicated users it leaves out',
    );
}

# --- a monitor election right before staging is waited out, an old monitor is not ---------------
{
    local $main::MONITOR_PROBE_RETRY_DELAY = 0;
    my $answers = sub { # a probe that sees a monitor outside the quorum for the first N calls
        my ($unanswered_calls, %final) = @_;
        my $calls = 0;
        return (
            sub {
                $calls++;
                return {
                    manual_promotion => $calls <= $unanswered_calls
                    ? {
                        supported => 0,
                        disabled => 0,
                        unsupported => [],
                        unanswered => ['due'],
                        }
                    : {
                        supported => 1,
                        disabled => 0,
                        unsupported => [],
                        unanswered => [],
                        %final,
                    },
                };
            },
            \$calls,
        );
    };

    my ($collect, $calls) = $answers->(2);
    my $settled = $HOOKS->{manual_promotion_with_retries}->($collect, 5);
    ok(
        $settled->{manual_promotion}->{supported} && $$calls == 3,
        'an unanswered monitor is asked again until it answers',
    );

    ($collect, $calls) = $answers->(99);
    $settled = $HOOKS->{manual_promotion_with_retries}->($collect, 4);
    is_deeply(
        [$settled->{manual_promotion}->{unanswered}, $$calls],
        [['due'], 4],
        'one that never answers is given up on after the attempts',
    );

    my $old_calls = 0;
    my $old = sub {
        $old_calls++;
        return { manual_promotion =>
            { supported => 0, disabled => 0, unsupported => ['b'], unanswered => [] } };
    };
    $settled = $HOOKS->{manual_promotion_with_retries}->($old, 5);
    is($old_calls, 1, 'a monitor that answered without the option is not asked again');

    # the same through the staging path: staging goes ahead once the election passed
    my $rados = StagedRotationRados->new(key => $OLD);
    my $state = {};
    my $probe_calls = 0;
    my $election = sub {
        $probe_calls++;
        return {
            manual_promotion => $probe_calls <= 2
            ? { supported => 0, disabled => 0, unsupported => [], unanswered => ['due'] }
            : {
                supported => 1,
                disabled => $rados->{disabled} ? 1 : 0,
                unsupported => [],
                unanswered => [],
            },
        };
    };
    my $err = run_staging($rados, $state, $election, picture(1), picture(1));
    is($err, '', 'staging succeeds after a passing election');
    ok(
        $rados->issued('config set') >= 1 && $rados->issued('auth get-or-create-pending') == 1,
        'the option is disabled and the key staged',
    );

    $rados = StagedRotationRados->new(key => $OLD);
    $err = run_staging(
        $rados,
        {},
        sub {
            return { manual_promotion =>
                { supported => 0, disabled => 0, unsupported => [], unanswered => ['due'] } };
        },
        picture(1),
    );
    like(
        $err,
        qr/monitors that did not answer: due\. Install Ceph/,
        'a monitor that stays unanswered still refuses with the guidance',
    );
    is($rados->issued('config set'), 0, 'without touching the option');
}

# --- a rotated tool key closes its record itself --------------------------------------------------
{
    my $crash_picture = sub {
        my (@ids) = @_;
        return {
            complete => 1,
            clients =>
                { 'client.crash' => [map { { global_id => $_, host => "node$_" } } @ids] },
        };
    };
    my $state = { client_keys_seen => { 'client.crash' => key_fingerprint($OLD) } };
    my $rados = ClientRotationRados->new($OLD);
    my @snapshots = ($crash_picture->(), $crash_picture->());
    my $snapshot = sub { return shift(@snapshots) // die "unexpected extra session snapshot\n" };
    my $output = '';
    {
        no warnings qw(once redefine);
        local *main::file_set_contents = sub { };
        open(my $stdout, '>', \$output) or die $!;
        local *STDOUT = $stdout;
        $HOOKS->{migrate_client}->(
            $rados, $state, { entity => 'client.crash', files => [] }, $snapshot,
        );
    }
    my $mark = $state->{client_refresh}->{'client.crash'};
    ok(
        defined($mark->{cleared}) && defined($mark->{acknowledged}),
        'the record of a rotated bootstrap or crash key is closed by the rotation itself',
    );
    like($output, qr/'client\.crash' now uses the 'aes256k' cipher/,
        'and the rotation is reported');

    my $returning = {
        client_keys_seen => { 'client.crash' => key_fingerprint($NEW) },
        client_refresh => { 'client.crash' => { rotated => 1, session_ids => [77] } },
    };
    my $info = migrated_info($crash_picture->(77));
    $info->{exported} = { 'client.crash' => { key => $NEW } };
    my $seen = '';
    {
        no warnings qw(once redefine);
        local *main::file_set_contents = sub { };
        open(my $stdout, '>', \$seen) or die $!;
        local *STDOUT = $stdout;
        $HOOKS->{preflight}->($info, { apply => 0 }, 0, $returning, {});
        $HOOKS->{print_open_options}->({}, {}, $returning, $info);
    }
    ok(
        !defined($returning->{client_refresh}->{'client.crash'}->{cleared}),
        'a returning recorded session keeps a tool record open',
    );
    like($seen, qr/may still hold the previous key/, 'and is reported as a consumer');
}

# --- the scope names only categories with work left; the closing line only what the run did -----
{
    my $output = '';
    my $info = {
        insecure_entities => {},
        health_checks => {},
        allowed_ciphers => ['aes256k'],
        preferred_cipher => 'aes256k',
        mon_key_in_auth_db => 0,
        pve_mon_key => $NEW,
        exported => { 'mon.' => { key => $NEW } },
        manual_promotion => { supported => 1, disabled => 0 },
        sessions => { complete => 1, clients => {} },
        daemons => { mon => [], mgr => [], mds => [], osd => [] },
    };
    my $plan = {
        mon_key => 0,
        daemons => [],
        client_keys => [{
            entity => 'client.vm',
            reason => "used by managed local Ceph storage 'rbd-vm'",
            files => [],
            staged => 1,
            bulk_new_staging => 1,
            kernel => 0,
        }],
        lockbox_keys => [],
        service_cipher => 0,
        stages_pending_keys => 1,
    };
    {
        open(my $stdout, '>', \$output) or die $!;
        local *STDOUT = $stdout;
        $HOOKS->{print_plan}->(
            $info, $plan, {}, { 'restart-daemons' => 0, 'rotate-all-storage-keys' => 1 }, {},
        );
    }
    unlike(
        $output,
        qr/Not touched by this run/,
        'a migrated cluster with one staged user left gets no list of untouched categories',
    );
}

{
    my $state = {
        staged => { 'client.app' => { key => key_fingerprint($NEW), written => 1 } },
        client_refresh => {
            'client.app' => { session_ids => [], measurement_incomplete => 1 },
        },
    };
    my $snapshot = {
        health_checks => { AUTH_INSECURE_KEYS_ALLOWED => {} },
        service_cipher => 'aes256k',
        pve_mon_key => $NEW,
        exported => { 'client.app' => { key => $OLD, pending_key => $NEW } },
        sessions => { complete => 0, clients => {}, unanswered => ['mon-b'] },
    };
    my $output = '';
    {
        open(my $stdout, '>', \$output) or die $!;
        local *STDOUT = $stdout;
        $HOOKS->{print_open_options}->({}, {}, $state, $snapshot);
    }
    like(
        $output,
        qr/Client keys awaiting action:.*'client\.app': consumer verification is incomplete\. Monitors that did not answer: mon-b\. Both keys\s+remain valid\. Retry after every monitor answers\./s,
        'a plain dry run explains a staged key hidden by an incomplete session picture',
    );
}

{
    my @many = map { sprintf('client.storage%02d', $_) } 1 .. 50;
    my $snapshot = {
        health_checks => {
            AUTH_INSECURE_CLIENT_KEY_TYPE => {
                detail =>
                    [map { { message => "entity $_ using insecure key type: aes" } } @many],
            },
        },
        service_cipher => 'aes256k',
        exported => { map { $_ => { key => $OLD } } @many },
        sessions => { complete => 1, clients => {} },
    };
    my $output = '';
    {
        open(my $stdout, '>', \$output) or die $!;
        local *STDOUT = $stdout;
        $HOOKS->{print_open_options}->(
            {}, { map { $_ => ["rbd-$_"] } @many }, {}, $snapshot,
        );
    }
    my @lines = split(/\n/, $output);
    cmp_ok(
        (sort { $b <=> $a } map { length($_) } @lines)[0],
        '<=',
        100,
        'the structured 50-user option output keeps every physical line bounded',
    );
    is(
        scalar(grep { m/^  'client\.storage\d+'/ } @lines),
        50,
        'the structured output lists every storage user on its own row',
    );
}

{
    my $dir = tempdir(CLEANUP => 1);
    my $item = {
        entity => 'client.app',
        files => [{ format => 'keyring', scope => 'cluster', path => "$dir/test.keyring" }],
    };
    my $entry = { entity => 'client.app', key => $NEW, caps => {} };
    my ($concise, $verbose) = ('', '');
    {
        open(my $stdout, '>', \$concise) or die $!;
        local *STDOUT = $stdout;
        $HOOKS->{write_client_key_copies}->($item, $entry, 0);
    }
    {
        open(my $stdout, '>', \$verbose) or die $!;
        local *STDOUT = $stdout;
        $HOOKS->{write_client_key_copies}->($item, $entry, 1);
    }
    unlike($concise, qr/test\.keyring/, 'routine keyring paths stay out of concise apply output');
    like($verbose, qr/test\.keyring/, 'verbose apply output retains routine keyring paths');

    my $journal = $HOOKS->{journal_retention_note}->();
    like(
        $journal,
        qr/until migration completion and access verification.*contains secret keys/s,
        'journal retention is tied to completed migration and verified access',
    );
    unlike($journal, qr/delete it afterwards/, 'intermediate runs no longer suggest deletion');
}

{
    my $info = migrated_info({
        complete => 1,
        clients => {
            'client.app' => [{ global_id => 11, host => 'node-a' }],
            'client.backup' => [{ global_id => 12, host => 'node-b' }],
        },
    });
    $info->{exported}->{'client.backup'} = { key => $NEW };
    my $state = {
        client_keys_seen => {
            'client.app' => key_fingerprint($NEW),
            'client.backup' => key_fingerprint($NEW),
        },
        client_refresh => {
            'client.app' => { rotated => 1, session_ids => [11] },
            'client.backup' => { rotated => 1, session_ids => [12] },
        },
    };
    my ($ordinary, $restrict) = ('', '');
    {
        no warnings qw(once redefine);
        local *main::file_set_contents = sub { };
        open(my $stdout, '>', \$ordinary) or die $!;
        local *STDOUT = $stdout;
        $HOOKS->{preflight}->($info, { apply => 0 }, 0, $state, {});
        $HOOKS->{print_open_options}->({}, {}, $state, $info);
    }
    is(
        scalar(() = $ordinary =~ m/A connected client can keep existing data connections/g),
        0,
        'routine waiting output omits the recurring ticket explanation',
    );
    is(
        scalar(() = $ordinary =~ m/session\(s\) may still hold the previous key/g),
        2,
        'the final waiting list retains one compact row per stale user',
    );

    $info->{health_checks}->{AUTH_INSECURE_KEYS_ALLOWED} = {};
    $info->{allowed_ciphers} = ['aes', 'aes256k'];
    $info->{preferred_cipher} = 'aes';
    {
        no warnings qw(once redefine);
        local *main::file_set_contents = sub { };
        open(my $stdout, '>', \$restrict) or die $!;
        local *STDOUT = $stdout;
        $HOOKS->{preflight}->($info, { apply => 0, 'restrict-ciphers' => 1 }, 0, $state, {});
    }
    unlike(
        $restrict,
        qr/Client-key refresh is still required/,
        'a restriction attempt does not repeat the preceding stale-user warning section',
    );
    is(scalar(() = $restrict =~ m/client\.app/g), 1,
        'its restriction blocker names each user once');
    is(
        scalar(() = $restrict =~ m/client\.backup/g),
        1,
        'the second restriction blocker is deduplicated too',
    );
}

{
    my $state = {
        staged => {
            'client.app' => {
                key => key_fingerprint($NEW),
                written => 1,
                aborting => 1,
                abort_written => 2,
                abort_retired => 3,
            },
        },
    };
    my $output = '';
    {
        open(my $stdout, '>', \$output) or die $!;
        local *STDOUT = $stdout;
        $HOOKS->{settle_staged}->(
            undef,
            { exported => { 'client.app' => { key => $OLD } } },
            $state,
            { apply => 0 },
            {},
        );
        $HOOKS->{print_open_options}->(
            {},
            {},
            $state,
            { exported => { 'client.app' => { key => $OLD } }, sessions => picture(1) },
        );
    }
    like(
        $output,
        qr/no longer pending.*--apply'.*reconcile/s,
        'dry rollback recovery names reconciliation',
    );
    unlike(
        $output,
        qr/both keys remain valid/i,
        'dry recovery does not promise a retired credential',
    );
    unlike(
        $output,
        qr/confirm-abort-clients-refreshed/,
        'dry recovery does not offer a second retirement',
    );
}

{
    for my $case (qw(enabled unsupported abort)) {
        my $rados = StagedRotationRados->new(key => $OLD, pending => $NEW, disabled => 0);
        my $support = {
            supported => $case eq 'unsupported' ? 0 : 1,
            disabled => 0,
            unsupported => $case eq 'unsupported' ? ['mon-old'] : [],
            unanswered => [],
        };
        my $state = { staged => { 'client.cp' => { key => key_fingerprint($NEW), written => 1 } } };
        my $info = {
            exported => { 'client.cp' => { key => $OLD, pending_key => $NEW } },
            manual_promotion => $support,
        };
        my $files = { 'client.cp' => [{ store => 'fs', format => 'secret' }] };
        my @remote_grace;
        my $err;
        {
            no warnings qw(once redefine);
            local *main::file_set_contents = sub { };
            local *PVE::Cluster::cfs_update = sub { };
            local *PVE::Cluster::get_nodelist = sub { return [PVE::INotify::nodename()] };
            local *main::run_command = sub {
                my ($command, %param) = @_;
                push @remote_grace, $rados->{disabled};
                $param{outfunc}->($command->[-1] eq 'inspect' ? 'mounted' : 'remounted');
            };
            eval {
                $HOOKS->{settle_staged}->(
                    $rados,
                    $info,
                    $state,
                    {
                        apply => 1,
                        $case eq 'abort' ? ('abort-staged-key' => ['client.cp']) : (),
                    },
                    $files,
                    grace_collect(
                        $rados,
                        supported => $support->{supported},
                        unsupported => $support->{unsupported},
                    ),
                );
            };
            $err = $@;
        }
        if ($case eq 'enabled') {
            is($err, '', 'forward refresh restores the grace setting when needed');
            is_deeply(
                \@remote_grace,
                [1, 1],
                'grace is restored before any managed mount uses the pending key',
            );
        } elsif ($case eq 'unsupported') {
            like(
                $err,
                qr/not every monitor can keep two client keys valid/,
                'unsupported grace refuses forward refresh',
            );
            is_deeply(\@remote_grace, [], 'unsupported monitors cause no forward mount operation');
        } else {
            is($err, '', 'rollback preparation may proceed without a forward refresh');
            is_deeply(
                \@remote_grace,
                [],
                'a requested rollback does not first remount with the pending key',
            );
        }
    }
}

{
    my $user = 'client.cp';
    for my $retire (0, 1) {
        my $sessions = {
            complete => 1,
            clients => {
                $user => [{
                    global_id => 7,
                    host => 'node-a',
                    key_fingerprint => key_fingerprint($OLD),
                }],
            },
        };
        my $rados = StagedRotationRados->new(key => $OLD, pending => $NEW);
        my $state = {
            client_keys_seen => { $user => key_fingerprint($OLD) },
            client_refresh => { $user => { session_ids => [7] } },
            staged => {
                $user => {
                    key => key_fingerprint($NEW),
                    written => 1,
                    aborting => 1,
                    abort_written => 1,
                    abort_key => key_fingerprint($OLD),
                },
            },
        };
        my $info = migrated_info($sessions);
        $info->{exported} = { $user => { key => $OLD, pending_key => $NEW } };
        $info->{rados} = $rados;
        my $opts = $retire ? { apply => 1, 'confirm-abort-clients-refreshed' => [$user] } : {};
        my $output = '';
        {
            no warnings qw(once redefine);
            local *main::file_set_contents = sub { };
            local *PVE::Cluster::cfs_update = sub { };
            local *PVE::Cluster::get_members = sub { return {} };
            open(my $stdout, '>', \$output) or die $!;
            local *STDOUT = $stdout;
            $HOOKS->{settle_staged}->($rados, $info, $state, $opts, {});
            $HOOKS->{preflight}->($info, $opts, 0, $state, {});

            if ($retire) {
                $HOOKS->{retire_aborted}
                    ->($rados, $state, [$user], sub { return { sessions => $sessions } });
                $info->{exported} = { $user => { key => $OLD } };
            }
            $HOOKS->{print_open_options}->($opts, {}, $state, $info);
        }
        unlike(
            $output,
            qr/previous key|--confirm-clients-refreshed/,
            'restored-key sessions never get forward-stale or promotion advice during rollback',
        );
        is(
            scalar(() = $output =~ /rollback is prepared/g),
            $retire ? 0 : 1,
            'prepared rollback state appears once, and not before its requested retirement',
        );
        is(
            scalar(() = $output =~ /--confirm-abort-clients-refreshed/g),
            $retire ? 0 : 1,
            'the reverse command is offered only when it remains an operator action',
        );
        if ($retire) {
            like(
                $output,
                qr/rollback of 'client.cp' is complete/,
                'retirement keeps its outcome proof',
            );
            is($rados->issued('auth clear-pending'), 1, 'one requested retirement still happens');
        }
    }
}

{
    my $info = migrated_info(picture(1));
    $info->{manual_promotion} = { supported => 1, disabled => 1 };
    $info->{exported} = { 'client.app' => { key => $OLD, pending_key => $NEW } };
    my $state = {
        client_keys_seen => { 'client.app' => key_fingerprint($OLD) },
        client_refresh => { 'client.app' => { session_ids => [] } },
        staged => { 'client.app' => { key => key_fingerprint($NEW), written => 1 } },
        mount_refresh => {
            'client.app' => {
                target => key_fingerprint($NEW),
                pending => { cephfs => { tre => { phase => 'remount' } } },
            },
        },
    };
    my $output = '';
    {
        no warnings qw(once redefine);
        local *main::file_set_contents = sub { };
        open(my $stdout, '>', \$output) or die $!;
        local *STDOUT = $stdout;
        $HOOKS->{settle_staged}->(undef, $info, $state, {}, {});
        $HOOKS->{preflight}->($info, {}, 0, $state, {});
        $HOOKS->{print_open_options}->({}, {}, $state, $info);
    }
    like(
        $output,
        qr/'cephfs' on\s+node 'tre'/,
        'the dry run names the actual queued mount and node',
    );
    like(
        $output,
        qr/Free busy mounts.*--apply/s,
        'the mount must be released before a plain apply retry',
    );
    unlike(
        $output,
        qr/rotation option|older journal|--confirm-clients-refreshed/,
        'mount guidance neither obscures the action nor offers premature retirement',
    );
    is(scalar(() = $output =~ /CephFS refresh pending/g), 1, 'the queued mount is reported once');
}

{
    my $snapshot = {
        health_checks => {},
        service_cipher => 'aes256k',
        preferred_cipher => 'aes256k',
        allowed_ciphers => ['aes256k'],
        pve_mon_key => $NEW,
        exported => { 'mon.' => { key => $NEW }, 'client.app' => { key => $NEW } },
        sessions => picture(1),
    };
    my $output = '';
    {
        open(my $stdout, '>', \$output) or die $!;
        local *STDOUT = $stdout;
        $HOOKS->{print_closing_notes}->(undef, {}, {}, 0, 0, {}, 1, {}, $snapshot);
    }
    like(
        $output,
        qr/Cephx migration is complete/,
        'the fully migrated state has an explicit summary',
    );
    unlike($output, qr/\n\n\nWARN: Keep/, 'journal retention has no double blank separator');
    like(
        $output,
        qr/Keep \S+ until access verification\./,
        'completion leaves access verification as the journal retention condition',
    );
    unlike(
        $output,
        qr/until migration completion/,
        'completed migration is not described as pending',
    );
    for my $state (
        { client_refresh => { 'client.app' => { session_ids => [] } } },
        { staged => { 'client.app' => { key => key_fingerprint($NEW) } } },
    ) {
        my $text = '';
        open(my $stdout, '>', \$text) or die $!;
        {
            local *STDOUT = $stdout;
            $HOOKS->{print_open_options}->({}, {}, $state, $snapshot);
        }
        unlike($text, qr/migration is complete/, 'unfinished records cannot inherit the summary');
    }
}

{
    for my $record (
        { phase => 'staging' }, { phase => 'writing', key => key_fingerprint('foreign') },
    ) {
        my $rados = StagedRotationRados->new(key => $OLD, pending => $NEW);
        my $error = eval {
            $HOOKS->{resume_live_swap}
                ->($rados, { live_swap => { 'osd.1' => $record } }, { entity => 'osd.1' });
            1;
        } ? '' : $@;
        like(
            $error,
            qr/cannot prove ownership.*interrupted helper staging.*another auth writer/s,
            'ambiguous ownership includes the helper interruption window',
        );
        is($rados->issued('auth clear-pending'), 0, 'uncertain origin never authorizes clearing');
        is($rados->issued('auth commit-pending'), 0, 'uncertain origin never authorizes promotion');
    }
}

{
    my $check = 'AUTH_INSECURE_CLIENT_KEY_TYPE';
    for my $case (
        ['current clients', { 'client.app' => { key => $NEW } }, 1, 0],
        ['old client', { 'client.app' => { key => $OLD } }, 0, 1],
        ['unknown client key', { 'client.app' => { key => 'invalid' } }, 0, 0],
        ['missing client key', { 'client.app' => {} }, 0, 0],
        ['missing export', undef, 0, 0],
        ['no clients', { 'osd.1' => { key => $OLD } }, 1, 0],
        ['pending new key', { 'client.app' => { key => $OLD, pending_key => $NEW } }, 0, 0],
        ['pending old key', { 'client.app' => { key => $NEW, pending_key => $OLD } }, 1, 0],
        [
            'unmanaged old client',
            { 'client.app' => { key => $NEW }, 'client.external' => { key => $OLD } },
            0,
            1,
        ],
    ) {
        my ($name, $exported, $current, $mute) = @$case;
        my $snapshot = {
            health_checks => {
                $check => {
                    severity => 'HEALTH_WARN',
                    summary => { message => '1 auth client entities with insecure key types' },
                },
            },
            service_cipher => 'aes256k',
            preferred_cipher => 'aes256k',
            allowed_ciphers => ['aes256k'],
            pve_mon_key => $NEW,
            exported => $exported,
            sessions => picture(1),
        };
        my $output = '';
        {
            open(my $stdout, '>', \$output) or die $!;
            local *STDOUT = $stdout;
            $HOOKS->{print_closing_notes}->(undef, {}, {}, 0, 0, {}, 1, {}, $snapshot);
        }
        like(
            $output,
            qr/$check: 1 auth client entities/,
            "$name: the reported warning stays visible",
        );
        is(
            scalar(
                () =
                    $output =~ /$check:.*current client keys use 'aes256k', not recomputed yet/g
            ),
            $current,
            "$name: the current-key annotation follows the export",
        );
        is(
            scalar(() = $output =~ /ceph health mute/g),
            $mute,
            "$name: mute advice requires an old client key without a staged successor",
        );
        like(
            $output,
            qr/until migration completion and access verification/,
            "$name: retain recovery keys",
        ) if $name ne 'current clients';
    }
}

# Consent covers recovery and confirmations, not only the daemon plan printed after them.
{
    for my $request (
        { apply => 1, 'confirm-all-clients-refreshed' => 1, 'restrict-ciphers' => 1 },
        { apply => 1, 'abort-staged-key' => ['client.app'] },
        { apply => 1, 'confirm-abort-clients-refreshed' => ['client.app'] },
        { apply => 1, 'confirm-clients-refreshed' => ['client.app'] },
    ) {
        my ($result, $error, $output);
        my $locked = 0;
        my $asked = 0;
        {
            no warnings qw(once redefine);
            local *PVE::RPCEnvironment::setup_default_cli_env = sub { };
            local *PVE::Ceph::Tools::check_ceph_inited = sub { };
            local *PVE::Ceph::Tools::get_config = sub { '/etc/pve/ceph.conf' };
            local *PVE::Storage::config = sub { return { ids => {} }; };
            local *PVE::Ceph::KeyMigration::ClusterLock::take = sub {
                $locked++;
                die "execution reached the cluster lock after cancellation\n";
            };
            local *STDOUT;
            open(STDOUT, '>', \$output) or die $!;
            eval {
                $result = $HOOKS->{run_migration}->(
                    $request,
                    sub {
                        $asked++;
                        return $HOOKS->{confirm_apply_run}->($_[0], 1, sub { "n\n" });
                    },
                );
            };
            $error = $@;
        }
        is($error, '', 'declining an apply run does not reach execution');
        is($result, 0, 'declining is a successful cancellation');
        is($asked, 1, 'the whole invocation requires consent once');
        is($locked, 0, 'cancellation precedes journal loading, recovery, and key confirmation');
        like($output, qr/Requested changes were not applied/, 'cancellation reports its scope');
    }

    for my $case (
        [{ apply => 1 }, 1, "yes\n", 1],
        [{ apply => 1 }, 1, " Y \n", 1],
        [{ apply => 1 }, 1, "\n", 0],
        [{ apply => 1 }, 1, undef, 0],
        [{ apply => 1 }, 1, "maybe\n", 0],
        [{ apply => 1 }, 0, "yes\n", undef],
        [{ apply => 1, 'assume-yes' => 1 }, 0, undef, 1],
        [{}, 0, undef, 1],
    ) {
        my ($opts, $interactive, $answer, $expected) = @$case;
        my ($result, $output);
        my $read = 0;
        {
            local *STDOUT;
            open(STDOUT, '>', \$output) or die $!;
            $result = $HOOKS->{confirm_apply_run}->(
                $opts, $interactive, sub { $read++; return $answer; },
            );
        }
        is($result, $expected, 'only an explicit yes or --assume-yes authorizes an apply run');
        is(
            $read,
            $opts->{apply} && !$opts->{'assume-yes'} && $interactive ? 1 : 0,
            'dry runs, --assume-yes, and non-terminal input do not read an answer',
        );
    }
}

{
    my $entity = 'client.admin';
    my $target = key_fingerprint($NEW);
    my $info = migrated_info({
        complete => 1,
        clients => {
            $entity => [
                map {
                    { global_id => $_, host => 'mits8', key_fingerprint => $target }
                } 1 .. 64
            ],
        },
    });
    $info->{allowed_ciphers} = ['aes', 'aes256k'];
    $info->{exported}->{$entity} = { key => $OLD, pending_key => $NEW };
    my $state = {
        client_keys_seen => { $entity => key_fingerprint($OLD) },
        staged => { $entity => { key => $target, written => 1 } },
        client_refresh => { $entity => { rotated => 1, session_ids => [] } },
    };
    my $files = { $entity => [{ format => 'secret', store => 'cephfs' }] };
    my ($result, $output);
    {
        no warnings qw(once redefine);
        local *main::file_set_contents = sub { };
        local *main::run_command = sub { die "unexpected host-wide consumer probe\n"; };
        local *STDOUT;
        open(STDOUT, '>', \$output) or die $!;
        $result = $HOOKS->{preflight}->(
            $info, { 'restrict-ciphers' => 1 }, 0, $state, $files,
        );
    }
    is($result, -1, 'restriction remains blocked by the staged key');
    like(
        $output,
        qr/FAIL: Cannot restrict the allowed ciphers to 'aes256k' yet:/,
        'the refusal does not assert that it found a consumer that would stop',
    );
    like(
        $output,
        qr/CephFS mounts need inspection:\s+cephfs.*--apply.*inspect and refresh/s,
        'preflight supplies its storage mapping to the shared prerequisite report',
    );
    unlike(
        $output,
        qr/64 live|Possible consumers|a client would be stopped|--confirm-clients-refreshed/,
        'no broad guest inventory or premature confirmation obscures the required inspection',
    );
    ok(!(grep { length($_) > 100 } split(/\n/, $output)), 'the refusal wraps at 100 columns');
}

{
    local $main::MONITOR_PROBE_RETRY_DELAY = 0;
    my $calls = 0;
    my $snapshot;
    my $output;
    {
        local *STDOUT;
        open(STDOUT, '>', \$output) or die $!;
        $snapshot = $HOOKS->{session_snapshot_with_retries}->(
            sub {
                $calls++;
                return picture(0, 1) if $calls == 1;
                die "monitor election\n" if $calls == 2;
                return picture(1, 2);
            },
            4,
        );
    }
    is($calls, 3, 'session sampling retries incomplete and failed election sweeps');
    ok($snapshot->{complete}, 'a complete retry supplies the measurement boundary');
    is_deeply(
        $snapshot->{clients},
        picture(1, 2)->{clients},
        'the current session picture does not include disconnected retry observations',
    );
    my $record = PVE::Ceph::KeyMigration::merge_refresh_record(
        undef, $snapshot, 'client.app', 1,
    );
    is_deeply(
        $record->{session_ids},
        [1, 2],
        'the baseline retains a session seen only in an incomplete retry',
    );
    {
        local *STDOUT;
        open(STDOUT, '>', \$output) or die $!;
        $snapshot = $HOOKS->{session_snapshot_with_retries}->(sub { picture(0, 3) }, 2);
    }
    ok(
        !$snapshot->{complete},
        'exhausting retries does not turn a partial sweep into a complete one',
    );
    like(
        $output,
        qr/confirmation needs a complete measurement/,
        'exhausted observations keep the confirmation prerequisite visible',
    );
}

for my $aggregate (0, 1) {
    my $target = key_fingerprint($NEW);
    my @entities = ($aggregate ? ('client.store') : (), 'client.admin');
    my ($rados, $info, $state) = aggregate_fixture({ complete => 1, clients => {} }, @entities);
    my $old_id = $state->{client_refresh}->{'client.admin'}->{session_ids}->[0];
    my $fresh_mounts = [
        map {
            { global_id => $_, host => "node-$_", key_fingerprint => $target }
        } 201 .. 203
    ];
    $info->{sessions}->{clients}->{'client.admin'} = [
        @$fresh_mounts,
        {
            global_id => $old_id,
            host => 'old-client',
            key_fingerprint => key_fingerprint($OLD),
        },
    ];
    $info->{allowed_ciphers} = ['aes', 'aes256k'];
    $state->{client_refresh}->{'client.admin'}->{measurement_incomplete} = 1;
    $state->{mount_refresh}->{'client.admin'} = { target => $target, finished => 1 };
    my $files = { 'client.admin' => [{ format => 'secret', store => 'cephfs' }] };
    my $opts = {
        apply => 1,
        'restrict-ciphers' => 1,
        $aggregate
        ? ('confirm-all-clients-refreshed' => 1)
        : ('confirm-clients-refreshed' => ['client.admin']),
    };
    my $output;
    my $run = sub {
        no warnings qw(once redefine);
        local *main::file_set_contents = sub { };
        local *main::run_command = sub { die "unexpected host probe\n"; };
        $output = '';
        local *STDOUT;
        open(STDOUT, '>', \$output) or die $!;
        return $HOOKS->{preflight}->(
            $info,
            $opts,
            0,
            $state,
            $files,
            sub { { sessions => $info->{sessions} } },
            sub {
                return {
                    %$info,
                    exported => { map { $_ => { %{ $rados->{entries}->{$_} } } } @entities },
                };
            },
        );
    };
    is($run->(), -1, 'the first complete measurement still refuses premature confirmation');
    is_deeply($rados->{committed}, [], 'no ready key is committed before the batch is ready');
    is_deeply(
        $state->{client_refresh}->{'client.admin'}->{session_ids},
        [$old_id],
        'measurement does not mark the three refreshed mount sessions as stale',
    );
    $info->{sessions}->{clients}->{'client.admin'} = $fresh_mounts;
    is($run->(), -1, 'singular confirmation measures only after the connected blocker clears')
        if !$aggregate;
    ok(
        !$state->{client_refresh}->{'client.admin'}->{measurement_incomplete},
        'the complete measurement does not require refreshing the target-key mounts',
    );
    my $verdict = $run->();
    diag($output) if $verdict <= 0;
    cmp_ok(
        $verdict,
        '>',
        0,
        'the same finishing command passes after only the stale consumer refreshes',
    );
    is_deeply(
        $rados->{committed},
        \@entities,
        'the unchanged mount sessions do not prevent committing the selected keys',
    );
}

{
    local $main::MONITOR_PROBE_RETRY_DELAY = 0;
    my $rados = StagedRotationRados->new(key => $OLD);
    my $state = {};
    my $new_session = cp_picture(1, 4);
    $new_session->{clients}->{'client.cp'}->[0]->{key_fingerprint} = key_fingerprint($NEW);
    my @samples = (cp_picture(0, 1), cp_picture(1, 2), cp_picture(0, 3), $new_session);
    my ($error, $output);
    {
        no warnings qw(once redefine);
        local *main::file_set_contents = sub { };
        local *STDOUT;
        open(STDOUT, '>', \$output) or die $!;
        eval {
            $HOOKS->{stage_client}->(
                $rados,
                $state,
                { entity => 'client.cp', files => [] },
                sub {
                    $HOOKS->{session_snapshot_with_retries}->(sub { shift @samples }, 3);
                },
                grace_collect($rados),
            );
        };
        $error = $@;
    }
    is($error, '', 'staging survives incomplete pre- and post-stage session sweeps');
    is(scalar(@samples), 0, 'both staging snapshots wait for their complete sweep');
    is_deeply(
        $state->{client_refresh}->{'client.cp'}->{session_ids},
        [1, 2, 3],
        'staging retains every ambiguous retry observation but not a target-key session',
    );
    ok(
        !$state->{client_refresh}->{'client.cp'}->{measurement_incomplete},
        'successful retries avoid an unnecessary later first measurement',
    );
}

{
    for my $state (
        {},
        { client_refresh => { 'client.admin' => { session_ids => [1], cleared => 2 } } },
        { rotated => { 'client.admin' => 1 }, done => { 'client.admin' => 2 } },
        { plan => { 'mgr.a' => { type => 'mgr', id => 'a', node => 'node-a' } } },
    ) {
        my $asked = 0;
        my $gate = $HOOKS->{apply_consent_gate}->(
            { apply => 1, 'rotate-cluster-keys' => 1 }, sub { $asked++; return 0; }, 1,
        );
        ok($gate->(), 'ordinary interactive apply can reach journal inspection without asking');
        ok($gate->($state), 'ordinary journal state permits planning before consent');
        is($asked, 0, 'ordinary apply has not asked before the plan is shown');
        is($gate->($state, 1), 0, 'declining the displayed plan prevents its execution');
        is($gate->($state, 1), 0, 'cancellation remains effective at later consent checks');
        is($asked, 1, 'a cancelled plan does not ask again');
    }
    for my $state (
        { rotated => { 'client.admin' => 1 } },
        { live_swap => { 'client.admin' => {} } },
        { noout_owned => ['osd.1'] },
        { preferred_cipher_was => 'aes' },
        { client_grace => { previous => 1 } },
        { staged => { 'client.admin' => { key => key_fingerprint($NEW), written => 1 } } },
        { staged => { 'client.app' => { aborting => 1 } } },
        { lockbox => { 'client.osd-lockbox.abc' => {} } },
        { new_keys => {} },
        { admin_recovery => {} },
    ) {
        my ($asked, $output) = (0, '');
        local *STDOUT;
        open(STDOUT, '>', \$output) or die $!;
        my $gate = $HOOKS->{apply_consent_gate}->(
            { apply => 1 }, sub { $asked++; return 0; }, 1,
        );
        ok($gate->(), 'journal-dependent recovery consent waits for the locked journal');
        is($gate->($state), 0, 'declining prevents pre-plan recovery');
        is($asked, 1, 'recovery requires consent before the plan');
        like(
            $output,
            qr/before the remaining plan can be shown/,
            'the early question explains why recovery precedes the plan',
        );
    }
    for my $opts ({}, { apply => 1, 'assume-yes' => 1 }) {
        my $gate = $HOOKS->{apply_consent_gate}->($opts, sub { die "unexpected question\n"; }, 0);
        ok($gate->(), 'dry runs and explicit noninteractive authorization do not ask');
        ok(
            $gate->({ client_grace => {} }),
            'recovery does not add a question after explicit consent',
        );
        ok($gate->({}, 1), 'the plan does not add a question after explicit consent');
    }
    my $asked = 0;
    my $gate = $HOOKS->{apply_consent_gate}->(
        { apply => 1 }, sub { $asked++; return undef; }, 0,
    );
    is($gate->(), undef, 'noninteractive refusal occurs before journal inspection');
    is($gate->({}, 1), undef, 'noninteractive refusal cannot become plan approval');
    is($asked, 1, 'noninteractive refusal is final for this invocation');
    my $output;
    local *STDOUT;
    open(STDOUT, '>', \$output) or die $!;
    $asked = 0;
    $gate = $HOOKS->{apply_consent_gate}->(
        { apply => 1, 'confirm-all-clients-refreshed' => 1 }, sub { $asked++; return 1; }, 1,
    );
    ok($gate->(), 'explicit confirmations require consent before journal inspection');
    ok($gate->({ staged => { 'client.admin' => {} } }), 'accepted consent covers recovery');
    ok($gate->({}, 1), 'accepted consent covers the remaining plan');
    is($asked, 1, 'an accepted invocation asks only once');
}

done_testing();
