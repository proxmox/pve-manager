#!/usr/bin/perl

use strict;
use warnings;

use lib ('.', '..');

use Test::More;

use FindBin;
use PVE::Ceph::KeyMigration qw(
    $CIPHER $LEGACY_CIPHER
    key_cipher key_fingerprint parse_probe_output osd_label_identity needs_rotation mon_keyring_stale
    mon_key_rotation_wanted migration_unfinished unfinished_entities touched_daemons
    plan_client_keys build_plan
    configured_daemon_locations resolve_configured_locations merge_configured_daemons
    resume_verdict classify_insecure_clients
    open_options open_actions
    summarize_sessions session_hosts stale_consumers restrict_blockers cephfs_mount_storages
    ack_decision finish_after_acks
    plan_lockbox_keys parse_lockbox_output
);

# Real keys from a Ceph 19.2.6 cluster, not keys built the way key_cipher() reads them: the point
# is to check this against what Ceph actually writes.
my $NEW = 'AgCk941qku/sDSAAIjO5RhRv/ogXhuxccNS4DZxlXS1LUgzEGFIiY/U7IlI=';
my $OLD = 'AQCP/Y5qflfDFxAAPII6O9qSA7p65js5CEJYDA==';
my $NONE = 'AACP/Y5qnzxSGAAA';

# 'ceph-bluestore-tool show-label' pretty-prints, and the probe only strips the newlines, so what
# the parser really sees is one line full of runs of spaces.
my $LABEL = <<'LABEL_EOF';
{
    "/var/lib/ceph/osd/ceph-2/block": {
        "osd_uuid": "9d4ef7d6-6ce8-4192-938a-cfe0ced279a5",
        "size": 16106127360,
        "btime": "2019-07-12T14:45:04.029467+0200",
        "ceph_fsid": "e3bcf831-39e8-4db3-a458-bbfa643a139d",
        "whoami": "2",
        "osd_key": "AgCk941qku/sDSAAIjO5RhRv/ogXhuxccNS4DZxlXS1LUgzEGFIiY/U7IlI=",
        "ready": "ready",
        "require_osd_release": "19"
    }
}
LABEL_EOF

# the probe strips the newlines and nothing else, which is what the parser has to cope with
$LABEL =~ s/\n//g;

# --- the cipher a key carries -------------------------------------------------------------
is(key_cipher($NEW), 2, 'an aes256k key from the cluster reads as aes256k');
is(key_cipher($OLD), 1, 'a legacy key from ceph-authtool reads as legacy');
is(key_cipher($NONE), 0, 'a 12 byte "none" key is the shortest real key and still readable');
is(
    key_cipher('not base64 at all !!'),
    undef,
    'garbage is unknown: decode_base64 drops junk silently, and a short decode that happened to'
        . ' start with 2 would otherwise read as already migrated',
);
is(key_cipher(''), undef, 'an empty key is unknown');
is(key_cipher(undef), undef, 'an undefined key is unknown');

# the state file records progress, so a marker must not become somewhere a key is kept
unlike(key_fingerprint($NEW), qr/\Q$NEW\E/, 'a fingerprint does not carry the key it names');
isnt(key_fingerprint($NEW), key_fingerprint($OLD), 'different keys get different fingerprints');

# --- reading what a node reported ----------------------------------------------------------
{
    my $probes = parse_probe_output(
        "label osd:2 $LABEL\n"
            . "keyring mgr:one [mgr.one]\n"
            . "keyring mds:two [mds.two][client.admin]\n"
            . "store mds:three missing\n"
            . "error osd:9 'ceph-bluestore-tool' failed: exit status 1"
            . " (bluestore(...) not a block device)\n"
            . "something else entirely\n",
    );
    is($probes->{'osd:2'}->{store}, 'block', 'a real label parses as a usable bluestore');
    is($probes->{'osd:2'}->{'label-whoami'}, '2', 'whoami comes out of it');
    is($probes->{'osd:2'}->{'label-key'}, $NEW, 'and the key, which is what verifies a write');
    like($probes->{'osd:2'}->{'label-fsid'}, qr/^[0-9a-f-]{36}$/, 'the cluster fsid comes out too');
    is(
        $probes->{'osd:2'}->{'label-osd-uuid'},
        '9d4ef7d6-6ce8-4192-938a-cfe0ced279a5',
        'and the per-OSD UUID distinguishes a reused ID from its old device',
    );

    my $identity = {
        id => '2',
        down => 1,
        'osd-uuid' => '9d4ef7d6-6ce8-4192-938a-cfe0ced279a5',
        $probes->{'osd:2'}->%*,
    };
    is(
        osd_label_identity($identity, 'e3bcf831-39e8-4db3-a458-bbfa643a139d'),
        'ok',
        'the current OSD incarnation accepts its own device',
    );
    is(
        osd_label_identity(
            { %$identity, 'label-whoami' => '7' },
            'e3bcf831-39e8-4db3-a458-bbfa643a139d',
        ),
        'wrong-id',
        'a label for another OSD ID is still refused',
    );
    is(
        osd_label_identity(
            { %$identity, 'label-fsid' => 'c452afbd-c4bd-4219-994c-cd93a144dbb7' },
            'e3bcf831-39e8-4db3-a458-bbfa643a139d',
        ),
        'wrong-cluster',
        'a label from another cluster is still refused',
    );
    is(
        osd_label_identity(
            { %$identity, 'osd-uuid' => '11c76ab5-9237-478e-9860-88c8215bb2fe' },
            'e3bcf831-39e8-4db3-a458-bbfa643a139d',
        ),
        'wrong-uuid',
        'an old device with the same ID and cluster FSID is refused after ID reuse',
    );
    is(
        osd_label_identity(
            { %$identity, 'label-osd-uuid' => undef },
            'e3bcf831-39e8-4db3-a458-bbfa643a139d',
        ),
        'incomplete',
        'a label without its per-OSD UUID proves too little',
    );
    is(
        osd_label_identity(
            { %$identity, 'osd-uuid' => undef },
            'e3bcf831-39e8-4db3-a458-bbfa643a139d',
        ),
        'missing-map-uuid',
        'a stopped OSD also needs an expected UUID from the current map',
    );
    is(
        osd_label_identity(
            { %$identity, down => 0, 'osd-uuid' => undef },
            'e3bcf831-39e8-4db3-a458-bbfa643a139d',
        ),
        'ok',
        'a running OSD first seen after the map snapshot still carries its own identity',
    );
    is_deeply(
        $probes->{'mds:two'}->{sections},
        ['mds.two', 'client.admin'],
        'a keyring holding more than its own entity lists every section',
    );
    is($probes->{'mds:three'}->{store}, 'missing', 'a directory with neither is missing');
    is($probes->{'osd:9'}->{store}, 'probe-error', 'a command that failed is its own state');
    like(
        $probes->{'osd:9'}->{error},
        qr/not a block device/,
        'and carries what the command said, which is the difference between a broken device and a'
            . ' label that has no key',
    );
    is(scalar(keys %$probes), 5, 'a line in no known shape is ignored rather than guessed at');
}
{
    my $keyless = parse_probe_output('label osd:4 {"/dev/sdc":{"whoami":"4"}}' . "\n");
    is(
        $keyless->{'osd:4'}->{store},
        'block-without-key',
        'a label that decodes but has no key is distinct from a failed command',
    );
    my $broken = parse_probe_output("label osd:5 {not json\n");
    is($broken->{'osd:5'}->{store}, 'block-without-key', 'so is one that does not decode');
}

# --- which keys still need work -------------------------------------------------------------
{
    my $info = { exported => { 'osd.1' => { key => $OLD }, 'osd.2' => { key => $NEW } } };
    is(needs_rotation($info, 'osd.1'), 1, 'a legacy key needs rotating');
    is(needs_rotation($info, 'osd.2'), 0, 'an aes256k key does not');
    is(
        needs_rotation($info, 'osd.9'),
        0,
        'an entity with no auth entry is not this step\'s business',
    );
}
{
    # 'ceph-mon --mkfs' moves 'mon.' out of the auth database and 'ceph-authtool --gen-key' has
    # defaulted to aes256k since 19.2.6, so on a cluster built since then 'mon.' is absent and
    # already migrated. Reading absence as "still on the old cipher" told every such cluster to
    # rotate a key that was fine.
    is(
        needs_rotation({ exported => {}, pve_mon_key => $NEW }, 'mon.'),
        0,
        'an absent mon. whose stored copy is aes256k needs nothing',
    );
    is(
        needs_rotation({ exported => {}, pve_mon_key => $OLD }, 'mon.'),
        1,
        'an absent mon. whose stored copy is legacy does need rotating',
    );
    is(
        needs_rotation({ exported => {} }, 'mon.'),
        1,
        'with no copy to judge it is treated as due rather than assumed fine',
    );
    is(
        needs_rotation({ exported => { 'mon.' => { key => $NEW } } }, 'mon.'),
        0,
        'once rotated into the auth database that entry decides',
    );
}

is(
    mon_keyring_stale({ mon_entry => { key => $NEW }, pve_mon_key => $OLD }),
    1,
    'a stored copy that differs from the auth database is stale',
);
is(
    mon_keyring_stale({ mon_entry => { key => $NEW }, pve_mon_key => $NEW }),
    0,
    'a matching copy is not',
);
is(
    mon_keyring_stale({ mon_entry => {}, pve_mon_key => $OLD }),
    0,
    'with nothing in the auth database there is nothing to be stale against',
);

{
    my $due = { exported => {}, pve_mon_key => $OLD };
    is(mon_key_rotation_wanted($due, {}), 0, 'the monitor key is never touched unasked');
    is(mon_key_rotation_wanted($due, { 'rotate-mon-key' => 1 }), 1, 'asked for, and due');
    is(
        mon_key_rotation_wanted($due, { 'rotate-mon-key' => 1, only => { mgr => 1 } }),
        0,
        'a scope that leaves the monitors out wins over the option',
    );
    is(
        mon_key_rotation_wanted($due, { 'rotate-mon-key' => 1, only => { mon => 1 } }),
        1,
        'a scope that names them does not',
    );
    is(
        mon_key_rotation_wanted({ exported => {}, pve_mon_key => $NEW }, { 'rotate-mon-key' => 1 }),
        0,
        'asked for, but nothing to do',
    );
}

# --- what an earlier run left behind ---------------------------------------------------------
{
    my $state = {
        rotated => { 'osd.1' => 1, 'osd.2' => 1, 'mon.' => 1 },
        done => { 'osd.1' => 1 },
        previous_keys => { 'client.admin' => {} },
        live_swap => { 'mgr.a' => { phase => 'staged' } },
    };
    is_deeply(
        [unfinished_entities($state)],
        ['client.admin', 'mgr.a', 'mon.', 'osd.2'],
        'a rotated key, saved old key, or live-swap journal without completion is unfinished',
    );
    $state->{mon_key_complete} = 'fingerprint';
    is_deeply(
        [unfinished_entities($state)],
        ['client.admin', 'mgr.a', 'osd.2'],
        'the monitor step carries its own completion marker',
    );
    is_deeply([unfinished_entities({})], [], 'a fresh state has nothing outstanding');

    $state->{previous_keys}->{'client.osd-lockbox.abc'} = { saved => 1 };
    $state->{lockbox}->{'client.osd-lockbox.abc'} = { phase => 'staged' };
    is_deeply(
        [unfinished_entities($state)],
        ['client.admin', 'mgr.a', 'osd.2'],
        'a journalled lockbox key is finished from its journal, not listed for the plan',
    );

    my $repeated = {
        done => { 'client.admin' => 100 },
        rotated => { 'client.admin' => 200 },
        previous_keys => { 'client.admin' => { saved => 200 } },
    };
    ok(
        migration_unfinished($repeated, 'client.admin'),
        'an older done marker does not hide a newer interrupted rotation',
    );
    $repeated->{done}->{'client.admin'} = 200;
    ok(
        !migration_unfinished($repeated, 'client.admin'),
        'the matching completion marker finishes the newer rotation',
    );
}

# --- which daemons a run writes to -------------------------------------------------------------
{
    my $info = { daemons => { mon => [{ entity => 'mon.a' }, { entity => 'mon.b' }] } };
    my $osd = { entity => 'osd.1' };
    is(
        scalar(touched_daemons($info, { daemons => [$osd], mon_key => 0 })),
        1,
        'only the planned daemons without the monitor step',
    );
    is(
        scalar(touched_daemons($info, { daemons => [$osd], mon_key => 1 })),
        3,
        'rotating the monitor key writes to every monitor',
    );
    is(
        scalar(touched_daemons($info, { daemons => [$osd], mon_key => 1, mon_repair_only => 1 })),
        1,
        'repairing only the stored copy writes to none of them, so none is validated either',
    );
}

# --- daemons ceph cannot see ------------------------------------------------------------------
{
    # a stopped mgr or mds drops out of 'ceph <type> metadata' entirely, and its key would then
    # never be migrated, which the service ticket switch at the end refuses over
    my $running = [{ type => 'mds', id => 'a', entity => 'mds.a', node => 'n1' }];
    my $merged = merge_configured_daemons($running, 'mds', { a => 'n1', b => 'n2' });
    is(scalar(@$merged), 2, 'a configured daemon ceph does not report is picked up');
    my ($added) = grep { $_->{id} eq 'b' } @$merged;
    is($added->{entity}, 'mds.b', 'and gets the entity its key is under');
    is($added->{node}, 'n2', 'on the node that reported it');
    ok($added->{down}, 'marked down, which is what leaves it stopped rather than starting it');
    ok(
        !(grep { $_->{id} eq 'a' } @$merged)[0]->{down},
        'one ceph already reported is left exactly as it was',
    );

    my $mons = merge_configured_daemons([], 'mon', { x => 'n1' });
    is($mons->[0]->{entity}, 'mon.', 'every monitor shares the one mon. entity');

    my $locations = configured_daemon_locations({
        n1 => { 3 => { direxists => 1 }, 4 => { service => 1 } },
        n2 => { 3 => { direxists => 1 } },
    });
    is_deeply(
        $locations,
        { 3 => ['n1', 'n2'] },
        'every data directory remains visible when an ID is reported on several nodes',
    );
    my ($configured, $remnants, $conflicts) =
        resolve_configured_locations('osd', $locations, {}, { 3 => 'current-uuid' });
    is_deeply($configured, {}, 'an ambiguous stopped OSD gets no arbitrary node');
    is_deeply($remnants, [], 'a current OSD is not called a remnant');
    is_deeply(
        $conflicts,
        [{ type => 'osd', id => '3', nodes => ['n1', 'n2'] }],
        'both locations block a stopped OSD key write',
    );

    ($configured, $remnants, $conflicts) =
        resolve_configured_locations('osd', $locations, { 3 => 1 }, { 3 => 'current-uuid' });
    is_deeply($conflicts, [], 'running metadata makes its current node authoritative');

    ($configured, $remnants, $conflicts) =
        resolve_configured_locations('osd', $locations, {}, {});
    is_deeply(
        $remnants,
        [
            { type => 'osd', id => '3', node => 'n1' }, { type => 'osd', id => '3', node => 'n2' },
        ],
        'every location of an OSD absent from the map is reported as a remnant',
    );
    is_deeply($conflicts, [], 'absent OSD remnants cannot receive a key write');

    # a decommissioned OSD can leave its data directory behind
    my ($kept, $ghosts) = merge_configured_daemons(
        [],
        'osd',
        { 3 => 'n1', 6 => 'n2' },
        { 3 => '9d4ef7d6-6ce8-4192-938a-cfe0ced279a5' },
    );
    is(scalar(@$kept), 1, 'an OSD the OSD map does not hold is not picked up');
    is($kept->[0]->{entity}, 'osd.3', 'while one it holds still is');
    is(
        $kept->[0]->{'osd-uuid'},
        '9d4ef7d6-6ce8-4192-938a-cfe0ced279a5',
        'and it carries the current map UUID to the device check',
    );
    is_deeply(
        $ghosts,
        [{ type => 'osd', id => '6', node => 'n2' }],
        'and the leftover is reported for the run log instead',
    );
    my $every = merge_configured_daemons([], 'osd', { 6 => 'n2' });
    is(
        $every->[0]->{entity},
        'osd.6',
        'without an inventory of existing IDs every directory counts',
    );
}

# --- lexical subs must be defined before their first call ------------------------------------
{
    # a call site above a 'my sub' definition compiles clean and dies only at runtime
    open(my $fh, '<', "$FindBin::Bin/../bin/pve-cephx-rotate-service-keys") or die $!;
    my @lines = <$fh>;
    close($fh);
    my %defined_at;
    for my $i (0 .. $#lines) {
        $defined_at{$1} = $i if $lines[$i] =~ m/^my sub (\w+)/;
    }
    my @early;
    for my $i (0 .. $#lines) {
        next if $lines[$i] =~ m/^\s*#/;
        for my $name (keys %defined_at) {
            next if $i >= $defined_at{$name};
            push @early, "$name called on line " . ($i + 1) . " before its definition"
                if $lines[$i] =~ m/\b\Q$name\E\s*\(/ && $lines[$i] !~ m/^my sub/;
        }
    }
    is_deeply(\@early, [], 'no lexical sub is called above its definition');

    # a module function that is called but not imported compiles clean and dies at runtime
    my $module = "$FindBin::Bin/../PVE/Ceph/KeyMigration.pm";
    open(my $mfh, '<', $module) or die $!;
    my @module_lines = <$mfh>;
    close($mfh);
    my %exported = map { $_ => 1 } grep { m/^\w+$/ }
        map { split(/\s+/, $_) } grep { m/^sub (\w+)/ ? 0 : 1 } ();
    my %module_subs;
    for my $line (@module_lines) {
        $module_subs{$1} = 1 if $line =~ m/^sub (\w+)/;
    }
    my $source = join('', @lines);
    my ($import_list) = $source =~ m/use PVE::Ceph::KeyMigration qw\(\s*(.*?)\);/s;
    my %imported = map { $_ => 1 } grep { length } split(/\s+/, $import_list // '');
    my @missing;
    for my $name (sort keys %module_subs) {
        next if $imported{$name} || $defined_at{$name};
        next if !grep { m/(?<![\w:>])\Q$name\E\s*\(/ && !m/^\s*#/ } @lines;
        push @missing, $name;
    }
    is_deeply(\@missing, [], 'every module function the script calls is imported');
}

# --- live client sessions -------------------------------------------------------------------
{
    my $mons = [
        {
            mon => 'a',
            sessions => [
                {
                    con_type => 'client',
                    entity_name => 'client.admin',
                    global_id => 100,
                    socket_addr => { addr => '10.0.0.1:0' },
                },
                {
                    con_type => 'client',
                    entity_name => 'client.admin',
                    global_id => 120,
                    socket_addr => { addr => '10.0.0.2:0' },
                },
                { con_type => 'osd', entity_name => 'osd.1', global_id => 90 },
            ],
        },
        {
            mon => 'b',
            sessions => [{
                con_type => 'client',
                entity_name => 'client.backup',
                global_id => 130,
                socket_addr => { addr => '10.0.0.1:0' },
            }],
        },
    ];
    my $summary = summarize_sessions($mons);
    ok($summary->{complete}, 'every monitor answered, so the picture is complete');
    is(scalar($summary->{clients}->{'client.admin'}->@*), 2, 'sessions are grouped by entity');
    ok(!exists $summary->{clients}->{'osd.1'}, 'daemon connections are not client sessions');
    is(
        session_hosts($summary->{clients}->{'client.admin'}),
        '10.0.0.1: 1, 10.0.0.2: 1',
        'the hosts of an entity read as host: count',
    );

    my $expected = summarize_sessions($mons, [qw(a b)]);
    ok($expected->{complete}, 'every expected monitor returned one result');
    ok(
        !summarize_sessions([$mons->[0]], [qw(a b)])->{complete},
        'an omitted monitor result marks the picture incomplete',
    );
    ok(
        !summarize_sessions([], [])->{complete},
        'an empty expected monitor inventory cannot prove completeness',
    );
    ok(
        !summarize_sessions($mons, [qw(a a)])->{complete},
        'duplicate expected monitor IDs cannot prove completeness',
    );

    my $partial = summarize_sessions([$mons->[0], { mon => 'b', sessions => undef }]);
    ok(!$partial->{complete}, 'a monitor that did not answer marks the picture incomplete');
    is(
        scalar($partial->{clients}->{'client.admin'}->@*),
        2,
        'while the sessions that were read still count',
    );

    my $malformed_result = summarize_sessions(['not a monitor result']);
    ok(!$malformed_result->{complete}, 'a malformed monitor result marks the picture incomplete');

    my $malformed = summarize_sessions([{ mon => 'a', sessions => ['not a session'] }]);
    ok(!$malformed->{complete}, 'a malformed session entry marks the picture incomplete');

    my $bad_client = summarize_sessions([{
        mon => 'a',
        sessions => [{ con_type => 'client', entity_name => '', global_id => [] }],
    }]);
    ok(!$bad_client->{complete}, 'a client without a usable entity or ID is incomplete');
    is_deeply($bad_client->{clients}, {}, 'a malformed client contributes no consumer evidence');

    my $non_client = summarize_sessions([{
        mon => 'a',
        sessions => [{ con_type => 'osd', entity_name => '', global_id => [] }],
    }]);
    ok($non_client->{complete}, 'a valid non-client session remains irrelevant');
}

# --- the final step is offered once nothing else is open ---------------------------------------
{
    my $checks = { AUTH_INSECURE_KEYS_ALLOWED => {} };
    my $info = {
        sessions => { complete => 1, clients => {} },
        exported => {},
        pve_mon_key => $NEW,
        service_cipher => $CIPHER,
        health_checks => {},
    };
    my $options = open_actions('/helper', $checks, {}, {}, $CIPHER, {}, $info);
    is(scalar($options->{next}->@*), 1, 'an otherwise finished cluster gets one suggestion');
    like($options->{next}->[0], qr/--restrict-ciphers/, 'the cipher restriction');

    $checks->{AUTH_INSECURE_CLIENT_KEY_TYPE} =
        { detail => [{ message => "entity client.admin using insecure key type: aes" }] };
    $options = open_actions(
        '/helper',
        $checks,
        {},
        {},
        $CIPHER,
        {},
        { %$info, exported => { 'client.admin' => { key => $OLD } } },
    );
    ok(
        !(grep { m/restrict-ciphers/ } $options->{next}->@*),
        'not while a client key still needs its rotation',
    );
}

# --- consumers a rotation left behind ---------------------------------------------------------
{
    my $sessions = {
        complete => 1,
        clients => {
            'client.admin' => [
                { global_id => 100, host => 'a' },
                { global_id => 120, host => 'a' },
                { global_id => 121, host => 'b' },
            ],
            'client.backup' => [{ global_id => 90, host => 'c' }],
        },
    };
    # only an id recorded at the rotation proves an instance predates it; monitors allocate ids
    # in independent sequences, so a fresh instance may sit below any older id and must never
    # be flagged, or a record could neither clear nor be confirmed
    my $stale =
        stale_consumers($sessions, { 'client.admin' => { session_ids => [100, 120] } });
    is_deeply(
        [sort map { $_->{global_id} } $stale->{'client.admin'}->@*],
        [100, 120],
        'exactly the recorded instances count as stale',
    );
    ok(!exists $stale->{'client.backup'}, 'an entity nobody rotated is not reported');

    $stale = stale_consumers($sessions, { 'client.admin' => { rotated => 1000 } });
    is_deeply($stale, {}, 'a record without a measurement proves nothing by itself');

    $stale = stale_consumers(
        $sessions, { 'client.admin' => { session_ids => [120], cleared => 5000 } },
    );
    is_deeply(
        [map { $_->{global_id} } $stale->{'client.admin'}->@*],
        [120],
        'a recorded instance that returns re-raises a cleared record, fresh ones never do',
    );

    $stale = stale_consumers($sessions, { 'client.crash' => { session_ids => [50] } });
    is_deeply($stale, {}, 'a rotated entity with no live session left has nothing to report');
}

# --- the mounts a rotated key reaches ----------------------------------------------------------
{
    my $item = {
        files => [
            {
                path => '/etc/pve/priv/ceph/cephfs.secret',
                format => 'secret',
                store => 'cephfs',
            },
            { path => '/etc/pve/priv/ceph/fs2.secret', format => 'secret', store => 'fs2' },
            { path => '/etc/pve/priv/ceph/rbd.keyring', format => 'keyring', store => 'rbd' },
            { path => '/etc/pve/priv/ceph.client.admin.keyring', format => 'keyring' },
        ],
    };
    is_deeply(
        cephfs_mount_storages($item),
        ['cephfs', 'fs2'],
        'every CephFS storage of the key is redone, an RBD storage has no mount to redo',
    );
    is_deeply(cephfs_mount_storages({ files => [] }), [], 'a key without storages redoes nothing');
}

# --- a record without a measurement cannot be confirmed away ------------------------------------
{
    # the same predicate the confirmation uses: a record with no recorded instances proves
    # nothing about the clients connected as that key right now
    my $sessions = {
        complete => 1,
        clients => { 'client.admin' => [{ global_id => 7, host => 'a' }] },
    };
    is_deeply(
        stale_consumers($sessions, { 'client.admin' => { rotated => 1 } }),
        {},
        'an unmeasured record flags nobody, so the run must measure before it may confirm',
    );
    is_deeply(
        [
            map { $_->{global_id} } stale_consumers(
                $sessions,
                { 'client.admin' => { rotated => 1, session_ids => [7] } },
            )->{'client.admin'}->@*
        ],
        [7],
        'once measured, the client connected as that key is a named consumer',
    );
}

# --- what a requested confirmation may do ------------------------------------------------------
{
    my $complete = {
        complete => 1,
        clients => { 'client.admin' => [{ global_id => 7, host => 'a' }] },
    };
    my $measured = { client_refresh => { 'client.admin' => { session_ids => [7] } } };
    my $unmeasured = { client_refresh => { 'client.admin' => { rotated => 1 } } };

    is(
        ack_decision('client.crash', $measured, $complete, {})->{verdict},
        'unknown',
        'a key without a rotation record has nothing to confirm',
    );

    my $stale = stale_consumers($complete, $measured->{client_refresh});
    my $connected = ack_decision('client.admin', $measured, $complete, $stale);
    is($connected->{verdict}, 'connected', 'a recorded consumer that is connected refuses it');
    is(scalar(@{ $connected->{held} }), 1, 'and is named, so the operator knows what to refresh');

    is(
        ack_decision('client.admin', $measured, { complete => 0, clients => {} }, {})->{verdict},
        'incomplete',
        'an unanswered monitor refuses it, a consumer could be connected unseen',
    );

    my $measure = ack_decision('client.admin', $unmeasured, $complete, {});
    is($measure->{verdict}, 'measure', 'an unmeasured rotation records what is connected first');
    is_deeply(
        [map { $_->{global_id} } @{ $measure->{live} }],
        [7],
        'namely every client connected as that key right now',
    );

    is(
        ack_decision('client.admin', $unmeasured, { complete => 1, clients => {} }, {})->{verdict},
        'accept',
        'an unmeasured rotation with nothing connected is the operator\'s word to give',
    );
    is(
        ack_decision('client.admin', $measured, { complete => 1, clients => {} }, {})->{verdict},
        'accept',
        'and so is a measured one whose recorded consumers are gone',
    );
}

# --- the option list is the whole next step ----------------------------------------------------
{
    my $checks = { AUTH_INSECURE_KEYS_ALLOWED => {} };
    my $sessions = {
        complete => 1,
        clients => { 'client.admin' => [{ global_id => 7, host => 'a' }] },
    };
    my $info = {
        sessions => $sessions,
        exported => { 'client.admin' => { key => $NEW } },
        pve_mon_key => $NEW,
        service_cipher => $CIPHER,
        health_checks => {},
    };

    my $waiting = { client_refresh => { 'client.admin' => { session_ids => [7] } } };
    my $open = open_options($checks, {}, {}, $CIPHER, $waiting, $sessions);
    is_deeply($open->{waiting}, ['client.admin'], 'a record with a connected consumer waits');
    ok(
        !(grep { m/restrict-ciphers|ack-refreshed/ } $open->{next}->@*),
        'neither the confirmation nor the restriction is offered while it does',
    );

    my $unmeasured = {
        client_refresh => { 'client.admin' => { rotated => 1, measurement_incomplete => 1 } },
    };
    $open = open_actions('/helper', $checks, {}, {}, $CIPHER, $unmeasured, $info);
    is_deeply(
        $open->{waiting},
        ['client.admin'],
        'a record that would first measure its live consumer remains an explicit waiter',
    );
    is_deeply($open->{ready}, [], 'a measure verdict is never presented as ready');
    ok(!defined($open->{command}), 'no acknowledgment command is generated for a measurement');

    my $ready = { client_refresh => { 'client.admin' => { session_ids => [99] } } };
    $open = open_options($checks, {}, {}, $CIPHER, $ready, $sessions);
    is_deeply(
        $open->{ready},
        ['client.admin'],
        'once they are gone the confirmation is the next step, in one command for every key',
    );
    ok(
        !(grep { m/restrict-ciphers/ } $open->{next}->@*),
        'and the restriction waits for that confirmation',
    );

    $open = open_actions('/helper', $checks, {}, {}, $CIPHER, {}, $info);
    like(
        $open->{next}->[0],
        qr/^--restrict-ciphers:/,
        'with no record left, the restriction is what remains',
    );

    my $confirmed = {
        client_refresh => { 'client.admin' => { session_ids => [99], cleared => 5 } },
    };
    $open = open_actions('/helper', $checks, {}, {}, $CIPHER, $confirmed, $info);
    is_deeply($open->{ready}, [], 'a record already confirmed is not offered again');
    like(
        $open->{next}->[0],
        qr/^--restrict-ciphers:/,
        'and it no longer holds the restriction back',
    );

    my $returned = {
        client_refresh => { 'client.admin' => { session_ids => [7], cleared => 5 } },
    };
    $open = open_options($checks, {}, {}, $CIPHER, $returned, $sessions);
    is_deeply($open->{waiting}, ['client.admin'], 'a recorded consumer that returns waits again');
    ok(
        !(grep { m/restrict-ciphers/ } $open->{next}->@*),
        'and the restriction is off the table until it is gone',
    );

    my $partial = { complete => 0, clients => {} };
    $open = open_options($checks, {}, {}, $CIPHER, $ready, $partial);
    is_deeply($open->{ready}, [], 'an unanswered monitor offers no confirmation');
    is_deeply(
        $open->{waiting},
        ['client.admin'],
        'the incomplete verdict keeps every open record visible as a waiter',
    );
    ok(
        !(grep { m/restrict-ciphers/ } $open->{next}->@*),
        'nor the restriction, as a consumer could be connected unseen',
    );
    ok(
        !(
            grep { m/restrict-ciphers/ } open_actions(
                '/helper', $checks, {}, {}, $CIPHER, {}, { %$info, sessions => $partial },
            )->{next}->@*
        ),
        'which holds with no record at all, the sweep is what is missing',
    );
}

# --- when the offered command may promise the finish ---------------------------------------
{
    # the offer must ask the predicate that decides the restriction, not an empty option list
    my $sessions = {
        complete => 1,
        clients => { 'client.admin' => [{ global_id => 7, host => 'a' }] },
    };
    my $state = { client_refresh => { 'client.admin' => { session_ids => [99] } } };
    my $clean = {
        sessions => $sessions,
        exported => { 'client.admin' => { key => $NEW } },
        pve_mon_key => $NEW,
        service_cipher => $CIPHER,
        health_checks => {},
    };
    ok(
        finish_after_acks($clean, $state, ['client.admin']),
        'with the confirmation given, nothing is left and the finish may be offered',
    );

    my $actions = open_actions(
        '/helper',
        { AUTH_INSECURE_KEYS_ALLOWED => {} },
        {},
        {},
        $CIPHER,
        $state,
        $clean,
    );
    is(
        $actions->{command},
        '/helper --apply --ack-refreshed client.admin --restrict-ciphers',
        'the paste command receives the full snapshot and carries the guarded final step',
    );

    my $mixed = {
        client_refresh => {
            'client.admin' => { session_ids => [7] },
            'client.crash' => { session_ids => [99] },
        },
    };
    $actions = open_actions(
        '/helper',
        { AUTH_INSECURE_KEYS_ALLOWED => {} },
        {},
        {},
        $CIPHER,
        $mixed,
        {
            %$clean,
            exported => {
                %{ $clean->{exported} }, 'client.crash' => { key => $NEW },
            },
        },
    );
    is_deeply($actions->{waiting}, ['client.admin'], 'the paste-command input retains waiters');
    is_deeply($actions->{ready}, ['client.crash'], 'and carries every ready confirmation');
    is(
        $actions->{command},
        '/helper --apply --ack-refreshed client.crash',
        'a waiter keeps the final step out of that command',
    );

    my $unsafe_entity = q{client.bad;$(touch /root/pwned) 'quoted'};
    $actions = open_actions(
        '/helper',
        { AUTH_INSECURE_KEYS_ALLOWED => {} },
        {},
        {},
        $CIPHER,
        { client_refresh => { $unsafe_entity => { session_ids => [99] } } },
        {
            %$clean, exported => { %{ $clean->{exported} }, $unsafe_entity => { key => $NEW } },
        },
    );
    is(
        $actions->{command},
        '/helper --apply --ack-refreshed '
            . PVE::Tools::shellquote($unsafe_entity)
            . ' --restrict-ciphers',
        'a cephx entity is shell-quoted before it enters the paste command',
    );

    my $both_ready = {
        client_refresh => {
            'client.admin' => { session_ids => [98] },
            'client.crash' => { session_ids => [99] },
        },
    };
    $actions = open_actions(
        '/helper',
        { AUTH_INSECURE_KEYS_ALLOWED => {} },
        {},
        {},
        $CIPHER,
        $both_ready,
        {
            %$clean,
            exported => {
                %{ $clean->{exported} }, 'client.crash' => { key => $NEW },
            },
        },
    );
    is(
        $actions->{command},
        '/helper --apply --ack-refreshed client.admin --ack-refreshed client.crash'
            . ' --restrict-ciphers',
        'the command includes every ready confirmation before the permitted final step',
    );

    my $unmanaged = {
        %$clean, exported => { %{ $clean->{exported} }, 'client.rgw.foo' => { key => $OLD } },
    };
    ok(
        !finish_after_acks($unmanaged, $state, ['client.admin']),
        'a key nothing here manages still blocks it, though no option covers that key',
    );
    $actions = open_actions(
        '/helper',
        { AUTH_INSECURE_KEYS_ALLOWED => {} },
        {},
        {},
        $CIPHER,
        $state,
        $unmanaged,
    );
    unlike(
        $actions->{command},
        qr/restrict-ciphers/,
        'an unmanaged key also keeps the final step out of the actual paste command',
    );
    $actions = open_actions(
        '/helper',
        { AUTH_INSECURE_KEYS_ALLOWED => {} },
        {},
        {},
        $CIPHER,
        {},
        $unmanaged,
    );
    ok(
        !(grep { m/restrict-ciphers/ } $actions->{next}->@*),
        'nor is the final step offered on its own while an unmanaged key blocks it',
    );

    my $service = {
        %$clean, exported => { %{ $clean->{exported} }, 'osd.3' => { key => $OLD } },
    };
    ok(
        !finish_after_acks($service, $state, ['client.admin']),
        'and so does a service key on the old cipher',
    );
    $actions = open_actions(
        '/helper',
        { AUTH_INSECURE_KEYS_ALLOWED => {} },
        {},
        {},
        $CIPHER,
        {},
        $service,
    );
    ok(
        !(grep { m/restrict-ciphers/ } $actions->{next}->@*),
        'an old service key also withholds the standalone final step',
    );

    my $current_run = {
        %$clean, exported => {
            %{ $clean->{exported} }, 'client.crash' => { key => $OLD },
        },
    };
    $actions = open_actions(
        '/helper',
        { AUTH_INSECURE_KEYS_ALLOWED => {} },
        { 'rotate-client-keys' => 1 },
        {},
        $CIPHER,
        $state,
        $current_run,
    );
    unlike(
        $actions->{command},
        qr/restrict-ciphers/,
        'a requested rotation cannot promise the finish before its new record exists',
    );

    ok(
        !finish_after_acks({ %$clean, service_cipher => $LEGACY_CIPHER }, $state, ['client.admin']),
        'the service tickets must have moved as well',
    );

    ok(
        !finish_after_acks({ %$clean, pve_mon_key => $OLD }, $state, ['client.admin']),
        'a stored monitor key on the old cipher blocks it too',
    );

    my $another = {
        client_refresh => {
            'client.admin' => { session_ids => [99] },
            'client.crash' => { session_ids => [7] },
        },
    };
    ok(
        !finish_after_acks($clean, $another, ['client.admin']),
        'a record the run does not confirm keeps the finish out of the command',
    );
}

# --- what blocks the cipher restriction --------------------------------------------------------
{
    my $clean = {
        sessions => {
            complete => 1,
            clients => { 'client.admin' => [{ global_id => 200, host => 'a' }] },
        },
        exported => { 'client.admin' => { key => $NEW } },
        pve_mon_key => $NEW,
        service_cipher => $CIPHER,
    };
    is_deeply(restrict_blockers($clean, {}), [], 'nothing blocks a fully migrated cluster');

    my $blockers = restrict_blockers(
        $clean,
        { client_refresh => { 'client.admin' => { session_ids => [200] } } },
    );
    like(
        $blockers->[0],
        qr/recorded live client\(s\) may still hold the previous key of 'client.admin' \(a: 1\)/,
        'a recorded consumer that may predate the rotation blocks it',
    );

    my $old_key = { %$clean, exported => { 'client.admin' => { key => $OLD } } };
    $blockers = restrict_blockers($old_key, {});
    like(
        $blockers->[0],
        qr/1 active or pending keys still use another cipher: client.admin \(active\)/,
        'an entity key on the old cipher blocks it',
    );
    like(
        $blockers->[1],
        qr/1 live client\(s\) authenticate as 'client.admin'/,
        'and so does its live consumer, named separately',
    );

    my $old_pending = {
        %$clean, exported => { 'client.admin' => { key => $NEW, pending_key => $OLD } },
    };
    like(
        restrict_blockers($old_pending, {})->[0],
        qr/client.admin \(pending\)/,
        'a staged old-cipher key blocks the restriction before it can become active',
    );

    like(
        restrict_blockers({ %$clean, service_cipher => $LEGACY_CIPHER }, {})->[0],
        qr/service tickets still use the 'aes' cipher/,
        'the current service-ticket cipher is part of the authoritative predicate',
    );

    $blockers = restrict_blockers({ %$clean, pve_mon_key => $OLD }, {});
    like($blockers->[0], qr/stored 'mon.' key/, 'the stored monitor key counts too');

    my $partial = { %$clean, sessions => { complete => 0, clients => {} } };
    like(
        restrict_blockers($partial, {})->[0],
        qr/not every monitor answered/,
        'an incomplete session picture is never waved through',
    );

    $blockers = restrict_blockers(
        $clean, { client_refresh => { 'client.crash' => { rotated => 1000 } } },
    );
    like(
        $blockers->[0],
        qr/awaits '--ack-refreshed client.crash'/,
        'a rotation record asks for the acknowledgment, a consumer may be invisible',
    );

    $blockers = restrict_blockers(
        $clean,
        {
            client_refresh => { 'client.crash' => { rotated => 1000, session_ids => [50] } },
        },
    );
    like(
        $blockers->[0],
        qr/awaits '--ack-refreshed client.crash'/,
        'a measured record is no different, session absence proves nothing',
    );

    like(
        restrict_blockers(
            { %$clean, health_checks => { AUTH_EMERGENCY_CIPHERS_SET => {} } }, {},
        )->[0],
        qr/mon_auth_emergency_allowed_ciphers.*overrides the restriction/,
        'the emergency cipher override blocks, the restriction would not hold',
    );

    is_deeply(
        restrict_blockers(
            $clean,
            {
                client_refresh => {
                    'client.crash' => { rotated => 1000, session_ids => [50], cleared => 2000 },
                },
            },
        ),
        [],
        'a record considered refreshed no longer blocks while its instances stay away',
    );

    like(
        restrict_blockers({ %$clean, pve_mon_key => undef }, {})->[0],
        qr/stored 'mon.' key could not be read/,
        'an unreadable stored monitor key is a blocker, not a pass',
    );
}

# --- the plan -----------------------------------------------------------------------------------
my sub daemon {
    my ($type, $id) = @_;
    return { type => $type, id => $id, entity => "$type.$id", node => 'n1' };
}
my sub cluster {
    return {
        exported => { 'osd.1' => { key => $OLD }, 'mgr.a' => { key => $NEW } },
        daemons => {
            mon => [],
            mds => [],
            osd => [daemon('osd', 1)],
            mgr => [daemon('mgr', 'a')],
        },
        service_cipher => $LEGACY_CIPHER,
        pve_mon_key => $NEW,
    };
}
{
    my $plan = build_plan(cluster(), {}, {}, {});
    is_deeply(
        [map { $_->{entity} } $plan->{daemons}->@*],
        ['osd.1'],
        'only the daemon whose key is still legacy is planned',
    );
    is($plan->{service_cipher}, 1, 'a run over everything switches the service tickets at the end');
    is($plan->{mon_key}, 0, 'the monitor key stays out of it');

    my $scoped = build_plan(cluster(), {}, { only => { mgr => 1 } }, {});
    is(
        $scoped->{service_cipher},
        0,
        'a scoped run must not switch: it cannot know the keys it skipped are migrated',
    );
    is(scalar($scoped->{daemons}->@*), 0, 'and plans nothing outside its scope');

    my $one = build_plan(cluster(), {}, { only => { 'osd.1' => 1 } }, {});
    is_deeply(
        [map { $_->{entity} } $one->{daemons}->@*],
        ['osd.1'],
        'a scope can name a single daemon, which is how one left behind is repaired',
    );

    my $switched = cluster();
    $switched->{service_cipher} = $CIPHER;
    is(
        build_plan($switched, {}, {}, {})->{service_cipher},
        0,
        'an already switched cluster does not switch again',
    );
}
{
    # rotated in the auth database but the copies never written: the key is new, so needs_rotation()
    # says no, yet the daemon still has to be finished
    my $info = cluster();
    $info->{exported}->{'mgr.a'} = { key => $NEW };
    my $state = { rotated => { 'mgr.a' => 1 } };
    my $plan = build_plan($info, $state, {}, {});
    is_deeply(
        [sort map { $_->{entity} } $plan->{daemons}->@*],
        ['mgr.a', 'osd.1'],
        'a daemon an earlier run rotated but did not finish is planned again',
    );

    $state = {
        done => { 'mgr.a' => 1 },
        live_swap => { 'mgr.a' => { phase => 'written', key => key_fingerprint($NEW) } },
    };
    $plan = build_plan($info, $state, {}, {});
    is_deeply(
        [sort map { $_->{entity} } $plan->{daemons}->@*],
        ['mgr.a', 'osd.1'],
        'a live-swap journal is resumed even when stale completion state says the key is done',
    );

    $state = {
        done => { 'mgr.a' => 100 },
        rotated => { 'mgr.a' => 200 },
        previous_keys => { 'mgr.a' => { saved => 200 } },
    };
    $plan = build_plan($info, $state, {}, {});
    is_deeply(
        [sort map { $_->{entity} } $plan->{daemons}->@*],
        ['mgr.a', 'osd.1'],
        'a newer interrupted rotation is planned despite an older completion marker',
    );
}
{
    my $info = {
        exported => { 'mon.' => { key => $NEW } },
        daemons => { mon => [daemon('mon', 'a')], mgr => [], mds => [], osd => [] },
        service_cipher => $CIPHER,
        mon_entry => { key => $NEW },
        pve_mon_key => $OLD,
    };
    my $plan = build_plan($info, {}, {}, {});
    is($plan->{mon_key}, 1, 'a stale stored copy puts the monitor step in the plan unasked');
    is(
        $plan->{mon_repair_only},
        1,
        'but only as a repair, so it rotates nothing and restarts no monitor',
    );

    $info->{pve_mon_key} = $NEW;
    my $state = {
        rotated => { 'mon.' => 200 },
        mon_key_complete => key_fingerprint($OLD),
    };
    $plan = build_plan($info, $state, {}, {});
    is($plan->{mon_key}, 1, 'a completion marker for an older monitor key resumes the rotation');
    ok(!$plan->{mon_repair_only}, 'the resumed monitor rotation updates and restarts monitors');

    # killed between saving the old key and recording the rotation: the auth database may already
    # hold the new key while every monitor still runs on the old one
    $state = { previous_keys => { 'mon.' => { saved => 200 } } };
    $plan = build_plan($info, $state, {}, {});
    is($plan->{mon_key}, 1, 'a saved old key without the rotated marker resumes the rotation too');
    ok(!$plan->{mon_repair_only}, 'and carries it through to the monitors rather than repairing');
}

# --- client keys ---------------------------------------------------------------------------------
{
    my $info = {
        exported =>
            { 'client.admin' => { key => $OLD }, 'client.bootstrap-rbd' => { key => $OLD } },
    };
    my $files = {
        'client.admin' => [{
            path => '/etc/pve/priv/ceph/cp.keyring',
            scope => 'cluster',
            store => 'cp',
            kernel => 1,
        }],
        'client.bootstrap-rbd' => [{
            path => '/var/lib/ceph/bootstrap-rbd/ceph.keyring',
            scope => 'nodes',
        }],
    };
    my ($plan) = plan_client_keys($info, {}, { 'rotate-admin-key' => 1 }, $files);
    is(scalar(@$plan), 1, 'only the key that was asked for');
    is(
        $plan->[0]->{kernel},
        1,
        'a key an in-kernel client reads is marked, which is what gates it on the node kernels',
    );

    my $repeated = {
        done => { 'client.admin' => 100 },
        rotated => { 'client.admin' => 200 },
        previous_keys => { 'client.admin' => { saved => 200 } },
    };
    my ($resume) = plan_client_keys(
        { exported => { 'client.admin' => { key => $NEW } } },
        $repeated,
        { 'rotate-admin-key' => 1 },
        $files,
    );
    is(scalar(@$resume), 1, 'a newer unfinished client rotation is planned despite an older done');

    my ($none, $warnings) =
        plan_client_keys({ exported => {} }, {}, { 'rotate-admin-key' => 1 }, $files);
    is(scalar(@$none), 0, 'a key with no auth entry is not planned');
    like(
        $warnings->[0],
        qr/no entry in the authentication database/,
        'and says so as a warning the caller prints, rather than dying or staying silent',
    );

    my $err = eval {
        plan_client_keys($info, {}, { 'rotate-storage-key' => ['cp'] }, $files);
        1;
    };
    ok(
        !$err && $@ =~ m/--rotate-admin-key/,
        'a storage on client.admin refuses and names the option that covers it, since that key is'
            . ' shared with every other storage and the command line',
    );
}

# --- interrupted live swaps -----------------------------------------------------------------
# The live swap stages a key with the monitors, writes it to disk, hands it to the daemon and then
# has the monitors promote it. A run can die between any two of those, so every point is walked
# here: what the journal says, what is staged now, and what a later run must do about it.
{
    my $ours = key_fingerprint($NEW);
    my $theirs = key_fingerprint($OLD);

    my $case = sub {
        my ($swap, $staged, $want_verdict, $want_restart, $name) = @_;
        my $got = resume_verdict($swap, $staged);
        is("$got->{verdict}/$got->{restart}", "$want_verdict/$want_restart", $name);
    };

    $case->(undef, undef, 'none', 0, 'no journal entry: there is nothing to recover');
    $case->(
        undef,
        $ours,
        'none',
        0,
        'a staged key with no journal entry is not this run\'s to touch here; the preflight'
            . ' refuses over it instead',
    );

    # died between writing the journal and asking for a key
    $case->(
        { phase => 'staging' },
        undef,
        'none',
        0,
        'killed before staging: nothing was staged and nothing written',
    );

    # died after the monitors staged a key, before any file was touched
    $case->(
        { phase => 'staged', key => $ours },
        $ours,
        'clear',
        0,
        'killed after staging: drop the key, the daemon still authenticates with the old one',
    );

    # died after the bluestore label or the keyring was written
    $case->(
        { phase => 'written', key => $ours },
        $ours,
        'commit',
        1,
        'killed after a copy on disk took the key: promote it, or that copy authenticates nowhere',
    );

    # died after the monitors promoted it, or Ceph promoted it on first successful use
    $case->(
        { phase => 'written', key => $ours },
        undef,
        'none',
        1,
        'killed after the promotion: nothing left to commit, but the daemon still has to restart',
    );

    # somebody else staged a key for the same entity in the meantime
    $case->(
        { phase => 'staged', key => $ours },
        $theirs,
        'foreign',
        0,
        'a key this run did not stage is never dropped or promoted behind its owner\'s back',
    );
    $case->(
        { phase => 'written', key => $ours },
        $theirs,
        'foreign',
        0,
        'not even when a copy on disk holds one of ours: the staged key is not that one',
    );

    # a journal entry written before fingerprints were recorded
    $case->(
        { phase => 'written' },
        $ours,
        'commit',
        1,
        'an entry from an older version has no fingerprint, so the phase decides',
    );
    $case->(
        { phase => 'staged' },
        $ours,
        'clear',
        0,
        'and it still distinguishes written from merely staged',
    );

    # The preflight uses the same verdict to decide whether a staged key is one it may resume or
    # one it has to stop over, so a record left behind by an older run must not wave a stranger's
    # key through.
    for my $shape (
        [
            { phase => 'staged', key => $ours },
            $theirs,
            'a record whose key is not the staged one',
        ],
        [undef, $theirs, 'no record at all'],
    ) {
        my ($swap, $staged, $name) = @$shape;
        my $v = resume_verdict($swap, $staged)->{verdict};
        ok($v ne 'clear' && $v ne 'commit', "the preflight still refuses over $name");
    }
}

# --- manager order -------------------------------------------------------------------------
# Standbys go first: restarting one costs nothing, and the active manager's fallback restart
# then fails over onto a migrated one.
{
    my $mgr = sub {
        my ($id, $active) = @_;
        return {
            type => 'mgr',
            id => $id,
            entity => "mgr.$id",
            node => $id,
            active => $active,
        };
    };
    my $info = {
        exported => { map { ("mgr.$_" => { key => $OLD }) } qw(a b c) },
        daemons => {
            mon => [],
            mds => [],
            osd => [],
            mgr => [$mgr->('a', 0), $mgr->('b', 1), $mgr->('c', 0)],
        },
        service_cipher => $CIPHER,
        pve_mon_key => $NEW,
    };
    my $plan = build_plan($info, {}, {}, {});
    is_deeply(
        [map { $_->{entity} } $plan->{daemons}->@*],
        ['mgr.a', 'mgr.c', 'mgr.b'],
        'the active manager is planned last, behind both standbys',
    );

    $info->{daemons}->{mgr} = [$mgr->('a', 1), $mgr->('b', 0)];
    is_deeply(
        [map { $_->{entity} } build_plan($info, {}, {}, {})->{daemons}->@*],
        ['mgr.b', 'mgr.a'],
        'wherever it sits in the list to begin with',
    );

    # nothing else is reordered: an OSD walk stays in the order discovery produced
    $info->{daemons}->{mgr} = [];
    $info->{daemons}->{osd} = [
        { type => 'osd', id => '1', entity => 'osd.1', node => 'n' },
        { type => 'osd', id => '2', entity => 'osd.2', node => 'n' },
    ];
    $info->{exported} = { 'osd.1' => { key => $OLD }, 'osd.2' => { key => $OLD } };
    is_deeply(
        [map { $_->{entity} } build_plan($info, {}, {}, {})->{daemons}->@*],
        ['osd.1', 'osd.2'],
        'and only managers are ordered this way',
    );
}

# Each bucket routes to a different option or to operator-managed work, so the count Ceph reports
# says nothing about what to do next.
{
    my $check = sub {
        return {
            AUTH_INSECURE_CLIENT_KEY_TYPE => {
                detail => [map { { message => "entity $_ using insecure key type: aes" } } @_],
            },
        };
    };

    my $res = classify_insecure_clients(
        $check->(
            'client.osd-lockbox.6f0d1a2b-3c4d-5e6f-7a8b-9c0d1e2f3a4b',
            'client.bootstrap-osd',
            'client.admin',
            'client.rbd-store',
            'client.rgw.node1',
        ),
        { 'client.rbd-store' => ['ceph-vm'] },
    );

    is_deeply(
        $res->{lockbox},
        ['client.osd-lockbox.6f0d1a2b-3c4d-5e6f-7a8b-9c0d1e2f3a4b'],
        'a lockbox key is kept apart for the option that also updates its LVM tag',
    );
    is_deeply(
        $res->{tool},
        ['client.bootstrap-osd'],
        'a bootstrap key maps to --rotate-client-keys',
    );
    is_deeply($res->{admin}, ['client.admin'], 'the admin key maps to --rotate-admin-key');
    is_deeply($res->{storage}, ['client.rbd-store'], 'a storage user maps to --rotate-storage-key');
    is_deeply(
        $res->{other},
        ['client.rgw.node1'],
        'a key nothing here owns is reported, not offered',
    );

    my $none = classify_insecure_clients({});
    is_deeply([map { $none->{$_}->@* } sort keys %$none], [], 'no check at all yields nothing');

    my $storage_unknown = classify_insecure_clients($check->('client.rbd-store'));
    is_deeply(
        $storage_unknown->{other},
        ['client.rbd-store'],
        'a storage user is only offered when a storage still references it',
    );

    my $garbage = classify_insecure_clients({
        AUTH_INSECURE_CLIENT_KEY_TYPE =>
            { detail => [{ message => 'entity client.admin has bad caps' }, {}] },
    });
    is_deeply($garbage->{admin}, [], 'a detail line of another shape is not mistaken for a key');
}

# Suppressing every option because one of them was passed would hide the keys still to do.
{
    my $checks = {
        AUTH_INSECURE_CLIENT_KEY_TYPE => {
            detail => [
                map { { message => "entity $_ using insecure key type: aes" } }
                    ('client.admin', 'client.bootstrap-osd', 'client.store-a', 'client.store-b'),
            ],
        },
    };
    my $stores = { 'client.store-a' => ['rbd-vm'], 'client.store-b' => ['cephfs-iso', 'rbd-ct'] };

    my $all = open_options($checks, {}, $stores);
    is(scalar($all->{next}->@*), 4, 'every key that an option covers is offered');

    my $one = open_options($checks, { 'rotate-storage-key' => ['rbd-vm'] }, $stores);
    is_deeply(
        [grep { m/rotate-client-keys|rotate-admin-key/ } $one->{next}->@*],
        [
            "--rotate-client-keys: the bootstrap keys and 'client.crash'",
            "--rotate-admin-key: 'client.admin' and the copies of it that Proxmox VE keeps",
        ],
        'rotating one storage key does not hide the other options',
    );
    ok(
        !grep({ m/rotate-storage-key rbd-vm/ } $one->{next}->@*),
        'but the storage this run rotated is not offered again',
    );
    ok(
        (
            grep { m/^--rotate-storage-key cephfs-iso: .* shared by cephfs-iso, rbd-ct$/ }
                $one->{next}->@*
        ),
        'a key behind several storages names one of them, so the option can be copied as printed',
    );

    is_deeply(
        $all->{together},
        ['--rotate-client-keys'],
        'the bundle offers only what needs no decision, never the admin or a storage key',
    );

    my $wipe = { AUTH_INSECURE_ROTATING_SERVICE_KEY_TYPE => {} };
    my $offered = open_options($wipe, {}, {}, $CIPHER);
    like($offered->{next}->[0], qr/^--wipe-rotating-keys:/, 'the wipe is offered as an option');
    is_deeply(
        $offered->{together},
        [],
        'but never bundled: waiting a few hours instead is a decision of the operator',
    );

    my $refresh = {
        client_refresh => { 'client.crash' => { session_ids => [45], rotated => 1 } },
    };
    my $connected = {
        complete => 1,
        clients => { 'client.crash' => [{ global_id => 45, host => 'node1' }] },
    };
    ok(
        !grep({ m/^--wipe-rotating-keys:/ }
            open_options($wipe, {}, {}, $CIPHER, $refresh, $connected)->{next}->@*),
        'the wipe is not offered while its fresh guard sees a recorded consumer',
    );
    ok(
        !grep({ m/^--wipe-rotating-keys:/ }
            open_options($wipe, {}, {}, $CIPHER, $refresh, { complete => 1, clients => {} })
                ->{next}->@*),
        'the wipe is not offered while a refresh record still needs acknowledgment',
    );
    ok(
        !grep({ m/^--wipe-rotating-keys:/ }
            open_options($wipe, {}, {}, $CIPHER, {}, { complete => 0, clients => {} })->{next}
                ->@*),
        'the wipe is not offered while the live session picture is incomplete',
    );

    ok(
        scalar(open_options($wipe, { only => { 'osd.3' => 1 } }, {}, $CIPHER)->{next}->@*),
        "'--only' allows --wipe-rotating-keys once the service cipher is switched",
    );
    ok(
        !scalar(open_options($wipe, { only => { 'osd.3' => 1 } }, {}, $LEGACY_CIPHER)->{next}->@*),
        'and it is not offered while the switch is still pending, as that run refuses it',
    );
}

# A lockbox key needs its LVM tag written as well, so it is only offered through the option that
# writes both. A key nothing here covers is reported instead.
{
    my $checks = {
        AUTH_INSECURE_CLIENT_KEY_TYPE => {
            detail => [
                map { { message => "entity $_ using insecure key type: aes" } }
                    ('client.osd-lockbox.6f0d1a2b-3c4d-5e6f-7a8b-9c0d1e2f3a4b', 'client.rgw.node1'),
            ],
        },
    };
    my $res = open_options($checks, {}, {});
    is_deeply(
        $res->{next},
        [
            "--rotate-lockbox-keys: the lockbox key of every encrypted OSD, in the auth database"
                . " and in the LVM tag it is rebuilt from",
        ],
        'a legacy lockbox key is offered through the option that writes both copies',
    );
    is_deeply(
        $res->{stuck},
        ['client.rgw.node1'],
        'only the key no option covers is reported as stuck',
    );
    is($res->{lockbox}, 1, 'and the lockbox warning is triggered');

    my $asked = open_options($checks, { 'rotate-lockbox-keys' => 1 }, {});
    is_deeply($asked->{next}, [], 'the option is not re-offered to a run that already passed it');
    is_deeply(
        $asked->{stuck},
        ['client.rgw.node1'],
        'and only the key no option covers is left reported',
    );
    is($asked->{lockbox}, 0, 'nor is that run warned off doing by hand what it just did');
    is(open_options({}, {}, {})->{lockbox}, 0, 'a cluster without one does not get that warning');
}

# Reading an absent check must not add it to the caller's health map
{
    my $checks = { AUTH_INSECURE_KEYS_ALLOWED => { severity => 'HEALTH_WARN' } };
    open_options($checks, {}, {});
    is_deeply(
        [sort keys %$checks],
        ['AUTH_INSECURE_KEYS_ALLOWED'],
        'classifying does not autovivify the check it looks for',
    );
}

# The hedge belongs to the client key options, not to whatever else is left in the list.
{
    my $rotating = {
        AUTH_INSECURE_ROTATING_SERVICE_KEY_TYPE => {},
        AUTH_INSECURE_CLIENT_KEY_TYPE => {
            detail => [{ message => 'entity client.admin using insecure key type: aes' }],
        },
    };
    is(open_options($rotating, {}, {})->{hedge}, 1, 'the hedge comes with the admin key option');
    is(
        open_options($rotating, { 'rotate-admin-key' => 1 }, {})->{hedge},
        0,
        'and goes away with it, so it cannot land on --wipe-rotating-keys alone',
    );
    my $lockbox = {
        AUTH_INSECURE_CLIENT_KEY_TYPE => {
            detail =>
                [{ message => 'entity client.osd-lockbox.abc using insecure key type: aes' }],
        },
    };
    is(open_options($lockbox, {}, {})->{hedge}, 0, 'a lockbox key does not raise it');
}

# 'client.admin' backs any storage that names no user, and --rotate-storage-key refuses it.
{
    my $checks = {
        AUTH_INSECURE_CLIENT_KEY_TYPE => {
            detail => [{ message => 'entity client.admin using insecure key type: aes' }],
        },
    };
    my $res = classify_insecure_clients($checks, { 'client.admin' => ['cephfs', 'cp'] });
    is_deeply($res->{admin}, ['client.admin'], 'the admin entity stays out of the storage bucket');
    is_deeply($res->{storage}, [], 'even when storages reference it');
    is_deeply(
        open_options($checks, {}, { 'client.admin' => ['cephfs', 'cp'] })->{next},
        ["--rotate-admin-key: 'client.admin' and the copies of it that Proxmox VE keeps"],
        'so the option offered is the one that accepts it',
    );
}

# The detail line is matched whole; one that merely starts the same way is not a key
{
    my $loose = {
        AUTH_INSECURE_CLIENT_KEY_TYPE => {
            detail => [
                { message => 'entity client.a using insecure key type: aes and more text' },
                { message => 'prefixed entity client.b using insecure key type: aes' },
            ],
        },
    };
    my $res = classify_insecure_clients($loose);
    is_deeply([map { $res->{$_}->@* } sort keys %$res], [],
        'a message of another shape is ignored');
}

# A durable copy can exist from the moment the first write starts: an OSD's bluestore label is
# written before the data-directory keyring, and the label is what the data directory is rebuilt
# from at boot. Dropping the staged key then would leave that OSD unable to start.
{
    my $fp = key_fingerprint($NEW);
    is(
        resume_verdict({ phase => 'writing', key => $fp }, $fp)->{verdict},
        'commit',
        'a run killed while writing durable copies commits rather than drops the key',
    );
    is(
        resume_verdict({ phase => 'writing', key => $fp }, $fp)->{restart},
        1,
        'and restarts the daemon, which may still hold the old key in memory',
    );
    is(
        resume_verdict({ phase => 'staged', key => $fp }, $fp)->{verdict},
        'clear',
        'while nothing written yet is still safe to drop',
    );
    is(
        resume_verdict({ phase => 'writing', key => $fp }, undef)->{restart},
        1,
        'a committed key with no pending entry left still needs the restart',
    );
    is(
        resume_verdict({ phase => 'committed', key => $fp }, undef)->{restart},
        1,
        'the journal keeps requiring repair after promotion until the slow path finishes',
    );
}

# An encrypted OSD's lockbox key is only migrated once the auth entry and the LVM tag its keyring
# is rebuilt from at activation both hold the new one.
{
    my $info = {
        lockbox => {
            'client.osd-lockbox.aaa' => {
                fsid => 'aaa',
                cipher => 'aes',
                tag_cipher => 'aes',
                tag_matches => 1,
                node => 'due',
                id => 0,
                device => '/dev/vg/osd-block-aaa',
            },
            'client.osd-lockbox.bbb' => {
                fsid => 'bbb',
                cipher => $CIPHER,
                tag_cipher => $CIPHER,
                tag_matches => 1,
                node => 'tre',
                id => 1,
                device => '/dev/vg/osd-block-bbb',
            },
            'client.osd-lockbox.ccc' => {
                fsid => 'ccc',
                cipher => $CIPHER,
                tag_cipher => 'aes',
                tag_matches => 0,
                node => 'uno',
                id => 2,
                device => '/dev/vg/osd-block-ccc',
            },
            # both copies decode as the new cipher but hold different keys, which is what a run
            # interrupted between the tag write and the commit leaves behind
            'client.osd-lockbox.ddd' => {
                fsid => 'ddd',
                cipher => $CIPHER,
                tag_cipher => $CIPHER,
                tag_matches => 0,
                node => 'due',
                id => 3,
                device => '/dev/vg/osd-block-ddd',
            },
            'client.osd-lockbox.eee' => {
                fsid => 'eee',
                cipher => 'aes',
                tag_cipher => undef,
                tag_matches => 0,
                node => 'tre',
                id => 4,
                missing => 'no block device carries that fsid',
            },
            # left behind by a destroyed OSD: no device anywhere to write a tag to
            'client.osd-lockbox.fff' => { fsid => 'fff', cipher => 'aes', orphaned => 1 },
        },
    };

    is_deeply(plan_lockbox_keys($info, {}), [], 'nothing is planned without the option');

    my $planned = plan_lockbox_keys($info, { 'rotate-lockbox-keys' => 1 });
    is_deeply(
        [sort map { $_->{fsid} } @$planned],
        ['aaa', 'ccc', 'ddd', 'eee'],
        'a legacy key is planned, and so is any OSD whose two copies disagree',
    );
    ok(
        !grep({ $_->{fsid} eq 'bbb' } @$planned),
        'only an OSD whose tag holds the very key the auth entry holds is left alone',
    );
    ok(
        (grep { $_->{fsid} eq 'ddd' } @$planned),
        'two different keys that both decode as the new cipher are not mistaken for done',
    );
    is(
        (grep { $_->{fsid} eq 'eee' } @$planned)[0]->{missing},
        'no block device carries that fsid',
        'an entry that could not be located carries its error, so preflight can refuse it',
    );
    is(
        (grep { $_->{fsid} eq 'aaa' } @$planned)[0]->{node},
        'due',
        'each entry carries the node its tag lives on',
    );
    ok(
        !grep({ $_->{fsid} eq 'fff' } @$planned),
        'an entry no OSD in the map claims is left out, so the rest can still be rotated',
    );
    is_deeply(
        plan_lockbox_keys({ lockbox => {} }, { 'rotate-lockbox-keys' => 1 }),
        [],
        'a cluster with no encrypted OSD plans nothing',
    );
}

# One probe per node answers for every encrypted OSD there, each line naming its fsid.
{
    my $facts = parse_lockbox_output(
        "aaa path=/dev/vg/osd-block-aaa\naaa count=1\naaa secret=$OLD\n"
            . "bbb path=/dev/vg/osd-block-bbb\nbbb count=0\nbbb secret=\n"
            . "ccc error=no block device carries 'ceph.osd_fsid=ccc' with 'ceph.type=block'\n"
            . "garbage line\n",
    );
    is_deeply(
        $facts,
        {
            aaa => { path => '/dev/vg/osd-block-aaa', count => '1', secret => $OLD },
            bbb => { path => '/dev/vg/osd-block-bbb', count => '0', secret => '' },
            ccc =>
                { error => "no block device carries 'ceph.osd_fsid=ccc' with 'ceph.type=block'" },
        },
        'each fact lands with the OSD it is about, an error stands in for the facts',
    );
    is_deeply(parse_lockbox_output(''), {}, 'no output, no facts');
}

done_testing();
