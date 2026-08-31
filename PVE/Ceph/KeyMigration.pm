package PVE::Ceph::KeyMigration;

# The decisions behind the cephx aes256k key migration, kept apart from the helper that carries
# them out so they can be tested: every sub here maps data to data and touches nothing else.

use v5.36;

use Digest::SHA qw(sha256_hex);
use JSON;
use MIME::Base64 qw(decode_base64);

use PVE::Ceph::Services;
use PVE::Ceph::Tools;

use base 'Exporter';

our @EXPORT_OK = qw(
    $CIPHER $LEGACY_CIPHER $CIPHER_ID $CIPHER_NAMES $CIPHER_IDS
    $DAEMON_TYPES $TOOL_CLIENT_KEYS $ADMIN_ENTITY
    key_cipher key_fingerprint keyring_text short_version version_has_cipher
    parse_probe_output needs_rotation mon_key_needs_rotation mon_keyring_stale
    mon_key_rotation_wanted client_keys_requested migration_unfinished unfinished_entities
    touched_daemons
    plan_client_keys plan_lockbox_keys build_plan merge_configured_daemons resume_verdict
    classify_insecure_clients open_options parse_lockbox_output
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

# The daemons this run writes to. Only these are asked about their data directory, so a run
# narrowed with '--only' touches one node instead of every node that runs a daemon.
# Ceph only lists daemons that are running, so one that is merely stopped would be missed and its
# key never migrated, which the service ticket switch at the end then refuses over. $configured is
# { <id> => <node> } from what the nodes broadcast about themselves.
sub merge_configured_daemons($daemons, $type, $configured, $existing = undef) {
    my $running = { map { $_->{id} => 1 } @$daemons };
    my $ghosts = [];
    for my $id (sort keys %{ $configured // {} }) {
        next if $running->{$id};
        # a removed daemon can leave its data directory behind, and there is nothing to rotate
        # for it, so it must not block the run
        if ($existing && !$existing->{$id}) {
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
sub open_options($checks, $opts, $storage_entities, $service_cipher = $CIPHER) {
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

    # a run narrowed by '--only' is refused this until the cipher is switched
    push @$next,
        "--wipe-rotating-keys: discard the rotating service keys instead of letting them"
        . " expire"
        if $checks->{AUTH_INSECURE_ROTATING_SERVICE_KEY_TYPE}
        && !$opts->{'wipe-rotating-keys'}
        && !($opts->{only} && $service_cipher ne $CIPHER);

    return {
        next => $next,
        stuck => [$clients->{other}->@*], # a lockbox key has an option, so it is not stuck
        lockbox => $lockbox_open,
        hedge => $hedge,
    };
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
