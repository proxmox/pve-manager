package PVE::API2::Ceph;

use strict;
use warnings;

use File::Path;
use JSON;
use Net::IP;
use UUID;

use PVE::Ceph::Tools;
use PVE::Ceph::Services;
use PVE::Cluster qw(cfs_read_file cfs_write_file);
use PVE::JSONSchema qw(get_standard_option);
use PVE::Network;
use PVE::RADOS;
use PVE::RESTHandler;
use PVE::RPCEnvironment;
use PVE::Storage;
use PVE::Tools qw(run_command file_get_contents file_set_contents extract_param);

use PVE::API2::Ceph::Cfg;
use PVE::API2::Ceph::OSD;
use PVE::API2::Ceph::FS;
use PVE::API2::Ceph::MDS;
use PVE::API2::Ceph::MGR;
use PVE::API2::Ceph::MON;
use PVE::API2::Ceph::Pool;
use PVE::API2::Storage::Config;

use base qw(PVE::RESTHandler);

my $pve_osd_default_journal_size = 1024 * 5;

__PACKAGE__->register_method({
    subclass => "PVE::API2::Ceph::Cfg",
    path => 'cfg',
});

__PACKAGE__->register_method({
    subclass => "PVE::API2::Ceph::OSD",
    path => 'osd',
});

__PACKAGE__->register_method({
    subclass => "PVE::API2::Ceph::MDS",
    path => 'mds',
});

__PACKAGE__->register_method({
    subclass => "PVE::API2::Ceph::MGR",
    path => 'mgr',
});

__PACKAGE__->register_method({
    subclass => "PVE::API2::Ceph::MON",
    path => 'mon',
});

__PACKAGE__->register_method({
    subclass => "PVE::API2::Ceph::FS",
    path => 'fs',
});

__PACKAGE__->register_method({
    subclass => "PVE::API2::Ceph::Pool",
    path => 'pool',
});

__PACKAGE__->register_method({
    name => 'index',
    path => '',
    method => 'GET',
    description => "Directory index.",
    permissions => {
        check => ['perm', '/', ['Sys.Audit', 'Datastore.Audit'], any => 1],
    },
    parameters => {
        additionalProperties => 0,
        properties => {
            node => get_standard_option('pve-node'),
        },
    },
    returns => {
        type => 'array',
        items => {
            type => "object",
            properties => {},
        },
        links => [{ rel => 'child', href => "{name}" }],
    },
    code => sub {
        my ($param) = @_;

        my $result = [
            { name => 'cmd-safety' },
            { name => 'cfg' },
            { name => 'crush' },
            { name => 'fs' },
            { name => 'init' },
            { name => 'log' },
            { name => 'mds' },
            { name => 'mgr' },
            { name => 'mon' },
            { name => 'osd' },
            { name => 'pool' },
            { name => 'restart' },
            { name => 'restart-bulk' },
            { name => 'rules' },
            { name => 'start' },
            { name => 'status' },
            { name => 'stop' },
        ];

        return $result;
    },
});

__PACKAGE__->register_method({
    name => 'init',
    path => 'init',
    method => 'POST',
    description => "Create the initial Ceph default configuration and set up symlinks."
        . " Idempotent on re-call: if a [global] section already exists in"
        . " ceph.conf, the existing fsid / auth / pool defaults are"
        . " preserved and most parameters are silently ignored.",
    proxyto => 'node',
    protected => 1,
    permissions => {
        check => ['perm', '/', ['Sys.Modify']],
    },
    parameters => {
        additionalProperties => 0,
        properties => {
            node => get_standard_option('pve-node'),
            network => {
                description => "Use specific network for all ceph related traffic",
                type => 'string',
                format => 'CIDR',
                optional => 1,
                maxLength => 128,
            },
            'cluster-network' => {
                description => "Declare a separate cluster network, OSDs will route"
                    . " heartbeat, object replication and recovery traffic over it",
                type => 'string',
                format => 'CIDR',
                requires => 'network',
                optional => 1,
                maxLength => 128,
            },
            size => {
                description => 'Targeted number of replicas per object',
                type => 'integer',
                default => 3,
                optional => 1,
                minimum => 1,
                maximum => 7,
            },
            min_size => {
                description => 'Minimum number of available replicas per object to allow I/O',
                type => 'integer',
                default => 2,
                optional => 1,
                minimum => 1,
                maximum => 7,
            },
            # TODO: deprecrated, remove with PVE 9
            pg_bits => {
                description => "Placement group bits, used to specify the "
                    . "default number of placement groups.\n\nDepreacted. This "
                    . "setting was deprecated in recent Ceph versions.",
                type => 'integer',
                default => 6,
                optional => 1,
                minimum => 6,
                maximum => 14,
            },
            disable_cephx => {
                description => "Disable cephx authentication.\n\n"
                    . "WARNING: cephx is a security feature protecting against "
                    . "man-in-the-middle attacks. Only consider disabling cephx "
                    . "if your network is private!",
                type => 'boolean',
                optional => 1,
                default => 0,
            },
        },
    },
    returns => { type => 'null' },
    code => sub {
        my ($param) = @_;

        my $version = PVE::Ceph::Tools::get_local_version(1);

        if (!$version || $version < 14) {
            die "Ceph Nautilus required - please run 'pveceph install'\n";
        } else {
            PVE::Ceph::Tools::check_ceph_installed('ceph_bin');
        }

        my $pve_ceph_cfgdir = PVE::Ceph::Tools::get_config('pve_ceph_cfgdir');
        if (!-d $pve_ceph_cfgdir) {
            File::Path::make_path($pve_ceph_cfgdir);
        }

        my $auth = $param->{disable_cephx} ? 'none' : 'cephx';

        # simply load old config if it already exists
        PVE::Cluster::cfs_lock_file(
            'ceph.conf',
            undef,
            sub {
                my $cfg = cfs_read_file('ceph.conf');

                if (!$cfg->{global}) {

                    my $fsid;
                    my $uuid;

                    UUID::generate($uuid);
                    UUID::unparse($uuid, $fsid);

                    $cfg->{global} = {
                        'fsid' => $fsid,
                        'auth_cluster_required' => $auth,
                        'auth_service_required' => $auth,
                        'auth_client_required' => $auth,
                        'osd_pool_default_size' => $param->{size} // 3,
                        'osd_pool_default_min_size' => $param->{min_size} // 2,
                        'mon_allow_pool_delete' => 'true',
                    };

                    # this does not work for default pools
                    #'osd pool default pg num' => $pg_num,
                    #'osd pool default pgp num' => $pg_num,
                }

                if ($auth eq 'cephx') {
                    $cfg->{client}->{keyring} = '/etc/pve/priv/$cluster.$name.keyring';
                }

                if ($param->{network}) {
                    $cfg->{global}->{'public_network'} = $param->{network};
                    $cfg->{global}->{'cluster_network'} = $param->{network};
                }

                if ($param->{'cluster-network'}) {
                    $cfg->{global}->{'cluster_network'} = $param->{'cluster-network'};
                }

                cfs_write_file('ceph.conf', $cfg);

                if ($auth eq 'cephx') {
                    PVE::Ceph::Tools::get_or_create_admin_keyring();
                }
                PVE::Ceph::Tools::setup_pve_symlinks();
            },
        );
        die $@ if $@;

        return undef;
    },
});

__PACKAGE__->register_method({
    name => 'stop',
    path => 'stop',
    method => 'POST',
    description => "Stop ceph services.",
    proxyto => 'node',
    protected => 1,
    permissions => {
        check => ['perm', '/', ['Sys.Modify']],
    },
    parameters => {
        additionalProperties => 0,
        properties => {
            node => get_standard_option('pve-node'),
            service => {
                description => 'Ceph service name.',
                type => 'string',
                optional => 1,
                default => 'ceph.target',
                pattern => '(ceph|mon|mds|osd|mgr)(\.'
                    . PVE::Ceph::Services::SERVICE_REGEX . ')?',
            },
        },
    },
    returns => { type => 'string' },
    code => sub {
        my ($param) = @_;

        my $rpcenv = PVE::RPCEnvironment::get();

        my $authuser = $rpcenv->get_user();

        PVE::Ceph::Tools::check_ceph_inited();

        my $cfg = cfs_read_file('ceph.conf');
        scalar(keys %$cfg) || die "no configuration\n";

        my $worker = sub {
            my $upid = shift;

            my $cmd = ['stop'];
            if ($param->{service}) {
                push @$cmd, $param->{service};
            }

            PVE::Ceph::Services::ceph_service_cmd(@$cmd);
        };

        return $rpcenv->fork_worker('srvstop', $param->{service} || 'ceph', $authuser, $worker);
    },
});

__PACKAGE__->register_method({
    name => 'start',
    path => 'start',
    method => 'POST',
    description => "Start ceph services.",
    proxyto => 'node',
    protected => 1,
    permissions => {
        check => ['perm', '/', ['Sys.Modify']],
    },
    parameters => {
        additionalProperties => 0,
        properties => {
            node => get_standard_option('pve-node'),
            service => {
                description => 'Ceph service name.',
                type => 'string',
                optional => 1,
                default => 'ceph.target',
                pattern => '(ceph|mon|mds|osd|mgr)(\.'
                    . PVE::Ceph::Services::SERVICE_REGEX . ')?',
            },
        },
    },
    returns => { type => 'string' },
    code => sub {
        my ($param) = @_;

        my $rpcenv = PVE::RPCEnvironment::get();

        my $authuser = $rpcenv->get_user();

        PVE::Ceph::Tools::check_ceph_inited();

        my $cfg = cfs_read_file('ceph.conf');
        scalar(keys %$cfg) || die "no configuration\n";

        my $worker = sub {
            my $upid = shift;

            my $cmd = ['start'];
            if ($param->{service}) {
                push @$cmd, $param->{service};
            }

            PVE::Ceph::Services::ceph_service_cmd(@$cmd);
        };

        return $rpcenv->fork_worker('srvstart', $param->{service} || 'ceph',
            $authuser, $worker);
    },
});

__PACKAGE__->register_method({
    name => 'restart',
    path => 'restart',
    method => 'POST',
    description => "Restart ceph services.",
    proxyto => 'node',
    protected => 1,
    permissions => {
        check => ['perm', '/', ['Sys.Modify']],
    },
    parameters => {
        additionalProperties => 0,
        properties => {
            node => get_standard_option('pve-node'),
            service => {
                description => 'Ceph service name.',
                type => 'string',
                optional => 1,
                default => 'ceph.target',
                pattern => '(ceph|mon|mds|osd|mgr)(\.'
                    . PVE::Ceph::Services::SERVICE_REGEX . ')?',
            },
        },
    },
    returns => { type => 'string' },
    code => sub {
        my ($param) = @_;

        my $rpcenv = PVE::RPCEnvironment::get();

        my $authuser = $rpcenv->get_user();

        PVE::Ceph::Tools::check_ceph_inited();

        my $cfg = cfs_read_file('ceph.conf');
        scalar(keys %$cfg) || die "no configuration\n";

        my $worker = sub {
            my $upid = shift;

            my $cmd = ['restart'];
            if ($param->{service}) {
                push @$cmd, $param->{service};
            }

            PVE::Ceph::Services::ceph_service_cmd(@$cmd);
        };

        return $rpcenv->fork_worker('srvrestart', $param->{service} || 'ceph',
            $authuser, $worker);
    },
});

__PACKAGE__->register_method({
    name => 'restart_bulk',
    path => 'restart-bulk',
    method => 'POST',
    description => "Rolling restart of all Ceph OSDs on this node. Each OSD is restarted only"
        . " after Ceph reports the previous one is back up and the next one is safe to stop."
        . " For non-OSD Ceph daemons, use the cluster-wide endpoint at /cluster/ceph/restart-bulk."
        . " The 'noout' flag is applied only to the OSDs targeted by this run, so unrelated OSDs"
        . " on other nodes that fail during the restart window still get out-marked normally."
        . " Aborting the resulting task (for example via 'pvesh task stop') triggers a SIGTERM"
        . " handler that unsets the per-OSD 'noout' if this endpoint set it.",
    proxyto => 'node',
    protected => 1,
    permissions => {
        check => ['perm', '/', ['Sys.Modify']],
    },
    parameters => {
        additionalProperties => 0,
        properties => {
            node => get_standard_option('pve-node'),
            'service-type' => {
                description => 'Ceph daemon type to restart. Only OSDs can be rolling-restarted'
                    . ' on a per-node basis.',
                type => 'string',
                enum => ['osd'],
            },
            'set-noout' => {
                description => "Set the 'noout' flag on each OSD targeted by this run for the"
                    . " duration of the rolling restart, and unset it on completion. Per-OSD"
                    . " rather than cluster-wide so that unrelated OSDs failing on other"
                    . " nodes still trigger backfill normally.",
                type => 'boolean',
                optional => 1,
                default => 1,
            },
            timeout => {
                description => "Per-OSD timeout (in seconds). Bounds both the wait for a"
                    . " restarted OSD to come back up and the wait for recovery to quiesce"
                    . " enough that Ceph reports the next OSD safe to stop. Default sized for"
                    . " busy clusters where multi-TB OSDs with many PGs can need several"
                    . " minutes to clear peering after a restart; bump higher for very large"
                    . " or heavily-loaded OSDs.",
                type => 'integer',
                minimum => 30,
                maximum => 1800,
                optional => 1,
                default => 600,
            },
            'dry-run' => {
                description => "Log the plan (which OSDs would be restarted, in what order)"
                    . " without actually doing anything.",
                type => 'boolean',
                optional => 1,
                default => 0,
            },
            force => {
                description => "Proceed past a HEALTH_WARN with non-benign checks like"
                    . " PG_DEGRADED, SLOW_OPS, or MON_DOWN. HEALTH_ERR is always fatal"
                    . " regardless. The operator is responsible for confirming the cluster is"
                    . " stable enough to absorb a rolling restart.",
                type => 'boolean',
                optional => 1,
                default => 0,
            },
            'only-outdated' => {
                description => "Restart only OSDs whose running version differs from the"
                    . " locally-installed ceph-osd binary. Useful for post-upgrade rolling"
                    . " restarts that should touch only daemons that need it. Refuses if the"
                    . " local binary version cannot be determined. Ignored on resume (the"
                    . " saved plan is used as-is).",
                type => 'boolean',
                optional => 1,
                default => 0,
            },
        },
    },
    returns => { type => 'string' },
    code => sub {
        my ($param) = @_;

        my $rpcenv = PVE::RPCEnvironment::get();
        my $authuser = $rpcenv->get_user();
        my $node = $param->{node};
        my $type = $param->{'service-type'};
        my $timeout = $param->{timeout} // 600;
        my $set_noout = $param->{'set-noout'} // 1;
        my $dry_run = $param->{'dry-run'} // 0;
        my $force = $param->{force} // 0;
        my $only_outdated = $param->{'only-outdated'} // 0;

        PVE::Ceph::Tools::check_ceph_inited();

        my $cfg = cfs_read_file('ceph.conf');
        scalar(keys %$cfg) || die "no ceph configuration\n";

        my $rados; # populated after fork
        my $worker = sub {
            my $upid = shift;

            # Use the ResilientRados wrapper for transparent reconnect on dead-connection
            # failures. A 60s mon-command timeout (rather than the 5s default) gives a
            # peering storm or mon election room to settle without tripping the internal
            # kill_worker path; the wrapper picks up whatever single-call failures still
            # slip through.
            $rados = PVE::Ceph::Services::ResilientRados->new(timeout => 60);

            # Entry health check: HEALTH_ERR always blocks. HEALTH_WARN blocks unless
            # every firing check is on a benign-for-rolling-restart allowlist, or the
            # caller passed force=1. Skipped on dry-run so operators can still inspect
            # a marginal cluster.
            if (!$dry_run) {
                my ($ok, $sev, $blockers) =
                    PVE::Ceph::Services::check_health_acceptable($rados, $force);
                if (!$ok) {
                    if ($sev eq 'HEALTH_ERR') {
                        die "Ceph cluster is in HEALTH_ERR state, refusing rolling restart"
                            . " of '$type' daemons:\n  - "
                            . join("\n  - ", @$blockers) . "\n";
                    }
                    die "Ceph cluster has blocking HEALTH_WARN issues, refusing rolling"
                        . " restart of '$type' daemons (pass force=1 to override):\n  - "
                        . join("\n  - ", @$blockers) . "\n";
                }
                if ($force && @$blockers) {
                    print "WARNING: proceeding past HEALTH_WARN blockers due to force=1:\n"
                        . "  - "
                        . join("\n  - ", @$blockers) . "\n";
                }
            }

            my $daemons = PVE::Ceph::Services::get_node_daemons($rados, $type, $node);

            my $original_count = scalar(@$daemons);
            my $filter_skipped = 0;
            if ($only_outdated && @$daemons) {
                my $local_ver = PVE::Ceph::Services::get_local_ceph_binary_version($type);
                die "could not determine local ceph-$type binary version, refusing"
                    . " only-outdated filter on node '$node'\n"
                    if !defined($local_ver);
                my $kept = {
                    map { $_ => 1 } @{
                        PVE::Ceph::Services::filter_outdated_daemons(
                            $rados, $type, $daemons, $local_ver,
                        ),
                    }
                };
                my @skipped = grep { !$kept->{$_} } @$daemons;
                $daemons = [grep { $kept->{$_} } @$daemons]; # preserve order
                $filter_skipped = scalar(@skipped);
                if ($filter_skipped > 0) {
                    print "only-outdated filter: skipping $filter_skipped of $original_count"
                        . " '$type' daemon(s) on '$node' already on version '$local_ver': "
                        . join(', ', @skipped) . "\n";
                    print "  $filter_skipped skipped, " . scalar(@$daemons) . " remain\n";
                }
            }

            my $total = scalar(@$daemons);
            if (!$total) {
                if ($only_outdated && $original_count > 0) {
                    print "all $original_count '$type' daemon(s) on '$node' already on the"
                        . " installed version, nothing to restart\n";
                } else {
                    print "no '$type' daemons found on node '$node', nothing to do\n";
                }
                return;
            }
            print($dry_run ? "[DRY-RUN] " : "");
            print "planned rolling restart order on '$node':\n";
            my $i = 0;
            for my $daemon (@$daemons) {
                $i++;
                print "  [$i/$total] $daemon\n";
            }
            if ($dry_run) {
                print "[DRY-RUN] no daemons were restarted\n";
                return;
            }

            PVE::Ceph::Services::with_bulk_restart_lock(sub {
                my $do_restarts = sub {
                    my $j = 0;
                    for my $daemon (@$daemons) {
                        $j++;
                        my $id = $daemon =~ s/^\Q$type\E\.//r;
                        my $tag = "[$j/$total]";

                        # Re-check cluster health every iteration so we abort if the cluster
                        # degrades to HEALTH_ERR partway through (e.g. an unrelated failure).
                        my $h = $rados->mon_command({ prefix => 'health' });
                        die "$tag Ceph cluster degraded to HEALTH_ERR mid-restart, aborting\n"
                            if $h && ($h->{status} // '') eq 'HEALTH_ERR';

                        # Wait (up to $timeout) for recovery from the previous OSD's restart
                        # to quiesce enough that Ceph reports this one safe to stop, bounded by
                        # the same per-OSD timeout as the up-wait. A busy cluster that needs
                        # minutes to clear peering is tolerated rather than aborted early.
                        my ($safe, $msg) =
                            PVE::Ceph::Services::wait_for_safe_to_stop($rados, $type, $id, $timeout);
                        die "$tag Ceph reports '$daemon' is not safe to stop: $msg\n" if !$safe;

                        print "$tag restarting $daemon\n";
                        PVE::Ceph::Services::ceph_service_cmd('restart', $daemon);

                        print "$tag waiting up to ${timeout}s for $daemon to come back up\n";
                        PVE::Ceph::Services::wait_for_daemon_up($rados, $type, $id, $timeout);
                        print "$tag $daemon is up\n";
                    }
                };

                if ($set_noout) {
                    PVE::Ceph::Services::with_noout($rados, $daemons, $do_restarts);
                } else {
                    $do_restarts->();
                }

                print "rolling restart of '$type' daemons on node '$node' finished\n";
            });
        };

        return $rpcenv->fork_worker('srvrestart', "$node-$type", $authuser, $worker);
    },
});

__PACKAGE__->register_method({
    name => 'status',
    path => 'status',
    method => 'GET',
    description => "Get the Ceph cluster status (raw 'ceph status' output). The response is"
        . " cluster-wide and identical to /cluster/ceph/status; this node-level alias exists"
        . " for operator convenience.",
    proxyto => 'node',
    protected => 1,
    permissions => {
        check => ['perm', '/', ['Sys.Audit', 'Datastore.Audit'], any => 1],
    },
    parameters => {
        additionalProperties => 0,
        properties => {
            node => get_standard_option('pve-node'),
        },
    },
    returns => { type => 'object' },
    code => sub {
        my ($param) = @_;

        PVE::Ceph::Tools::check_ceph_inited();

        return PVE::Ceph::Tools::ceph_cluster_status();
    },
});

__PACKAGE__->register_method({
    name => 'crush',
    path => 'crush',
    method => 'GET',
    description => "Get OSD crush map",
    proxyto => 'node',
    protected => 1,
    permissions => {
        check => ['perm', '/', ['Sys.Audit', 'Datastore.Audit'], any => 1],
    },
    parameters => {
        additionalProperties => 0,
        properties => {
            node => get_standard_option('pve-node'),
        },
    },
    returns => { type => 'string' },
    code => sub {
        my ($param) = @_;

        PVE::Ceph::Tools::check_ceph_inited();

        # this produces JSON (difficult to read for the user)
        # my $txt = &$run_ceph_cmd_text(['osd', 'crush', 'dump'], quiet => 1);

        my $txt = '';

        my $mapfile = "/var/tmp/ceph-crush.map.$$";
        my $mapdata = "/var/tmp/ceph-crush.txt.$$";

        my $rados = PVE::RADOS->new();

        eval {
            my $bindata =
                $rados->mon_command({ prefix => 'osd getcrushmap', format => 'plain' });
            file_set_contents($mapfile, $bindata);
            run_command(['crushtool', '-d', $mapfile, '-o', $mapdata]);
            $txt = file_get_contents($mapdata);
        };
        my $err = $@;

        unlink $mapfile;
        unlink $mapdata;

        die $err if $err;

        return $txt;
    },
});

__PACKAGE__->register_method({
    name => 'log',
    path => 'log',
    method => 'GET',
    description => "Read ceph log",
    proxyto => 'node',
    permissions => {
        check => ['perm', '/nodes/{node}', ['Sys.Syslog']],
    },
    protected => 1,
    parameters => {
        additionalProperties => 0,
        properties => {
            node => get_standard_option('pve-node'),
            start => {
                type => 'integer',
                minimum => 0,
                optional => 1,
                description => "Offset of the first log line to return (0-based).",
            },
            limit => {
                type => 'integer',
                minimum => 0,
                optional => 1,
                description => "Maximum number of log lines to return. Defaults to the"
                    . " dump_logfile limit (typically 50) when omitted.",
            },
        },
    },
    returns => {
        type => 'array',
        items => {
            type => "object",
            properties => {
                n => {
                    description => "Log-file line number (1-based).",
                    type => 'integer',
                },
                t => {
                    description => "Log line text.",
                    type => 'string',
                },
            },
        },
    },
    code => sub {
        my ($param) = @_;

        PVE::Ceph::Tools::check_ceph_inited();

        my $rpcenv = PVE::RPCEnvironment::get();
        my $user = $rpcenv->get_user();
        my $node = $param->{node};

        my $logfile = "/var/log/ceph/ceph.log";
        my ($count, $lines) =
            PVE::Tools::dump_logfile($logfile, $param->{start}, $param->{limit});

        $rpcenv->set_result_attrib('total', $count);

        return $lines;
    },
});

__PACKAGE__->register_method({
    name => 'rules',
    path => 'rules',
    method => 'GET',
    description => "List ceph rules.",
    proxyto => 'node',
    protected => 1,
    permissions => {
        check => ['perm', '/', ['Sys.Audit', 'Datastore.Audit'], any => 1],
    },
    parameters => {
        additionalProperties => 0,
        properties => {
            node => get_standard_option('pve-node'),
        },
    },
    returns => {
        type => 'array',
        items => {
            type => "object",
            properties => {
                name => {
                    description => "Name of the CRUSH rule.",
                    type => "string",
                },
            },
        },
        links => [{ rel => 'child', href => "{name}" }],
    },
    code => sub {
        my ($param) = @_;

        PVE::Ceph::Tools::check_ceph_inited();

        my $rados = PVE::RADOS->new();

        my $rules = $rados->mon_command({ prefix => 'osd crush rule ls' });

        my $res = [];

        foreach my $rule (@$rules) {
            push @$res, { name => $rule };
        }

        return $res;
    },
});

__PACKAGE__->register_method({
    name => 'cmd_safety',
    path => 'cmd-safety',
    method => 'GET',
    description => "Heuristical check if it is safe to perform an action.",
    proxyto => 'node',
    protected => 1,
    permissions => {
        check => ['perm', '/', ['Sys.Audit']],
    },
    parameters => {
        additionalProperties => 0,
        properties => {
            node => get_standard_option('pve-node'),
            service => {
                description => 'Service type',
                type => 'string',
                enum => ['osd', 'mon', 'mds'],
            },
            id => {
                description => 'ID of the service',
                type => 'string',
            },
            action => {
                description => 'Action to check',
                type => 'string',
                enum => ['stop', 'destroy'],
            },
        },
    },
    returns => {
        type => 'object',
        additionalProperties => 0,
        properties => {
            safe => {
                type => 'boolean',
                description => 'True if Ceph reports the requested action is safe.',
            },
            status => {
                type => 'string',
                optional => 1,
                description => "Human-readable status message from Ceph (typically the"
                    . " reason an action is not safe); absent when Ceph"
                    . " returned no message.",
            },
        },
    },
    code => sub {
        my ($param) = @_;

        PVE::Ceph::Tools::check_ceph_inited();

        my $id = $param->{id};
        my $service = $param->{service};
        my $action = $param->{action};

        my $rados = PVE::RADOS->new();

        my $supported_actions = {
            osd => {
                stop => 'ok-to-stop',
                destroy => 'safe-to-destroy',
            },
            mon => {
                stop => 'ok-to-stop',
                destroy => 'ok-to-rm',
            },
            mds => {
                stop => 'ok-to-stop',
            },
        };

        die "Service does not support this action: ${service}: ${action}\n"
            if !$supported_actions->{$service}->{$action};

        my $params = {
            prefix => "${service} $supported_actions->{$service}->{$action}",
            format => 'plain',
        };
        if ($service eq 'mon' && $action eq 'destroy') {
            $params->{id} = $id;
        } else {
            $params->{ids} = [$id];
        }

        my $raw = $rados->mon_cmd($params, 1);
        die $@ if $@;

        my $result = {
            safe => ($raw->{return_code} // -1) == 0 ? JSON::true : JSON::false,
        };
        $result->{status} = $raw->{status_message}
            if defined($raw->{status_message}) && length($raw->{status_message});

        return $result;
    },
});

1;
