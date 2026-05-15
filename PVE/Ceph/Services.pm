package PVE::Ceph::Services;

use strict;
use warnings;

use PVE::Ceph::Tools;
use PVE::Cluster qw(cfs_read_file);
use PVE::INotify;
use PVE::Tools qw(run_command lock_file_full);
use PVE::RADOS;

use JSON;
use File::Path;
use Time::HiRes qw(time);

use constant SERVICE_REGEX => '[a-zA-Z0-9]([a-zA-Z0-9\-]*[a-zA-Z0-9])?';

# Scans both /etc/systemd/system/ and /run/systemd/system/ for enabled ceph-$type
# units (pveceph create-* uses persistent enable for mon/mgr/mds; ceph-volume
# uses --runtime enable for OSDs, which lands in /run), plus /var/lib/ceph/$type
# for data directories.
sub get_local_services {
    my $res = {};

    for my $type (qw(mds mgr mon osd)) {
        $res->{$type} = {};

        for my $base ('/etc/systemd/system', '/run/systemd/system') {
            my $path = "$base/ceph-$type.target.wants";
            my $regex = "ceph-$type\@(.*)\.service";
            PVE::Tools::dir_glob_foreach(
                $path,
                $regex,
                sub {
                    my (undef, $id) = @_;
                    $res->{$type}->{$id}->{service} = JSON::true;
                },
            );
        }

        my $path = "/var/lib/ceph/$type";
        my $regex = "([^-]+)-(.*)";
        PVE::Tools::dir_glob_foreach(
            $path,
            $regex,
            sub {
                my (undef, $clustername, $id) = @_;
                $res->{$type}->{$id}->{direxists} = JSON::true;
            },
        );
    }
    return $res;
}

sub broadcast_ceph_services {
    my $services = get_local_services();

    for my $type (keys %$services) {
        my $data = encode_json($services->{$type});
        PVE::Cluster::broadcast_node_kv("ceph-$type", $data);
    }
}

sub broadcast_ceph_versions {
    my ($version, $buildcommit, $vers_parts) = PVE::Ceph::Tools::get_local_version(1);

    return undef if !$version;

    my $nodename = PVE::INotify::nodename();
    my $old_versions = PVE::Cluster::get_node_kv("ceph-versions", $nodename);
    if (length(my $old_version_raw = $old_versions->{$nodename})) {
        my $old = eval { decode_json($old_version_raw) };
        warn "failed to parse ceph-versions '$old_version_raw' as JSON - $@" if $@; # should not happen
        if (
            defined($old)
            && $old->{buildcommit} eq $buildcommit
            && $old->{version}->{str} eq $version
        ) {
            return; # up to date, nothing to do so avoid (not exactly cheap) broadcast
        }
    }

    my $node_versions = {
        version => {
            str => $version,
            parts => $vers_parts,
        },
        buildcommit => $buildcommit,
    };
    PVE::Cluster::broadcast_node_kv("ceph-versions", encode_json($node_versions));
}

sub get_ceph_versions {
    my $res;

    if (defined(my $versions = PVE::Cluster::get_node_kv("ceph-versions"))) {
        $res = {
            map {
                eval { $_ => decode_json($versions->{$_}) }
            } keys %$versions
        };
    }

    return $res;
}

sub get_cluster_service {
    my ($type) = @_;

    my $raw = PVE::Cluster::get_node_kv("ceph-$type");
    my $res = {
        map {
            $_ => eval { decode_json($raw->{$_}) }
        } keys $raw->%*
    };

    return $res;
}

sub ceph_service_cmd {
    my ($action, $service) = @_;

    if ($service && $service =~ m/^(mon|osd|mds|mgr|radosgw)(\.(${\SERVICE_REGEX}))?$/) {
        $service = defined($3) ? "ceph-$1\@$3" : "ceph-$1.target";
    } else {
        $service = "ceph.target";
    }

    run_command(['/bin/systemctl', $action, $service]);
}

sub get_services_info {
    my ($type, $cfg, $rados) = @_;

    my $result = {};
    my $services = get_cluster_service($type);

    foreach my $host (sort keys %$services) {
        foreach my $id (sort keys %{ $services->{$host} }) {
            my $service = $result->{$id} = $services->{$host}->{$id};
            $service->{host} = $host;
            $service->{name} = $id;
            $service->{state} = 'unknown';
            if ($service->{service}) {
                $service->{state} = 'stopped';
            }
        }
    }

    if (!$cfg) {
        $cfg = cfs_read_file('ceph.conf');
    }

    foreach my $section (keys %$cfg) {
        my $d = $cfg->{$section};
        if ($section =~ m/^$type\.(\S+)$/) {
            my $id = $1;
            my $service = $result->{$id};
            my $addr = $d->{"${type}_addr"} // $d->{public_addr} // $d->{host};
            $service->{name} //= $id;
            $service->{addr} //= $addr;
            $service->{state} //= 'unknown';
            $service->{host} //= $d->{host};
        }
    }

    if (!$rados) {
        return $result;
    }

    my $metadata = $rados->mon_command({ prefix => "$type metadata" });
    foreach my $info (@$metadata) {
        my $id = $info->{name} // $info->{id};
        my $service = $result->{$id};
        $service->{ceph_version_short} = $info->{ceph_version_short};
        $service->{ceph_version} = $info->{ceph_version};
        $service->{host} //= $info->{hostname};
        $service->{addr} //= $info->{addr};
    }

    return $result;
}

# MDS

sub list_local_mds_ids {
    my $mds_list = [];
    my $ceph_mds_data_dir = PVE::Ceph::Tools::get_config('ceph_mds_data_dir');
    my $ccname = PVE::Ceph::Tools::get_config('ccname');

    PVE::Tools::dir_glob_foreach(
        $ceph_mds_data_dir,
        qr/$ccname-(\S+)/,
        sub {
            my (undef, $mds_id) = @_;
            push @$mds_list, $mds_id;
        },
    );

    return $mds_list;
}

sub get_cluster_mds_state {
    my ($rados) = @_;

    my $mds_state = {};

    if (!defined($rados)) {
        $rados = PVE::RADOS->new();
    }

    my $add_state = sub {
        my ($mds, $fsname) = @_;

        my $state = {};
        $state->{addr} = $mds->{addr};
        $state->{rank} = $mds->{rank};
        $state->{standby_replay} = $mds->{standby_replay} ? JSON::true : JSON::false;
        $state->{state} = $mds->{state};
        $state->{fs_name} = $fsname if defined($fsname);

        $mds_state->{ $mds->{name} } = $state;
    };

    my $mds_dump = $rados->mon_command({ prefix => 'mds stat' });
    my $fsmap = $mds_dump->{fsmap};

    foreach my $mds (@{ $fsmap->{standbys} }) {
        $add_state->($mds);
    }

    for my $fs_info (@{ $fsmap->{filesystems} }) {
        my $active_mds = $fs_info->{mdsmap}->{info};

        # normally there's only one active MDS, but we can have multiple active for
        # different ranks (e.g., different cephs path hierarchy). So just add all.
        foreach my $mds (values %$active_mds) {
            $add_state->($mds, $fs_info->{mdsmap}->{fs_name});
        }
    }

    return $mds_state;
}

sub is_mds_active {
    my ($rados, $fs_name) = @_;

    if (!defined($rados)) {
        $rados = PVE::RADOS->new();
    }

    my $mds_dump = $rados->mon_command({ prefix => 'mds stat' });
    my $fsmap = $mds_dump->{fsmap}->{filesystems};

    if (!($fsmap && scalar(@$fsmap) > 0)) {
        return undef;
    }
    for my $fs (@$fsmap) {
        next if defined($fs_name) && $fs->{mdsmap}->{fs_name} ne $fs_name;

        my $active_mds = $fs->{mdsmap}->{info};
        for my $mds (values %$active_mds) {
            return 1 if $mds->{state} eq 'up:active';
        }
    }

    return 0;
}

sub create_mds {
    my ($id, $rados) = @_;

    # `ceph fs status` fails with numeric only ID.
    die "ID: $id, numeric only IDs are not supported\n"
        if $id =~ /^\d+$/;

    if (!defined($rados)) {
        $rados = PVE::RADOS->new();
    }

    my $ccname = PVE::Ceph::Tools::get_config('ccname');
    my $service_dir = "/var/lib/ceph/mds/$ccname-$id";
    my $service_keyring = "$service_dir/keyring";
    my $service_name = "mds.$id";

    die "ceph MDS directory '$service_dir' already exists\n"
        if -d $service_dir;

    print "creating MDS directory '$service_dir'\n";
    eval { File::Path::mkpath($service_dir) };
    my $err = $@;
    die "creation MDS directory '$service_dir' failed\n" if $err;

    # http://docs.ceph.com/docs/luminous/install/manual-deployment/#adding-mds
    my $priv = [
        mon => 'allow profile mds',
        osd => 'allow rwx',
        mds => 'allow *',
    ];

    print "creating keys for '$service_name'\n";
    my $output = $rados->mon_command({
        prefix => 'auth get-or-create',
        entity => $service_name,
        caps => $priv,
        format => 'plain',
    });

    PVE::Tools::file_set_contents($service_keyring, $output);

    print "setting ceph as owner for service directory\n";
    run_command(["chown", 'ceph:ceph', '-R', $service_dir]);

    print "enabling service 'ceph-mds\@$id.service'\n";
    ceph_service_cmd('enable', $service_name);
    print "starting service 'ceph-mds\@$id.service'\n";
    ceph_service_cmd('start', $service_name);

    broadcast_ceph_services();

    return undef;
}

sub destroy_mds {
    my ($id, $rados) = @_;

    if (!defined($rados)) {
        $rados = PVE::RADOS->new();
    }

    my $ccname = PVE::Ceph::Tools::get_config('ccname');

    my $service_name = "mds.$id";
    my $service_dir = "/var/lib/ceph/mds/$ccname-$id";

    print "disabling service 'ceph-mds\@$id.service'\n";
    ceph_service_cmd('disable', $service_name);
    print "stopping service 'ceph-mds\@$id.service'\n";
    ceph_service_cmd('stop', $service_name);

    if (-d $service_dir) {
        print "removing ceph-mds directory '$service_dir'\n";
        File::Path::remove_tree($service_dir);
    } else {
        warn "cannot cleanup MDS $id directory, '$service_dir' not found\n";
    }

    print "removing ceph auth for '$service_name'\n";
    $rados->mon_command({
        prefix => 'auth del',
        entity => $service_name,
        format => 'plain',
    });

    broadcast_ceph_services();

    return undef;
}

# MGR

sub create_mgr {
    my ($id, $rados) = @_;

    my $clustername = PVE::Ceph::Tools::get_config('ccname');
    my $mgrdir = "/var/lib/ceph/mgr/$clustername-$id";
    my $mgrkeyring = "$mgrdir/keyring";
    my $mgrname = "mgr.$id";

    die "ceph manager directory '$mgrdir' already exists\n" if -d $mgrdir;

    print "creating manager directory '$mgrdir'\n";
    mkdir $mgrdir;
    print "creating keys for '$mgrname'\n";
    my $output = $rados->mon_command({
        prefix => 'auth get-or-create',
        entity => $mgrname,
        caps => [
            mon => 'allow profile mgr',
            osd => 'allow *',
            mds => 'allow *',
        ],
        format => 'plain',
    });
    PVE::Tools::file_set_contents($mgrkeyring, $output);

    print "setting owner for directory\n";
    run_command(["chown", 'ceph:ceph', '-R', $mgrdir]);

    print "enabling service 'ceph-mgr\@$id.service'\n";
    ceph_service_cmd('enable', $mgrname);
    print "starting service 'ceph-mgr\@$id.service'\n";
    ceph_service_cmd('start', $mgrname);

    broadcast_ceph_services();

    return undef;
}

sub destroy_mgr {
    my ($mgrid, $rados) = @_;

    my $clustername = PVE::Ceph::Tools::get_config('ccname');
    my $mgrname = "mgr.$mgrid";
    my $mgrdir = "/var/lib/ceph/mgr/$clustername-$mgrid";

    die "ceph manager directory '$mgrdir' not found\n"
        if !-d $mgrdir;

    print "disabling service 'ceph-mgr\@$mgrid.service'\n";
    ceph_service_cmd('disable', $mgrname);
    print "stopping service 'ceph-mgr\@$mgrid.service'\n";
    ceph_service_cmd('stop', $mgrname);

    print "removing manager directory '$mgrdir'\n";
    File::Path::remove_tree($mgrdir);

    print "removing authkeys for $mgrname\n";
    if (!$rados) {
        $rados = PVE::RADOS->new();
    }

    $rados->mon_command({ prefix => 'auth del', entity => "$mgrname" });

    broadcast_ceph_services();

    return undef;
}

# Returns an arrayref of 'osd.<id>' daemon strings (suitable for ceph_service_cmd) for
# all OSDs on the local node. Source is the local systemd / /var/lib/ceph view via
# get_local_services(), so the caller must run on the target node (typically via
# proxyto => 'node'). $rados and $nodename are accepted for API symmetry with the
# pre-existing per-type helpers and are unused for the OSD path. Only OSDs are
# supported: cluster-wide MON/MGR/MDS enumeration goes through get_services_info
# directly in the cluster endpoint.
sub get_node_daemons {
    my ($rados, $type, $nodename) = @_;

    die "get_node_daemons only supports type 'osd', got '$type'\n" if $type ne 'osd';

    my $local_services = get_local_services();
    my $osd_services = $local_services->{osd} // {};

    # Require both a numeric id and an enabled systemd unit; data dirs without a
    # corresponding unit are not restartable via 'systemctl restart ceph-osd@N'.
    my @ids = grep { /^[0-9]+$/ && $osd_services->{$_}->{service} } keys %$osd_services;
    return [map { "osd.$_" } sort { $a <=> $b } @ids];
}

# Returns the locally-installed ceph-<daemon_type> binary version, parsed from its --version
# output. Captures the "<X.Y.Z[-suffix]> (<commit>)" tuple so a same-version rebuild with a
# different commit still counts as outdated. Returns undef if the binary is missing or
# unparseable.
sub get_local_ceph_binary_version {
    my ($daemon_type) = @_;
    $daemon_type //= 'osd';
    my $bin = "/usr/bin/ceph-$daemon_type";
    return undef if !-x $bin;

    my $out = '';
    eval {
        run_command([$bin, '--version'],
            outfunc => sub { $out .= "$_[0]\n" if !length($out); });
    };
    return undef if $@;

    return $1 if $out =~ /^ceph version (\S+ \([0-9a-f]+\))/;
    return $1 if $out =~ /^ceph version (\S+)/;
    return undef;
}

# Filter <type>.<id> daemons to those whose running version != $local_version. Looks up running
# versions via '<type> metadata'. Daemons absent from metadata are kept (unknown != installed
# is safer than silently skipping). Dies on metadata fetch failure.
sub filter_outdated_daemons {
    my ($rados, $daemon_type, $daemons, $local_version) = @_;
    die "filter_outdated_daemons: local_version required\n" if !defined($local_version);

    my $metadata =
        eval { $rados->mon_command({ prefix => "$daemon_type metadata", format => 'json' }) };
    die "could not fetch '$daemon_type metadata' for outdated filter: $@\n" if $@;
    die "could not fetch '$daemon_type metadata': unexpected response shape\n"
        if ref($metadata) ne 'ARRAY';

    my %running_ver;
    for my $m (@$metadata) {
        my $id = $m->{id} // $m->{name};
        next if !defined($id);
        my $ver = $m->{ceph_version} // '';
        if ($ver =~ /^ceph version (\S+ \([0-9a-f]+\))/) {
            $running_ver{$id} = $1;
        } elsif ($ver =~ /^ceph version (\S+)/) {
            $running_ver{$id} = $1;
        }
    }

    my @outdated;
    for my $daemon (@$daemons) {
        my $id = $daemon =~ s/^\Q$daemon_type\E\.//r;
        # OSD metadata indexes by integer, MON/MGR/MDS by string; try both.
        my $rv = $running_ver{$id} // ($id =~ /^[0-9]+$/ ? $running_ver{ int($id) } : undef);
        push @outdated, $daemon if !defined($rv) || $rv ne $local_version;
    }
    return \@outdated;
}

# Health checks that are safe to ignore on bulk-restart entry: things that do
# not materially affect rolling-restart safety (the per-step ok-to-stop is still
# the authoritative gate).
my %BENIGN_HEALTH_CHECKS = map { $_ => 1 } qw(
    MON_CLOCK_SKEW
    RECENT_CRASH
    TELEMETRY_CHANGED
    AUTH_INSECURE_GLOBAL_ID_RECLAIM_ALLOWED
    AUTH_INSECURE_GLOBAL_ID_RECLAIM
    BLUESTORE_DISK_SIZE_MISMATCH
    BLUESTORE_SLOW_OP_ALERT
    PG_NOT_SCRUBBED
    PG_NOT_DEEP_SCRUBBED
    LARGE_OMAP_OBJECTS
);

# OSDMAP_FLAGS check is acceptable only if every cluster-wide OSD flag that
# is set comes from this allowlist. The first group is operator-relevant but
# rolling-restart-safe (or actively wanted, in noout's case); the second is
# always-on internal Ceph format flags that ceph reports under 'flags' but
# never count as a real WARN to a human operator.
my %BENIGN_OSDMAP_FLAGS = map { $_ => 1 } qw(
    noout
    noscrub
    nodeep-scrub
    notieragent
    sortbitwise
    recovery_deletes
    purged_snapdirs
    pglog_hardlimit
);

# Returns ($acceptable, $severity, \@blocker_messages).
# - HEALTH_OK            -> (1, 'HEALTH_OK', [])
# - HEALTH_WARN, only benign checks firing -> (1, 'HEALTH_WARN', [])
# - HEALTH_WARN with one or more non-benign checks -> ($force_warn?1:0, 'HEALTH_WARN', \@blockers)
# - HEALTH_ERR -> (0, 'HEALTH_ERR', \@blockers)  (force does NOT override)
#
# $force_warn relaxes only the HEALTH_WARN path; HEALTH_ERR is always fatal.
# Callers can still emit a warning when proceeding past blockers with force=1.
sub check_health_acceptable {
    my ($rados, $force_warn) = @_;

    my $health = eval { $rados->mon_command({ prefix => 'health' }) };
    return (0, 'HEALTH_FETCH_FAIL', ["could not get ceph health: " . ($@ // 'no data')])
        if $@ || !$health;

    my $status = $health->{status} // '';
    return (1, $status, []) if $status eq 'HEALTH_OK';

    my @blockers;
    my $checks = $health->{checks} // {};

    # Lazy: only fetch osd dump if an OSDMAP_FLAGS check is actually firing. A failed
    # fetch is treated as a blocker rather than silently letting OSDMAP_FLAGS through
    # the allowlist, since we cannot tell whether the set flags are benign.
    my $cluster_flags;
    my $cluster_flags_err;
    my $get_cluster_flags = sub {
        return $cluster_flags if defined $cluster_flags;
        my $dump = eval { $rados->mon_command({ prefix => 'osd dump', format => 'json' }) };
        if ($@ || ref($dump) ne 'HASH') {
            $cluster_flags_err = $@ ? "$@" : 'unexpected response shape';
            chomp $cluster_flags_err;
            $cluster_flags = {};
            return $cluster_flags;
        }
        $cluster_flags = { map { $_ => 1 } split(/,/, $dump->{flags} // '') };
        return $cluster_flags;
    };

    for my $name (sort keys %$checks) {
        next if $BENIGN_HEALTH_CHECKS{$name};

        if ($name eq 'OSDMAP_FLAGS') {
            my $flags = $get_cluster_flags->();
            if ($cluster_flags_err) {
                push @blockers,
                    "OSDMAP_FLAGS: could not fetch cluster flags to evaluate"
                    . " allowlist: $cluster_flags_err";
                next;
            }
            my @bad = grep { !$BENIGN_OSDMAP_FLAGS{$_} } sort keys %$flags;
            next if !@bad;
            push @blockers,
                "OSDMAP_FLAGS: cluster-wide flag(s) interfering with rolling"
                . " restart: "
                . join(', ', @bad);
            next;
        }

        my $msg = $checks->{$name}->{summary}->{message} // 'no message';
        push @blockers, "$name: $msg";
    }

    return (0, 'HEALTH_ERR', \@blockers) if $status eq 'HEALTH_ERR';

    # HEALTH_WARN
    return (1, $status, []) if !@blockers;
    return ($force_warn ? 1 : 0, $status, \@blockers);
}

# Wraps Ceph's '$type ok-to-stop' mon command and returns ($safe, $message).
# Ceph has no 'mgr ok-to-stop' so we fall back to a standby-count check.
# Retries cover both mid-restart RPC transport failures and 'not safe' responses
# while the previous daemon's recovery still settles.
my $OK_TO_STOP_RETRIES = 4;
my $OK_TO_STOP_RETRY_SLEEP = 15;

sub is_safe_to_stop {
    my ($rados, $type, $id) = @_;

    if ($type eq 'mgr') {
        my $tries = $OK_TO_STOP_RETRIES;
        my $last_err = '';
        while ($tries > 0) {
            my $dump =
                eval { $rados->mon_command({ prefix => 'mgr dump', format => 'json' }) };
            if (my $err = $@) {
                chomp $err;
                $last_err = $err;
                $tries--;
                sleep($OK_TO_STOP_RETRY_SLEEP) if $tries > 0;
                next;
            }
            return (0, "'mgr dump' returned an unexpected response shape")
                if ref($dump) ne 'HASH';

            my $standbys = $dump->{standbys} // [];
            my $standby_count = ref($standbys) eq 'ARRAY' ? scalar(@$standbys) : 0;
            my $is_active = ($dump->{active_name} // '') eq $id;

            if ($is_active) {
                return (0, "no standby mgr available for failover, would cause mgr outage")
                    if $standby_count == 0;
                return (
                    1,
                    "active mgr restart will trigger failover"
                        . " ($standby_count standby available)",
                );
            }
            return (1, "standby mgr restart, no failover");
        }
        return (
            0, "could not query 'mgr dump' after $OK_TO_STOP_RETRIES attempts: $last_err",
        );
    }

    my $params = {
        prefix => "$type ok-to-stop",
        format => 'plain',
        ids => [$id],
    };

    my $tries = $OK_TO_STOP_RETRIES;
    my $last_msg = '';
    while ($tries > 0) {
        my $result = eval { $rados->mon_cmd($params, 1) };
        if (my $err = $@) {
            chomp $err;
            $last_msg = "transport error: $err";
        } elsif (($result->{return_code} // -1) == 0) {
            return (1, $result->{status_message} // 'safe');
        } else {
            $last_msg = $result->{status_message} // 'not safe';
        }
        $tries--;
        sleep($OK_TO_STOP_RETRY_SLEEP) if $tries > 0;
    }
    return (
        0,
        "'$type ok-to-stop' for '$id' did not pass after $OK_TO_STOP_RETRIES attempts: "
            . $last_msg,
    );
}

# Issues a mon_command and returns the response if it's a HASH, otherwise
# undef. Swallows transient transport failures during the post-restart wait
# phase: if the mon is briefly unreachable (e.g. mid-election after we just
# restarted one of its peers), the caller treats undef as "not yet up" and
# the poll loop in wait_for_daemon_up retries on the next tick.
my sub _safe_mon_hash {
    my ($rados, $cmd) = @_;
    my $result = eval { $rados->mon_command($cmd); };
    return undef if $@ || ref($result) ne 'HASH';
    return $result;
}

# Per-type "is this daemon back up" check. PG-level recovery is deliberately NOT polled:
# the next iteration's 'ok-to-stop' gate covers it, and a prior 'pg ls-by-osd' approach
# could hang the mon dispatch queue while the target OSD was mid-restart.
sub daemon_is_up {
    my ($rados, $type, $id) = @_;

    if ($type eq 'osd') {
        my $dump = _safe_mon_hash($rados, { prefix => 'osd dump', format => 'json' })
            or return 0;
        for my $osd (@{ $dump->{osds} // [] }) {
            return $osd->{up} ? 1 : 0 if "$osd->{osd}" eq "$id";
        }
        return 0;
    } elsif ($type eq 'mon') {
        my $qs = _safe_mon_hash($rados, { prefix => 'quorum_status' }) or return 0;
        return scalar(grep { $_ eq $id } @{ $qs->{quorum_names} // [] }) ? 1 : 0;
    } elsif ($type eq 'mgr') {
        my $dump = _safe_mon_hash($rados, { prefix => 'mgr dump', format => 'json' })
            or return 0;
        return 0 if !$dump->{available};
        return 1 if ($dump->{active_name} // '') eq $id;
        for my $standby (@{ $dump->{standbys} // [] }) {
            return 1 if ($standby->{name} // '') eq $id;
        }
        return 0;
    } elsif ($type eq 'mds') {
        my $dump = _safe_mon_hash($rados, { prefix => 'fs dump', format => 'json' })
            or return 0;
        for my $standby (@{ $dump->{standbys} // [] }) {
            return 1 if ($standby->{name} // '') eq $id;
        }
        for my $fs (@{ $dump->{filesystems} // [] }) {
            for my $info (values %{ $fs->{mdsmap}->{info} // {} }) {
                next if ($info->{name} // '') ne $id;
                # Accept any up:* state, not just up:active. standby_replay
                # MDSes live in mdsmap.info (not the standbys array) with
                # state up:standby-replay and would otherwise time out.
                return ($info->{state} // '') =~ /^up:/ ? 1 : 0;
            }
        }
        return 0;
    }
    die "unknown daemon type '$type'\n";
}

sub wait_for_daemon_up {
    my ($rados, $type, $id, $timeout) = @_;

    $timeout //= 600;
    my $poll = 2;
    my $deadline = time() + $timeout;
    my $is_up = 0;
    while (time() < $deadline) {
        if (daemon_is_up($rados, $type, $id)) {
            $is_up = 1;
            last;
        }
        sleep($poll);
    }
    die "daemon '$type.$id' did not come up within $timeout seconds\n" if !$is_up;

    # MON-specific settle: paxos can briefly report rejoined-but-not-yet-stable. Defensive
    # heuristic: require quorum membership across two consecutive successful polls separated
    # by a few seconds. Shares the caller's $deadline so the total wait never exceeds the
    # caller's $timeout - settle is opportunistic, taking whatever time is left.
    if ($type eq 'mon') {
        my $settle = 5;
        my $required_consecutive = 2;
        my $consecutive_ok = 1; # the loop above already saw one successful poll
        while (time() < $deadline && $consecutive_ok < $required_consecutive) {
            sleep($settle);
            if (daemon_is_up($rados, $type, $id)) {
                $consecutive_ok++;
            } else {
                $consecutive_ok = 0;
            }
        }
        warn "mon '$id' quorum membership did not stabilize before timeout,"
            . " continuing anyway\n"
            if $consecutive_ok < $required_consecutive;
    }
}

# Polls '<type> ok-to-stop' on $sample_id until safe or $timeout elapses. Used by the cluster
# orchestrator between nodes to absorb the recovery time from the previous node's restart, so
# the next per-node sub-task starts on a stabilized cluster. Returns (1, msg) or (0, msg).
sub wait_for_safe_to_stop {
    my ($rados, $type, $sample_id, $timeout) = @_;
    $timeout //= 600;
    my $deadline = time() + $timeout;
    my $poll = 10;
    my $last_msg = '';
    while (time() < $deadline) {
        my ($safe, $msg) = is_safe_to_stop($rados, $type, $sample_id);
        return (1, $msg) if $safe;
        $last_msg = $msg // '';
        last if time() + $poll >= $deadline;
        sleep($poll);
    }
    return (
        0,
        "recovery did not allow safe restart of '$type.$sample_id' within"
            . " ${timeout}s: $last_msg",
    );
}

# Sets per-OSD 'noout' on $osd_ids for the duration of $code, unsetting it again on
# completion, error, or SIGTERM/INT/HUP (e.g. 'pvesh task stop'). Per-OSD scope avoids
# blocking the mon_osd_down_out_interval countdown for unrelated OSDs that fail on
# other nodes during the restart window, and leaves any operator-set cluster-wide
# noout untouched. $we_set_it is recorded BEFORE the mon_command to guarantee a
# best-effort unset on signal or set-failure; spurious unsets are no-ops on Ceph.
sub with_noout {
    my ($rados, $osd_ids, $code) = @_;

    return $code->() if !$osd_ids || !@$osd_ids;

    my $we_set_it = 0;
    my $cleanup_done = 0;
    my $cleanup = sub {
        return if $cleanup_done;
        $cleanup_done = 1;
        return if !$we_set_it;
        print "unsetting 'noout' flag on " . scalar(@$osd_ids) . " OSDs\n";
        eval {
            $rados->mon_command({
                prefix => 'osd unset-group',
                flags => 'noout',
                who => $osd_ids,
            });
        };
        if (my $err = $@) {
            chomp $err;
            warn "failed to unset 'noout' flag: $err\n";
        }
    };

    local $SIG{TERM} = sub { $cleanup->(); die "received SIGTERM, aborting bulk-restart\n"; };
    local $SIG{INT} = sub { $cleanup->(); die "received SIGINT, aborting bulk-restart\n"; };
    local $SIG{HUP} = sub { $cleanup->(); die "received SIGHUP, aborting bulk-restart\n"; };

    eval {
        print "setting 'noout' flag on " . scalar(@$osd_ids) . " OSDs\n";
        $we_set_it = 1; # set BEFORE mon_command to close the signal/failure race
        $rados->mon_command({
            prefix => 'osd set-group',
            flags => 'noout',
            who => $osd_ids,
        });
        $code->();
    };
    my $err = $@;

    $cleanup->();

    die $err if $err;
}

# Per-node file lock to serialize bulk-restart workers. Uses lock_file_full with a 5s
# acquisition timeout - concurrent invocations block briefly then fail. The lock is
# per-node only; cluster-wide protection against two operators on different nodes is
# not possible without a heavier mechanism (cfs_lock_file is unsuitable - it's not
# designed for hour-long critical sections and runs $code under a 60s alarm).
#
# lock_file_full sets $@ and returns undef on either lock-acquisition failure
# (prefixed "can't lock file '$lockfile'") or $code death (raw die message).
# We anchor the regex to the lock-fail prefix so a worker error containing the
# substring "can't lock file" doesn't get misclassified as a lock collision.
sub with_bulk_restart_lock {
    my ($code) = @_;
    my $lockfile = '/var/lock/pve-ceph-bulk-restart.lck';
    lock_file_full($lockfile, 5, 0, $code);
    if (my $err = $@) {
        die "another Ceph bulk-restart is already in progress on this node\n"
            if $err =~ /^can't lock file '\Q$lockfile\E'/;
        die $err;
    }
}

# Cluster-wide soft lock for bulk-restart orchestrators that touch shared Ceph state.
# Read-then-set under 'pve/ceph-bulk-restart/lock/<scope>' is racy (config-key has no
# set-if-not-exists) but combined with the per-node file lock - and, for MON/MGR/MDS
# sub-tasks, the remote node's srvrestart worker-queue serialization - it covers the
# realistic operator-error case of two concurrent restarts losing MON quorum. Stale
# entries auto-expire so a crashed orchestrator does not lock operators out forever.
my $CLUSTER_LOCK_KEY_PREFIX = 'pve/ceph-bulk-restart/lock/';
my $CLUSTER_LOCK_STALE_AFTER = 4 * 60 * 60; # 4h

sub cluster_lock_key {
    my ($scope) = @_;
    return "${CLUSTER_LOCK_KEY_PREFIX}${scope}";
}

sub acquire_cluster_bulk_restart_lock {
    my ($rados, $scope, $upid) = @_;
    my $key = cluster_lock_key($scope);

    my $existing =
        eval { $rados->mon_cmd({ prefix => 'config-key get', key => $key, format => 'plain' }, 1); };
    if (!$@ && $existing && ($existing->{return_code} // -1) == 0) {
        my $info = eval { decode_json($existing->{data} // '') };
        if ($info && ref($info) eq 'HASH') {
            my $age = time() - ($info->{timestamp} // 0);
            if ($age < $CLUSTER_LOCK_STALE_AFTER) {
                die "another cluster-wide Ceph '$scope' bulk-restart is in progress"
                    . " (upid '$info->{upid}' on host '$info->{host}', started ${age}s ago)\n";
            }
            warn "discarding stale cluster bulk-restart lock entry for '$scope'"
                . " (${age}s old, was upid '$info->{upid}' on host '$info->{host}')\n";
        }
    }

    $rados->mon_command({
        prefix => 'config-key set',
        key => $key,
        val => encode_json({
            upid => $upid,
            host => PVE::INotify::nodename(),
            timestamp => time(),
        }),
    });
}

sub release_cluster_bulk_restart_lock {
    my ($rados, $scope, $upid) = @_;
    my $key = cluster_lock_key($scope);

    # Only remove the entry if it is still ours. A run that overran the stale
    # window may have had its lock taken over by another orchestrator in the
    # meantime; we must not delete that one's lock out from under it. This read
    # is still racy against a concurrent takeover (config-key has no
    # compare-and-swap), but it closes the realistic "delete the new owner's
    # lock" window without changing the lock's soft-advisory nature.
    if (defined($upid)) {
        my $existing = eval {
            $rados->mon_cmd({ prefix => 'config-key get', key => $key, format => 'plain' }, 1);
        };
        if (!$@ && $existing && ($existing->{return_code} // -1) == 0) {
            my $info = eval { decode_json($existing->{data} // '') };
            if ($info && ref($info) eq 'HASH' && ($info->{upid} // '') ne $upid) {
                warn "not releasing cluster bulk-restart lock for '$scope': now held by"
                    . " a different run (upid '" . ($info->{upid} // '?') . "')\n";
                return;
            }
        }
    }

    eval { $rados->mon_command({ prefix => 'config-key rm', key => $key }); };
    warn "failed to release cluster bulk-restart lock for '$scope': $@" if $@;
}

# Convenience: acquire, run $code, release (even on die).
sub with_cluster_bulk_restart_lock {
    my ($rados, $scope, $upid, $code) = @_;
    acquire_cluster_bulk_restart_lock($rados, $scope, $upid);
    my $wantarray = wantarray;
    my @result = eval { $wantarray ? ($code->()) : scalar($code->()); };
    my $err = $@;
    release_cluster_bulk_restart_lock($rados, $scope, $upid);
    die $err if $err;
    return $wantarray ? @result : $result[0];
}

# Small PVE::RADOS wrapper that recreates the underlying connection on a
# detected dead-connection failure (EBADF / closed filehandle / write data
# failed) and retries the call once. PVE::RADOS' internal $sendcmd tears the
# socketpair down and SIGKILLs the librados subprocess on any timeout (default
# 5s, configurable via timeout => N) or transport error, after which every
# subsequent mon_command on the same handle fails forever. Long-running
# bulk-restart workers (minutes to hours) cannot survive that without
# transparent reconnect.
#
# Bulk-restart workers and helpers in this series use this wrapper instead of
# bare PVE::RADOS so a single transient mon-command failure during a peering
# storm or mon election does not strand the entire run.
package PVE::Ceph::Services::ResilientRados {
    use strict;
    use warnings;

    sub new {
        my ($class, %opts) = @_;
        my $self = {
            opts => \%opts,
            rados => PVE::RADOS->new(%opts),
        };
        return bless $self, $class;
    }

    my sub _is_dead_connection_error {
        my ($err) = @_;
        my $msg = ref($err) ? ($err->{msg} // "$err") : "$err";
        return $msg =~ /Bad file descriptor|closed filehandle|write data failed/i;
    }

    sub _call_with_reconnect {
        my ($self, $method, @args) = @_;
        # Suppress PVE::RADOS' own "syswrite() on closed filehandle" warning from
        # writedata: it's a misleading Perl-level artifact of the FH having been
        # closed by PVE::RADOS::kill_worker (which is exactly what we're about to
        # recover from). Other warnings pass through.
        my $result = eval {
            local $SIG{__WARN__} = sub {
                my ($msg) = @_;
                return if $msg =~ m{syswrite\(\) on closed filehandle.*PVE/RADOS\.pm};
                warn $msg;
            };
            $self->{rados}->$method(@args);
        };
        if (my $err = $@) {
            die $err if !_is_dead_connection_error($err);
            warn "RADOS connection lost during '$method', reconnecting: $err";
            $self->{rados} = PVE::RADOS->new(%{ $self->{opts} });
            return $self->{rados}->$method(@args); # rethrow if still failing
        }
        return $result;
    }

    # Only mon_command and mon_cmd are proxied because that is all the bulk-restart
    # code uses. If a future caller hands a wrapped instance to code expecting other
    # PVE::RADOS methods (cluster_stat, pool ops, ...) it will fail; add the proxy
    # method here when that need arises rather than auto-delegating, so reconnect
    # semantics stay explicit.
    sub mon_command { my $self = shift; return $self->_call_with_reconnect('mon_command', @_); }
    sub mon_cmd { my $self = shift; return $self->_call_with_reconnect('mon_cmd', @_); }
}

1;
