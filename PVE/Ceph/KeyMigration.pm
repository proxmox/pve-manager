package PVE::Ceph::KeyMigration;

# The decisions behind the cephx aes256k key migration, kept apart from the helper that carries
# them out so they can be tested: every sub here maps data to data and touches nothing else.

use v5.36;

use Digest::SHA qw(sha256_hex);
use JSON;
use MIME::Base64 qw(decode_base64);

use PVE::Ceph::Services;
use PVE::Tools ();
use PVE::Ceph::Tools;

use base 'Exporter';

our @EXPORT_OK = qw(
    $CIPHER $LEGACY_CIPHER $CIPHER_ID $CIPHER_NAMES $CIPHER_IDS
    $DAEMON_TYPES $TOOL_CLIENT_KEYS $ADMIN_ENTITY
    key_cipher key_fingerprint keyring_text short_version version_has_cipher
    parse_probe_output osd_label_identity needs_rotation mon_key_needs_rotation mon_keyring_stale
    mon_key_rotation_wanted client_keys_requested migration_unfinished unfinished_entities
    touched_daemons
    plan_client_keys plan_lockbox_keys build_plan configured_daemon_locations
    resolve_configured_locations merge_configured_daemons resume_verdict
    summarize_sessions session_hosts merge_refresh_record stale_consumers restrict_blockers
    cephfs_mount_storages ack_decision finish_after_acks
    classify_insecure_clients open_options open_actions parse_lockbox_output
);

our $CIPHER = 'aes256k';
our $LEGACY_CIPHER = 'aes';

# cipher type is a little-endian 16 bit prefix, see CryptoKey::encode() in Ceph
our $CIPHER_ID = 2; # CEPH_CRYPTO_AES256KRB5
our $CIPHER_NAMES = { 0 => 'none', 1 => $LEGACY_CIPHER, 2 => $CIPHER };
our $CIPHER_IDS = { reverse $CIPHER_NAMES->%* };

our $DAEMON_TYPES = ['mgr', 'mds', 'osd']; # cheaper restarts first

# no in-kernel client reads these, so no node's kernel gates them
our $TOOL_CLIENT_KEYS = [
    'client.bootstrap-mds',
    'client.bootstrap-mgr',
    'client.bootstrap-osd',
    'client.bootstrap-rbd',
    'client.bootstrap-rbd-mirror',
    'client.bootstrap-rgw',
    'client.crash',
];

our $ADMIN_ENTITY = 'client.admin';

sub key_cipher($key) {
    return undef if !defined($key) || $key eq '';

    # decode_base64() drops anything that is not base64 rather than failing, so a short decode is
    # how garbage shows up. A key blob is at least a cipher type, a timestamp and a secret length.
    my $raw = eval { decode_base64($key) };
    return undef if $@ || !defined($raw) || length($raw) < 12;

    return unpack('v', substr($raw, 0, 2));
}

# Names the key a marker describes, so a marker left by a run that targeted a different key does
# not read as work already done. Never the key itself: the markers are progress, not secrets.
sub key_fingerprint($key) {
    return substr(sha256_hex($key // ''), 0, 16);
}

# the JSON form: plain-text 'auth get' adds a 'pending key' line no keyring parser accepts
sub keyring_text($entry) {
    my $text = "[$entry->{entity}]\n\tkey = $entry->{key}\n";
    my $caps = $entry->{caps} // {};
    for my $system (sort keys %$caps) {
        my $value = $caps->{$system} =~ s/"/\\"/gr;
        $text .= "\tcaps $system = \"$value\"\n";
    }

    return $text;
}

# parse_ceph_version() insists on the commit hash, which a bare or dev version lacks
sub short_version($version) {
    return 'an unknown version' if !defined($version) || $version eq '';

    return $version =~ m/^(?:ceph\s+version\s+)?v?(\d+(?:\.\d+)+)/ ? $1 : $version;
}

sub version_has_cipher($version) {
    return 0 if !defined($version) || $version eq '';
    return PVE::Ceph::Services::ceph_version_supports_aes256k($version) ? 1 : 0;
}

# the label is JSON keyed by device path; whoami and fsid say which OSD of which cluster
sub parse_probe_output($output) {
    my $probes = {};
    for my $line (split(/\n/, $output)) {
        next if $line !~ m/^(label|keyring|store|error) (\S+)(?: (.*))?$/;
        my ($kind, $spec, $payload) = ($1, $2, $3 // '');
        my $probe = $probes->{$spec} //= {};

        if ($kind eq 'error') {
            $probe->{store} = 'probe-error';
            $probe->{error} = $payload;
        } elsif ($kind eq 'keyring') {
            $probe->{store} = 'file';
            $probe->{sections} = [$payload =~ m/\[([^\]]+)\]/g];
        } elsif ($kind eq 'store') {
            $probe->{store} = $payload;
        } elsif ($kind eq 'label') {
            my $label = eval { decode_json($payload) };
            $label = {} if ref($label) ne 'HASH';
            my ($dev) = grep { ref($label->{$_}) eq 'HASH' } sort keys %$label;
            my $fields = $dev ? $label->{$dev} : undef;
            $probe->{store} =
                defined($fields) && defined($fields->{osd_key}) ? 'block' : 'block-without-key';
            $probe->{'label-whoami'} = $fields->{whoami} if $fields;
            $probe->{'label-fsid'} = $fields->{ceph_fsid} if $fields;
            $probe->{'label-osd-uuid'} = $fields->{osd_uuid} if $fields;
            $probe->{'label-key'} = $fields->{osd_key} if $fields;
        }
    }

    return $probes;
}

# One line per fact, each prefixed with the fsid it is about, so one probe answers for every
# encrypted OSD of a node: { <fsid> => { path, count, secret, error } }
sub parse_lockbox_output($output) {
    my $facts = {};
    for my $line (split(/\n/, $output // '')) {
        next if $line !~ m/^(\S+) (path|count|secret|error)=(.*)$/;
        $facts->{$1}->{$2} = $3;
    }

    return $facts;
}

# Match the device under an OSD data directory to the current OSD incarnation. An OSD ID and the
# cluster FSID survive ID reuse, so only the per-OSD UUID distinguishes a leftover old device.
sub osd_label_identity($daemon, $cluster_fsid) {
    my $whoami = $daemon->{'label-whoami'} // '';
    my $fsid = $daemon->{'label-fsid'} // '';
    my $uuid = $daemon->{'label-osd-uuid'} // '';
    my $expected_uuid = $daemon->{'osd-uuid'} // '';

    return 'wrong-id' if $whoami ne '' && $whoami ne $daemon->{id};
    return 'wrong-cluster' if $fsid ne '' && $fsid ne $cluster_fsid;
    return 'incomplete' if $whoami eq '' || $fsid eq '' || $uuid eq '';
    return 'missing-map-uuid' if $daemon->{down} && $expected_uuid eq '';
    return 'wrong-uuid' if $expected_uuid ne '' && $uuid ne $expected_uuid;
    return 'ok';
}

sub needs_rotation($info, $entity) {
    my $entry = $info->{exported}->{$entity};

    # 'ceph-mon --mkfs' moves 'mon.' out of the auth database into the monitor keyrings, so judge
    # its cipher by the copy on the cluster file system, and call it due only if there is none.
    if (!$entry) {
        return 0 if $entity ne 'mon.';
        my $key = $info->{pve_mon_key};
        return 1 if !defined($key);
        return (key_cipher($key) // -1) != $CIPHER_ID ? 1 : 0;
    }

    return (key_cipher($entry->{key}) // -1) != $CIPHER_ID ? 1 : 0;
}

sub mon_key_needs_rotation($info) {
    return needs_rotation($info, 'mon.');
}

# 'pveceph mon create' feeds this copy to --mkfs, so a stale one strands every later monitor
sub mon_keyring_stale($info) {
    my $current = $info->{mon_entry}->{key} // '';
    return 0 if $current eq '';
    return ($info->{pve_mon_key} // '') ne $current ? 1 : 0;
}

# must agree with the plan, or '--rotate-mon-key' on a migrated cluster is dropped silently
sub mon_key_rotation_wanted($info, $opts) {
    return 0 if !$opts->{'rotate-mon-key'};

    my $only = $opts->{only};
    return 0 if $only && !$only->{mon};

    return mon_key_needs_rotation($info) ? 1 : 0;
}

sub client_keys_requested($opts) {
    return 1 if $opts->{'rotate-client-keys'} || $opts->{'rotate-admin-key'};
    return scalar(@{ $opts->{'rotate-storage-key'} // [] }) ? 1 : 0;
}

# A completed older rotation must not hide a newer interrupted one. Live-swap state is always open;
# the other markers use their timestamps to distinguish two rotations of the same entity.
sub migration_unfinished($state, $entity) {
    return 1 if $state->{live_swap}->{$entity};

    my $rotated = $state->{rotated}->{$entity};
    my $previous = $state->{previous_keys}->{$entity};
    my $started = defined($rotated) || defined($previous);
    return 0 if !$started;

    my $done = $state->{done}->{$entity};
    return 1 if !defined($done);

    my @times = grep { defined($_) && /^\d+(?:\.\d+)?$/ } (
        $rotated, ref($previous) eq 'HASH' ? $previous->{saved} : undef,
    );
    return scalar(grep { $_ > $done } @times) ? 1 : 0;
}

# Rotated but not written everywhere. An OSD left stopped stays in 'osd metadata', so the recovery
# walk alone misses some. A lockbox key with a journal entry is finished from that journal before
# any plan is built, so it is not listed as something the plan has to pick up.
sub unfinished_entities($state) {
    my $started = {
        %{ $state->{rotated} // {} },
        %{ $state->{previous_keys} // {} },
        %{ $state->{live_swap} // {} },
    };

    return sort grep {
        $_ eq 'mon.' && $state->{mon_key_complete} ? 0
            : $state->{lockbox}->{$_} ? 0
            : migration_unfinished($state, $_)
    } keys %$started;
}

# Keep every node that reports a data directory for an ID. Silently picking one would direct a
# stopped-daemon key write at an arbitrary leftover directory when an ID was reused.
sub configured_daemon_locations($by_node) {
    my $locations = {};
    for my $node (sort keys %{ $by_node // {} }) {
        my $ids = $by_node->{$node};
        next if ref($ids) ne 'HASH';
        for my $id (sort keys %$ids) {
            next if ref($ids->{$id}) ne 'HASH' || !$ids->{$id}->{direxists};
            push $locations->{"$id"}->@*, $node;
        }
    }
    return $locations;
}

# Running metadata is authoritative for its current node. Otherwise duplicate locations are
# ambiguous for an existing daemon, while every location of an absent OSD is only a remnant.
sub resolve_configured_locations($type, $locations, $running, $existing = undef) {
    my ($configured, $ghosts, $conflicts) = ({}, [], []);
    for my $id (sort keys %{ $locations // {} }) {
        my $nodes = $locations->{$id};
        next if $running->{$id};
        if ($existing && !exists($existing->{$id})) {
            push @$ghosts, map { { type => $type, id => "$id", node => $_ } } @$nodes;
            next;
        }
        if (scalar(@$nodes) > 1) {
            push @$conflicts, { type => $type, id => "$id", nodes => [@$nodes] };
            next;
        }
        $configured->{$id} = $nodes->[0];
    }
    return ($configured, $ghosts, $conflicts);
}

# The daemons this run writes to. Only these are asked about their data directory, so a run
# narrowed with '--only' touches one node instead of every node that runs a daemon.
# Ceph only lists daemons that are running, so one that is merely stopped would be missed and its
# key never migrated, which the service ticket switch at the end then refuses over. $configured is
# { <id> => <node> } from what the nodes broadcast about themselves.
# Live sessions come from each monitor's admin socket. Only 'client' connections matter here:
# daemons re-read their keyring at restart, while a client process loads its key once and keeps
# it for as long as it runs.
sub summarize_sessions($per_mon, $expected_mons = undef) {
    my $summary = { complete => 1, clients => {} };
    if (ref($per_mon) ne 'ARRAY') {
        $summary->{complete} = 0;
        return $summary;
    }

    my ($expected, $seen);
    if (defined($expected_mons)) {
        if (
            ref($expected_mons) ne 'ARRAY'
            || !scalar(@$expected_mons)
            || grep { !defined($_) || ref($_) || !length($_) } @$expected_mons
        ) {
            $summary->{complete} = 0;
        } else {
            $expected = { map { $_ => 1 } @$expected_mons };
            $summary->{complete} = 0 if scalar(keys %$expected) != scalar(@$expected_mons);
            $seen = {};
        }
    }

    for my $mon (@$per_mon) {
        if (ref($mon) ne 'HASH' || ref($mon->{sessions}) ne 'ARRAY') {
            $summary->{complete} = 0;
            next;
        }
        if ($expected) {
            my $id = $mon->{mon};
            if (!defined($id) || ref($id) || !$expected->{$id} || $seen->{$id}++) {
                $summary->{complete} = 0;
                next;
            }
        }
        for my $session ($mon->{sessions}->@*) {
            if (
                ref($session) ne 'HASH'
                || !defined($session->{con_type})
                || ref($session->{con_type})
                || !length($session->{con_type})
            ) {
                $summary->{complete} = 0;
                next;
            }
            next if $session->{con_type} ne 'client';

            my $gid = $session->{global_id};
            my $entity = $session->{entity_name};
            if (
                !defined($gid)
                || ref($gid)
                || $gid !~ m/^\d+$/
                || !defined($entity)
                || ref($entity)
                || !length($entity)
            ) {
                $summary->{complete} = 0;
                next;
            }

            my $socket = $session->{socket_addr};
            if (
                defined($socket)
                && (ref($socket) ne 'HASH'
                    || (defined($socket->{addr}) && ref($socket->{addr})))
            ) {
                $summary->{complete} = 0;
                next;
            }
            my ($host) = ((($socket // {})->{addr} // '') =~ m/^\[?(.+?)\]?:\d+$/);
            push $summary->{clients}->{$entity}->@*, { global_id => $gid, host => $host // '?' };
        }
    }
    if ($expected && scalar(keys %$seen) != scalar(keys %$expected)) {
        $summary->{complete} = 0;
    }
    return $summary;
}

# the hosts of one entity's live sessions, as 'host: count' for the run log
sub session_hosts($live) {
    my $hosts = {};
    $hosts->{ $_->{host} }++ for @$live;
    return join(', ', map { "$_: $hosts->{$_}" } sort keys %$hosts);
}

# Add every instance observed around a rotation without losing evidence from an earlier one.
# The post-rotation sample closes the race where a client loaded the old key after the first
# sample. It can also include a client that already loaded the new key, but retaining that ID is
# the safe ambiguity: refreshing one extra consumer is preferable to accepting an old key.
sub merge_refresh_record($record, $sessions, $entity, $measurement_complete, $rotated = undef) {
    my $merged = { %{ $record // {} } };
    my $ids = {};
    for my $id (@{ $merged->{session_ids} // [] }) {
        $ids->{"$id"} = $id;
    }
    for my $session (@{ ($sessions->{clients} // {})->{$entity} // [] }) {
        my $id = $session->{global_id} // next;
        $ids->{"$id"} = $id;
    }
    $merged->{session_ids} = [sort { "$a" cmp "$b" } values %$ids]
        if scalar(keys %$ids) || defined($merged->{session_ids}) || $measurement_complete;

    if ($measurement_complete) {
        delete $merged->{measurement_incomplete};
    } else {
        $merged->{measurement_incomplete} = 1;
    }

    if (defined($rotated)) {
        $merged->{rotated} = $rotated;
        delete $merged->{cleared};
        delete $merged->{acknowledged};
    }

    return $merged;
}

# A recorded ID names the same client instance across reconnects and monitor restarts. Numeric
# order says nothing because monitors allocate IDs in independent rank-strided sequences.
sub stale_consumers($sessions, $refresh) {
    my $stale = {};
    for my $entity (sort keys %{ $refresh // {} }) {
        my $recorded = { map { $_ => 1 } @{ $refresh->{$entity}->{session_ids} // [] } };
        my @held = grep { $recorded->{ $_->{global_id} } }
            @{ ($sessions->{clients} // {})->{$entity} // [] };
        $stale->{$entity} = \@held if scalar(@held);
    }
    return $stale;
}

# The CephFS storages whose mount reads a rotated key. The kernel holds the key a mount was
# made with and cannot take a new one, so such a mount is a consumer of its own.
sub cephfs_mount_storages($item) {
    my $stores = {};
    for my $file ($item->{files}->@*) {
        next if ($file->{format} // '') ne 'secret' || !defined($file->{store});
        $stores->{ $file->{store} } = 1;
    }
    return [sort keys %$stores];
}

# Whether the cipher restriction would go through once exactly the confirmations a run offers
# are given. Asking the blocker set itself, on a copy of the state with those records closed,
# keeps the offer honest: an empty option list says nothing about a key nobody manages, a
# service key still on the old cipher, or a rotation this very run is about to make.
sub finish_after_acks($info, $state, $ready) {
    my $records = { ($state->{client_refresh} // {})->%* };
    for my $entity (@$ready) {
        $records->{$entity} = { ($records->{$entity} // {})->%*, cleared => time() };
    }

    return scalar(@{ restrict_blockers($info, { %$state, client_refresh => $records }) })
        ? 0
        : 1;
}

# What a requested confirmation can do, from the records and the session picture alone. Only
# 'accept' closes a record; everything else names what stands in the way, and 'measure' first
# turns the clients visible right now into named consumers.
sub ack_decision($entity, $state, $sessions, $stale) {
    my $mark = ($state->{client_refresh} // {})->{$entity};
    return { verdict => 'unknown' } if !$mark;
    return { verdict => 'connected', held => $stale->{$entity} } if $stale->{$entity};
    return { verdict => 'incomplete' } if !$sessions->{complete};

    if ($mark->{measurement_incomplete} || !defined($mark->{session_ids})) {
        my $live = ($sessions->{clients} // {})->{$entity} // [];
        return { verdict => 'measure', live => $live } if scalar(@$live);
    }

    return { verdict => 'accept' };
}

# what must be resolved before the old cipher can be disallowed without stopping a consumer
sub restrict_blockers($info, $state) {
    my $blockers = [];
    my $sessions = $info->{sessions} // {};
    push @$blockers,
        "not every monitor answered the session query, so live consumers cannot be verified"
        if !$sessions->{complete};
    push @$blockers,
        "the service tickets still use the '" . ($info->{service_cipher} // 'unknown') . "' cipher"
        if ($info->{service_cipher} // '') ne $CIPHER;

    my $old_active = {};
    my @old_keys;
    for my $entity (sort keys %{ $info->{exported} // {} }) {
        my $entry = $info->{exported}->{$entity};
        if ((key_cipher($entry->{key}) // -1) != $CIPHER_ID) {
            $old_active->{$entity} = 1;
            push @old_keys, "$entity (active)";
        }
        if (
            defined($entry->{pending_key})
            && length($entry->{pending_key})
            && (key_cipher($entry->{pending_key}) // -1) != $CIPHER_ID
        ) {
            push @old_keys, "$entity (pending)";
        }
    }
    if (scalar(@old_keys)) {
        my $count = scalar(@old_keys);
        my @shown_keys = @old_keys;
        my $shown = join(', ', splice(@shown_keys, 0, 5));
        $shown .= " and " . scalar(@shown_keys) . " more" if scalar(@shown_keys);
        push @$blockers,
            "$count active or pending keys still use another cipher: $shown"
            . " (run this without '--restrict-ciphers' to see the option for each)";
    }
    push @$blockers, "the stored 'mon.' key still uses another cipher, see '--rotate-mon-key'"
        if defined($info->{pve_mon_key})
        && (key_cipher($info->{pve_mon_key}) // -1) != $CIPHER_ID;

    for my $entity (sort keys %{ $sessions->{clients} // {} }) {
        next if !$old_active->{$entity};
        push @$blockers,
            scalar(@{ $sessions->{clients}->{$entity} })
            . " live client(s) authenticate as '$entity' ("
            . session_hosts($sessions->{clients}->{$entity})
            . "), whose key they could then no longer use";
    }
    my $stale = stale_consumers($sessions, $state->{client_refresh});
    for my $entity (sort keys %{ $state->{client_refresh} // {} }) {
        my $mark = $state->{client_refresh}->{$entity};
        if (my $held = $stale->{$entity}) {
            push @$blockers,
                scalar(@$held)
                . " recorded live client(s) may still hold the previous key of '$entity' ("
                . session_hosts($held) . ")";
            next;
        }
        next if defined($mark->{cleared});
        # a consumer can keep its IO on established connections without any monitor session,
        # so its absence from the sweep proves nothing; only the operator closes a record
        push @$blockers,
            "the rotation of '$entity' awaits '--ack-refreshed $entity' once every consumer"
            . " of it was refreshed";
    }
    push @$blockers, "the stored 'mon.' key could not be read, see '--rotate-mon-key'"
        if !defined($info->{pve_mon_key});
    # this monitor option overrides the restriction for as long as it is set
    push @$blockers,
        "the monitors run with 'mon_auth_emergency_allowed_ciphers' set, which overrides the"
        . " restriction; remove it from ceph.conf and restart every monitor first"
        if ($info->{health_checks} // {})->{AUTH_EMERGENCY_CIPHERS_SET};

    return $blockers;
}

sub merge_configured_daemons($daemons, $type, $configured, $existing = undef) {
    my $running = { map { $_->{id} => 1 } @$daemons };
    my $ghosts = [];
    for my $id (sort keys %{ $configured // {} }) {
        next if $running->{$id};
        # a removed daemon can leave its data directory behind, and there is nothing to rotate
        # for it, so it must not block the run
        if ($existing && !exists($existing->{$id})) {
            push @$ghosts, { type => $type, id => "$id", node => $configured->{$id} };
            next;
        }
        push @$daemons,
            {
                type => $type,
                id => "$id",
                entity => $type eq 'mon' ? 'mon.' : "$type.$id",
                node => $configured->{$id},
                down => 1,
                $type eq 'osd' && $existing ? ('osd-uuid' => $existing->{$id}) : (),
            };
    }

    return wantarray ? ($daemons, $ghosts) : $daemons;
}

# What a run has to do about a live swap an earlier one did not finish, given its journal entry and
# the key staged right now. Split out from the doing so every interruption point can be tested:
#   verdict  'none'    nothing was journalled, or nothing is staged
#            'clear'   drop the staged key, no copy on disk can hold it yet
#            'commit'  a copy on disk holds it, so the monitors have to take it rather than lose it
#            'foreign' something else staged this key, so leave it alone
#   restart  the daemon may hold a key the monitors have moved past, so it cannot stay running
sub resume_verdict($swap, $staged_fingerprint) {
    return { verdict => 'none', restart => 0 } if !$swap;

    # From 'writing' on, a durable copy may already hold the pending key: an OSD's bluestore label
    # is written first, and its data directory is rebuilt from that label at every boot. Dropping
    # the key then would leave the OSD with one no monitor accepts, so commit and let the caller
    # rewrite every copy.
    my $durable = ($swap->{phase} // '') =~ m/^(?:writing|written|committed)$/ ? 1 : 0;
    return { verdict => 'none', restart => $durable } if !defined($staged_fingerprint);

    # A journal entry from before fingerprints were recorded cannot prove ownership, and the run
    # that wrote it is the only one that could have staged a key for an entity it was working on.
    my $mine = !defined($swap->{key}) || $swap->{key} eq $staged_fingerprint;
    return { verdict => 'foreign', restart => 0 } if !$mine;

    return { verdict => $durable ? 'commit' : 'clear', restart => $durable };
}

sub touched_daemons($info, $plan) {
    my @touched = $plan->{daemons}->@*;
    push @touched, $info->{daemons}->{mon}->@* if $plan->{mon_key} && !$plan->{mon_repair_only};

    return @touched;
}

# A lockbox key looks ordinary, but its only persistent copy is an LVM tag on the OSD it unlocks,
# so rotating the auth entry just breaks that OSD's next activation.
sub classify_insecure_clients($checks, $storage_entities = {}) {
    my $found = {};
    my $check = $checks->{AUTH_INSECURE_CLIENT_KEY_TYPE}; # a rvalue deref here would autovivify it
    for my $detail (((defined($check) ? $check->{detail} : undef) // [])->@*) {
        my $message = $detail->{message} // '';
        $found->{$1} = 1 if $message =~ m/^entity (\S+) using insecure key type: \S+$/;
    }

    my $res = { lockbox => [], tool => [], admin => [], storage => [], other => [] };
    for my $entity (sort keys %$found) {
        my $bucket =
            $entity =~ m/^client\.osd-lockbox\./ ? 'lockbox'
            : $entity eq $ADMIN_ENTITY ? 'admin'
            : (grep { $_ eq $entity } $TOOL_CLIENT_KEYS->@*) ? 'tool'
            : $storage_entities->{$entity} ? 'storage'
            : 'other';
        push $res->{$bucket}->@*, $entity;
    }
    return $res;
}

# Only the options that can still change something. 'stuck' holds the keys none of them reach, for
# the caller to report rather than offer.
sub open_options(
    $checks, $opts, $storage_entities,
    $service_cipher = $CIPHER,
    $state = {},
    $sessions = undef,
) {
    my $clients = classify_insecure_clients($checks, $storage_entities);
    my $done = $opts->{'rotate-storage-key'} // [];

    my ($next, $hedge) = ([], 0);
    push @$next, "--rotate-client-keys: the bootstrap keys and 'client.crash'"
        if scalar($clients->{tool}->@*) && !$opts->{'rotate-client-keys'};
    if (scalar($clients->{admin}->@*) && !$opts->{'rotate-admin-key'}) {
        push @$next,
            "--rotate-admin-key: '$ADMIN_ENTITY' and the copies of it that Proxmox VE keeps";
        $hedge = 1;
    }
    for my $entity ($clients->{storage}->@*) {
        my $stores = $storage_entities->{$entity};
        next if grep {
            my $store = $_;
            grep { $_ eq $store } @$done
        } @$stores;
        my $shared = scalar(@$stores) > 1 ? ", shared by " . join(', ', @$stores) : '';
        push @$next, "--rotate-storage-key $stores->[0]: the '$entity' key$shared";
        $hedge = 1;
    }
    # the monitors recount a moment behind, so a run that passed the option is not offered it
    # again, nor warned off doing by hand what it just did
    my $lockbox_open = scalar($clients->{lockbox}->@*) && !$opts->{'rotate-lockbox-keys'} ? 1 : 0;
    push @$next,
        "--rotate-lockbox-keys: the lockbox key of every encrypted OSD, in the auth"
        . " database and in the LVM tag it is rebuilt from"
        if $lockbox_open;

    # a rotation this run cannot see the end of is a step of its own, and it comes before the
    # cipher restriction, which no record may survive
    my $records = $state->{client_refresh} // {};
    my $picture = $sessions // { complete => 0, clients => {} };
    my $stale = stale_consumers($picture, $records);
    my (@waiting, @ready);
    for my $entity (sort keys %$records) {
        my $cleared = defined($records->{$entity}->{cleared});
        # a confirmed record only becomes visible again when one of its retained IDs returns
        next if $cleared && !$stale->{$entity};

        my $verdict = ack_decision($entity, $state, $picture, $stale)->{verdict};
        if (!$cleared && $verdict eq 'accept') {
            push @ready, $entity;
        } else {
            push @waiting, $entity;
        }
    }

    # A run narrowed by '--only' is refused the wipe until the service cipher is switched. The
    # fresh action guard also refuses while the session picture or a refresh record is unresolved,
    # so do not present the wipe as the next step in that state.
    push @$next,
        "--wipe-rotating-keys: NOT RECOMMENDED; invalidate every service ticket instead of"
        . " waiting a few hours for the old rotating keys to expire; every client and service"
        . " daemon must support '$CIPHER'"
        if $checks->{AUTH_INSECURE_ROTATING_SERVICE_KEY_TYPE}
        && !$opts->{'wipe-rotating-keys'}
        && !($opts->{only} && $service_cipher ne $CIPHER)
        && (!$sessions || $picture->{complete})
        && !@waiting
        && !@ready;

    # The options that only touch what Proxmox VE itself reads can be carried out together
    # without a decision. Rotating 'client.admin' or a storage key is one, as their consumers
    # can sit outside this cluster, and so is the wipe, which buys a few hours of waiting for
    # a round trip of every client in the cluster; both are named but never bundled.
    my $together = [
        grep {
            my $entry = $_;
            grep { $entry =~ m/^\Q$_\E[: ]/ } (
                '--rotate-mon-key',
                '--rotate-client-keys',
                '--rotate-lockbox-keys',
                '--restrict-ciphers',
            )
        } @$next
    ];
    $together = [map { (split(/:/, $_, 2))[0] } @$together];

    return {
        next => $next,
        together => $together,
        waiting => \@waiting,
        ready => \@ready,
        stuck => [$clients->{other}->@*], # a lockbox key has an option, so it is not stuck
        lockbox => $lockbox_open,
        hedge => $hedge,
    };
}

# Add the final step only after asking the same cluster-wide predicate that guards it. The health
# details alone do not cover unmanaged clients, service keys, or work requested by the current run.
sub open_actions(
    $program, $checks, $opts, $storage_entities, $service_cipher, $state, $info,
) {
    my $open = open_options(
        $checks,
        $opts,
        $storage_entities,
        $service_cipher,
        $state,
        $info ? $info->{sessions} : undef,
    );
    my $finish =
        $info && !$opts->{'restrict-ciphers'} && $checks->{AUTH_INSECURE_KEYS_ALLOWED}
        ? finish_after_acks($info, $state, $open->{ready})
        : 0;

    if ($finish && !scalar($open->{ready}->@*) && !scalar($open->{next}->@*)) {
        push $open->{next}->@*,
            "--restrict-ciphers: allow only the '$CIPHER' cipher for authentication, once every"
            . " running consumer holds its rotated key";
        push $open->{together}->@*, '--restrict-ciphers';
    }

    if (scalar($open->{ready}->@*)) {
        $open->{command} =
            "$program --apply "
            . join(' ', map { "--ack-refreshed " . PVE::Tools::shellquote($_) } $open->{ready}->@*)
            . ($finish ? ' --restrict-ciphers' : '');
    }

    return $open;
}

# as { entity, files, kernel, reason }. Opt-in: only the operator knows what reads a client key
sub plan_client_keys($info, $state, $opts, $files) {
    my $wanted = {};
    if ($opts->{'rotate-client-keys'}) {
        $wanted->{$_} = "Ceph's own tools are the only ones that read it" for @$TOOL_CLIENT_KEYS;
    }
    $wanted->{$ADMIN_ENTITY} = 'asked for with --rotate-admin-key' if $opts->{'rotate-admin-key'};

    for my $storeid (@{ $opts->{'rotate-storage-key'} // [] }) {
        die "'--rotate-storage-key' needs a storage name\n" if $storeid eq '';

        my ($entity) = grep {
            grep { defined($_->{store}) && $_->{store} eq $storeid } $files->{$_}->@*
        } sort keys %$files;
        if (!$entity) {
            die "no Ceph storage named '$storeid' in the storage configuration, or it points at"
                . " another cluster\n";
        }
        if ($entity eq $ADMIN_ENTITY && !$opts->{'rotate-admin-key'}) {
            die "storage '$storeid' uses '$ADMIN_ENTITY', so add '--rotate-admin-key': every other"
                . " Ceph storage and the command line share that key\n";
        }
        $wanted->{$entity} = "used by storage '$storeid'";
    }

    my $plan = [];
    my $warnings = [];
    for my $entity (sort keys %$wanted) {
        if (!$info->{exported}->{$entity}) {
            push @$warnings,
                "'$entity' ($wanted->{$entity}) has no entry in the authentication database of"
                . " this cluster, so it is left alone";
            next;
        }
        # 'rotated' without 'done' means copies are missing; with 'done' the kernel check below
        # would refuse a key nobody is changing
        next if !needs_rotation($info, $entity) && !migration_unfinished($state, $entity);

        my $mine = $files->{$entity} // [];
        push @$plan,
            {
                entity => $entity,
                files => $mine,
                kernel => (grep { $_->{kernel} } @$mine) ? 1 : 0,
                reason => $wanted->{$entity},
            };
    }

    return ($plan, $warnings);
}

# An encrypted OSD's lockbox key has two persistent copies that must agree: the auth entry, and a
# 'ceph.cephx_lockbox_secret' LVM tag on that OSD's block device. ceph-volume rebuilds the keyring
# from the tag at every activation and uses it to fetch the LUKS passphrase, so a key is only
# migrated once both hold it. Nothing reads the keyring while the OSD runs.
sub plan_lockbox_keys($info, $opts) {
    return [] if !$opts->{'rotate-lockbox-keys'};

    my $wanted = [];
    for my $entity (sort keys $info->{lockbox}->%*) {
        my $osd = $info->{lockbox}->{$entity};
        # no OSD, no tag to write: the caller names it instead
        next if $osd->{orphaned};
        # matching ciphers are not enough: two different keys both on the new cipher leave the
        # OSD unable to unlock, which is what a half finished run leaves behind
        next
            if ($osd->{cipher} // '') eq $CIPHER
            && ($osd->{tag_cipher} // '') eq $CIPHER
            && $osd->{tag_matches};

        push @$wanted,
            {
                entity => $entity,
                fsid => $osd->{fsid},
                node => $osd->{node},
                id => $osd->{id},
                device => $osd->{device},
                missing => $osd->{missing},
            };
    }
    return $wanted;
}

sub build_plan($info, $state, $opts, $files) {
    my $only = $opts->{only};
    my $plan = {
        mon_key => 0,
        daemons => [],
        service_cipher => 0,
        lockbox_keys => [],
        scoped => $only ? 1 : 0,
    };

    # Rotating 'mon.' restarts the quorum, hence opt-in. A repair or a resume restarts nothing.
    # Completion markers name their target key, so a marker from an older rotation is not enough.
    # 'previous_keys' is saved before 'auth rotate' and 'rotated' after it, so either marks a
    # rotation the monitors still have to be carried through.
    my $mon_wanted = !$only || $only->{mon};
    my $mon_target = $info->{mon_entry}->{key};
    my $mon_started = $state->{rotated}->{'mon.'} || $state->{previous_keys}->{'mon.'};
    my $resume_mon = $mon_started
        && (!defined($mon_target)
            || ($state->{mon_key_complete} // '') ne key_fingerprint($mon_target));
    if (
        $resume_mon
        || ($mon_wanted && mon_keyring_stale($info))
        || mon_key_rotation_wanted($info, $opts)
    ) {
        $plan->{mon_key} = 1;
    }
    if ($plan->{mon_key} && !$resume_mon && !mon_key_rotation_wanted($info, $opts)) {
        $plan->{mon_repair_only} = 1;
    }

    for my $type (@$DAEMON_TYPES) {
        next if $only && !$only->{$type} && !grep { m/^\Q$type\E\./ } keys %$only;

        # Restarting a standby costs no failover, so the active manager goes last: a fallback
        # restart there fails over onto one already migrated.
        my $daemons = [$info->{daemons}->{$type}->@*];
        $daemons = [sort { ($a->{active} // 0) <=> ($b->{active} // 0) } @$daemons]
            if $type eq 'mgr';

        for my $daemon (@$daemons) {
            next if $only && !$only->{$type} && !$only->{ $daemon->{entity} };
            my $unfinished = migration_unfinished($state, $daemon->{entity});
            # Not the marker alone: a reused OSD id gets a fresh key that needs migrating like any
            # other.
            if (
                !$unfinished
                && $state->{done}->{ $daemon->{entity} }
                && !needs_rotation($info, $daemon->{entity})
            ) {
                next;
            }
            if ($daemon->{recovered}) {
                push $plan->{daemons}->@*, $daemon;
                next;
            }
            # 'previous_keys' is written before the rotation and 'rotated' after, so one without the
            # other means the auth db moved on and the daemon did not
            if (
                !$unfinished
                && !needs_rotation($info, $daemon->{entity})
                && !$state->{rotated}->{ $daemon->{entity} }
                && !$state->{previous_keys}->{ $daemon->{entity} }
            ) {
                next;
            }
            push $plan->{daemons}->@*, $daemon;
        }
    }

    my ($clients, $warnings) = plan_client_keys($info, $state, $opts, $files);
    $plan->{client_keys} = $clients;
    $plan->{warnings} = $warnings;

    # the switch locks out every key still on the old one, so only a full run may do it
    $plan->{service_cipher} = 1 if !$only && $info->{service_cipher} ne $CIPHER;

    $plan->{lockbox_keys} = plan_lockbox_keys($info, $opts);

    # a pending key takes its cipher from 'auth_preferred_cipher', so any path that stages one
    # needs that setting pointed at the new cipher for the run
    $plan->{stages_pending_keys} = (!$opts->{'restart-daemons'} && scalar($plan->{daemons}->@*))
        || scalar($plan->{lockbox_keys}->@*) ? 1 : 0;

    return $plan;
}

1;
