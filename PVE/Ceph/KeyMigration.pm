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
    mon_key_rotation_wanted client_keys_requested unfinished_entities touched_daemons
    plan_client_keys build_plan merge_configured_daemons resume_verdict
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

# rotated but not written everywhere. An OSD left stopped stays in 'osd metadata', so the recovery
# walk alone misses some
sub unfinished_entities($state) {
    my $finished = { %{ $state->{done} // {} } };
    $finished->{'mon.'} = 1 if $state->{mon_key_complete}; # the monitor step's own marker

    my $started = { %{ $state->{rotated} // {} }, %{ $state->{previous_keys} // {} } };
    return sort grep { !$finished->{$_} } keys %$started;
}

# The daemons this run writes to. Only these are asked about their data directory, so a run
# narrowed with '--only' touches one node instead of every node that runs a daemon.
# Ceph only lists daemons that are running, so one that is merely stopped would be missed and its
# key never migrated, which the service ticket switch at the end then refuses over. $configured is
# { <id> => <node> } from what the nodes broadcast about themselves.
sub merge_configured_daemons($daemons, $type, $configured) {
    my $running = { map { $_->{id} => 1 } @$daemons };
    for my $id (sort keys %{ $configured // {} }) {
        next if $running->{$id};
        push @$daemons,
            {
                type => $type,
                id => "$id",
                entity => $type eq 'mon' ? 'mon.' : "$type.$id",
                node => $configured->{$id},
                down => 1,
            };
    }

    return $daemons;
}

# What a run has to do about a live swap an earlier one did not finish, given its journal entry and
# the key staged right now. Split out from the doing so every interruption point can be tested:
#   verdict  'none'    nothing was journalled, or nothing is staged
#            'clear'   drop the staged key, no copy on disk holds it
#            'commit'  a copy on disk holds it, so the monitors have to take it rather than lose it
#            'foreign' something else staged this key, so leave it alone
#   restart  the daemon may hold a key the monitors have moved past, so it cannot stay running
sub resume_verdict($swap, $staged_fingerprint) {
    return { verdict => 'none', restart => 0 } if !$swap;

    my $written = ($swap->{phase} // '') eq 'written' ? 1 : 0;
    return { verdict => 'none', restart => $written } if !defined($staged_fingerprint);

    # A journal entry from before fingerprints were recorded cannot prove ownership, and the run
    # that wrote it is the only one that could have staged a key for an entity it was working on.
    my $mine = !defined($swap->{key}) || $swap->{key} eq $staged_fingerprint;
    return { verdict => 'foreign', restart => 0 } if !$mine;

    return { verdict => $written ? 'commit' : 'clear', restart => $written };
}

sub touched_daemons($info, $plan) {
    my @touched = $plan->{daemons}->@*;
    push @touched, $info->{daemons}->{mon}->@* if $plan->{mon_key} && !$plan->{mon_repair_only};

    return @touched;
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
        if (
            !needs_rotation($info, $entity)
            && (!$state->{rotated}->{$entity} || $state->{done}->{$entity})
        ) {
            next;
        }

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

sub build_plan($info, $state, $opts, $files) {
    my $only = $opts->{only};
    my $plan = { mon_key => 0, daemons => [], service_cipher => 0, scoped => $only ? 1 : 0 };

    # rotating 'mon.' restarts the quorum, hence opt-in. A repair or a resume restarts nothing
    my $mon_wanted = !$only || $only->{mon};
    my $resume_mon = $state->{rotated}->{'mon.'} && !$state->{mon_key_complete};
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
        for my $daemon ($info->{daemons}->{$type}->@*) {
            next if $only && !$only->{$type} && !$only->{ $daemon->{entity} };
            # not the marker alone: a reused OSD id gets a fresh key that needs migrating like any
            # other
            if (
                $state->{done}->{ $daemon->{entity} }
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
                !needs_rotation($info, $daemon->{entity})
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

    return $plan;
}

1;
