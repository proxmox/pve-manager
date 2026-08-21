#!/usr/bin/perl

use strict;
use warnings;

use lib ('.', '..');

use Test::More;

use PVE::Ceph::KeyMigration qw(
    $CIPHER $LEGACY_CIPHER
    key_cipher key_fingerprint parse_probe_output needs_rotation mon_keyring_stale
    mon_key_rotation_wanted unfinished_entities touched_daemons plan_client_keys build_plan
    merge_configured_daemons resume_verdict
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
    };
    is_deeply(
        [unfinished_entities($state)],
        ['client.admin', 'mon.', 'osd.2'],
        'a key recorded as rotated, or whose old key was saved, but never finished',
    );
    $state->{mon_key_complete} = 'fingerprint';
    is_deeply(
        [unfinished_entities($state)],
        ['client.admin', 'osd.2'],
        'the monitor step carries its own completion marker',
    );
    is_deeply([unfinished_entities({})], [], 'a fresh state has nothing outstanding');
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

done_testing();
