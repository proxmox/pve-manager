package PVE::CLI::pve7to8;

use strict;
use warnings;

use Cwd ();

use PVE::API2::APT;
use PVE::API2::Ceph;
use PVE::API2::LXC;
use PVE::API2::Qemu;
use PVE::API2::Certificates;
use PVE::API2::Cluster::Ceph;

use PVE::AccessControl;
use PVE::Ceph::Tools;
use PVE::Cluster;
use PVE::Corosync;
use PVE::INotify;
use PVE::JSONSchema;
use PVE::NodeConfig;
use PVE::RPCEnvironment;
use PVE::Storage;
use PVE::Storage::Plugin;
use PVE::Tools qw(run_command split_list);
use PVE::QemuConfig;
use PVE::QemuServer;
use PVE::VZDump::Common;
use PVE::LXC;
use PVE::LXC::Config;
use PVE::LXC::Setup;

use Term::ANSIColor;

use PVE::CLIHandler;

use base qw(PVE::CLIHandler);

my $nodename = PVE::INotify::nodename();

sub setup_environment {
    PVE::RPCEnvironment->setup_default_cli_env();
}

my ($min_pve_major, $min_pve_minor, $min_pve_pkgrel) = (7, 4, 1);

my $ceph_release2code = {
    '12' => 'Luminous',
    '13' => 'Mimic',
    '14' => 'Nautilus',
    '15' => 'Octopus',
    '16' => 'Pacific',
    '17' => 'Quincy',
    '18' => 'Reef',
};
my $ceph_supported_release = 17; # the version we support for upgrading (i.e., available on both)
my $ceph_supported_code_name = $ceph_release2code->{"$ceph_supported_release"}
    or die "inconsistent source code, could not map expected ceph version to code name!";

my $forced_legacy_cgroup = 0;

my $counters = {
    pass => 0,
    skip => 0,
    warn => 0,
    fail => 0,
};

my $log_line = sub {
    my ($level, $line) = @_;

    $counters->{$level}++ if defined($level) && defined($counters->{$level});

    print uc($level), ': ' if defined($level);
    print "$line\n";
};

sub log_pass {
    print color('green');
    $log_line->('pass', @_);
    print color('reset');
}

sub log_info {
    $log_line->('info', @_);
}
sub log_skip {
    $log_line->('skip', @_);
}
sub log_warn {
    print color('yellow');
    $log_line->('warn', @_);
    print color('reset');
}
sub log_fail {
    print color('bold red');
    $log_line->('fail', @_);
    print color('reset');
}

my $print_header_first = 1;
sub print_header {
    my ($h) = @_;
    print "\n" if !$print_header_first;
    print "= $h =\n\n";
    $print_header_first = 0;
}

my $get_systemd_unit_state = sub {
    my ($unit, $surpress_stderr) = @_;

    my $state;
    my $filter_output = sub {
	$state = shift;
	chomp $state;
    };

    my %extra = (outfunc => $filter_output, noerr => 1);
    $extra{errfunc} = sub {  } if $surpress_stderr;

    eval {
	run_command(['systemctl', 'is-enabled', "$unit"], %extra);
	return if !defined($state);
	run_command(['systemctl', 'is-active', "$unit"], %extra);
    };

    return $state // 'unknown';
};
my $log_systemd_unit_state = sub {
    my ($unit, $no_fail_on_inactive) = @_;

    my $log_method = \&log_warn;

    my $state = $get_systemd_unit_state->($unit);
    if ($state eq 'active') {
	$log_method = \&log_pass;
    } elsif ($state eq 'inactive') {
	$log_method = $no_fail_on_inactive ? \&log_warn : \&log_fail;
    } elsif ($state eq 'failed') {
	$log_method = \&log_fail;
    }

    $log_method->("systemd unit '$unit' is in state '$state'");
};

my $versions;
my $get_pkg = sub {
    my ($pkg) = @_;

    $versions = eval { PVE::API2::APT->versions({ node => $nodename }) } if !defined($versions);

    if (!defined($versions)) {
	my $msg = "unable to retrieve package version information";
	$msg .= "- $@" if $@;
	log_fail("$msg");
	return undef;
    }

    my $pkgs = [ grep { $_->{Package} eq $pkg } @$versions ];
    if (!defined $pkgs || $pkgs == 0) {
	log_fail("unable to determine installed $pkg version.");
	return undef;
    } else {
	return $pkgs->[0];
    }
};

sub check_pve_packages {
    print_header("CHECKING VERSION INFORMATION FOR PVE PACKAGES");

    print "Checking for package updates..\n";
    my $updates = eval { PVE::API2::APT->list_updates({ node => $nodename }); };
    if (!defined($updates)) {
	log_warn("$@") if $@;
	log_fail("unable to retrieve list of package updates!");
    } elsif (@$updates > 0) {
	my $pkgs = join(', ', map { $_->{Package} } @$updates);
	log_warn("updates for the following packages are available:\n  $pkgs");
    } else {
	log_pass("all packages up-to-date");
    }

    print "\nChecking proxmox-ve package version..\n";
    if (defined(my $proxmox_ve = $get_pkg->('proxmox-ve'))) {
	# TODO: update to native version for pve8to9
	my $min_pve_ver = "$min_pve_major.$min_pve_minor-$min_pve_pkgrel";

	my ($maj, $min, $pkgrel) = $proxmox_ve->{OldVersion} =~ m/^(\d+)\.(\d+)[.-](\d+)/;

	my $upgraded = 0;

	if ($maj > $min_pve_major) {
	    log_pass("already upgraded to Proxmox VE " . ($min_pve_major + 1));
	    $upgraded = 1;
	} elsif ($maj >= $min_pve_major && $min >= $min_pve_minor && $pkgrel >= $min_pve_pkgrel) {
	    log_pass("proxmox-ve package has version >= $min_pve_ver");
	} else {
	    log_fail("proxmox-ve package is too old, please upgrade to >= $min_pve_ver!");
	}

	my ($krunning, $kinstalled) = (qr/6\.(?:2|5)/, 'pve-kernel-6.2');
	if (!$upgraded) {
	    # we got a few that avoided 5.15 in cluster with mixed CPUs, so allow older too
	    ($krunning, $kinstalled) = (qr/(?:5\.(?:13|15)|6\.2)/, 'pve-kernel-5.15');
	}

	print "\nChecking running kernel version..\n";
	my $kernel_ver = $proxmox_ve->{RunningKernel};
	if (!defined($kernel_ver)) {
	    log_fail("unable to determine running kernel version.");
	} elsif ($kernel_ver =~ /^$krunning/) {
	    if ($upgraded) {
		log_pass("running new kernel '$kernel_ver' after upgrade.");
	    } else {
		log_pass("running kernel '$kernel_ver' is considered suitable for upgrade.");
	    }
	} elsif ($get_pkg->($kinstalled)) {
	    # with 6.2 kernel being available in both we might want to fine-tune the check?
	    log_warn("a suitable kernel ($kinstalled) is intalled, but an unsuitable ($kernel_ver) is booted, missing reboot?!");
	} else {
	    log_warn("unexpected running and installed kernel '$kernel_ver'.");
	}

	if ($upgraded && $kernel_ver =~ /^$krunning/) {
	    my $outdated_kernel_meta_pkgs = [];
	    for my $kernel_meta_version ('5.4', '5.11', '5.13', '5.15') {
		my $pkg = "pve-kernel-${kernel_meta_version}";
		if ($get_pkg->($pkg)) {
		    push @$outdated_kernel_meta_pkgs, $pkg;
		}
	    }
	    if (scalar(@$outdated_kernel_meta_pkgs) > 0) {
		log_info(
		    "Found outdated kernel meta-packages, taking up extra space on boot partitions.\n"
		    ."      After a successful upgrade, you can remove them using this command:\n"
		    ."      apt remove " . join(' ', $outdated_kernel_meta_pkgs->@*)
		);
	    }
	}
    } else {
	log_fail("proxmox-ve package not found!");
    }
}


sub check_storage_health {
    print_header("CHECKING CONFIGURED STORAGES");
    my $cfg = PVE::Storage::config();

    my $ctime = time();

    my $info = PVE::Storage::storage_info($cfg);

    foreach my $storeid (sort keys %$info) {
	my $d = $info->{$storeid};
	if ($d->{enabled}) {
	    if ($d->{active}) {
		log_pass("storage '$storeid' enabled and active.");
	    } else {
		log_warn("storage '$storeid' enabled but not active!");
	    }
	} else {
	    log_skip("storage '$storeid' disabled.");
	}
    }

    check_storage_content();
    eval { check_storage_content_dirs() };
    log_fail("failed to check storage content directories - $@") if $@;
}

sub check_cluster_corosync {
    print_header("CHECKING CLUSTER HEALTH/SETTINGS");

    if (!PVE::Corosync::check_conf_exists(1)) {
	log_skip("standalone node.");
	return;
    }

    $log_systemd_unit_state->('pve-cluster.service');
    $log_systemd_unit_state->('corosync.service');

    if (PVE::Cluster::check_cfs_quorum(1)) {
	log_pass("Cluster Filesystem is quorate.");
    } else {
	log_fail("Cluster Filesystem readonly, lost quorum?!");
    }

    my $conf = PVE::Cluster::cfs_read_file('corosync.conf');
    my $conf_nodelist = PVE::Corosync::nodelist($conf);
    my $node_votes = 0;

    print "\nAnalzying quorum settings and state..\n";
    if (!defined($conf_nodelist)) {
	log_fail("unable to retrieve nodelist from corosync.conf");
    } else {
	if (grep { $conf_nodelist->{$_}->{quorum_votes} != 1 } keys %$conf_nodelist) {
	    log_warn("non-default quorum_votes distribution detected!");
	}
	map { $node_votes += $conf_nodelist->{$_}->{quorum_votes} // 0 } keys %$conf_nodelist;
    }

    my ($expected_votes, $total_votes);
    my $filter_output = sub {
	my $line = shift;
	($expected_votes) = $line =~ /^Expected votes:\s*(\d+)\s*$/
	    if !defined($expected_votes);
	($total_votes) = $line =~ /^Total votes:\s*(\d+)\s*$/
	    if !defined($total_votes);
    };
    eval {
	run_command(['corosync-quorumtool', '-s'], outfunc => $filter_output, noerr => 1);
    };

    if (!defined($expected_votes)) {
	log_fail("unable to get expected number of votes, assuming 0.");
	$expected_votes = 0;
    }
    if (!defined($total_votes)) {
	log_fail("unable to get expected number of votes, assuming 0.");
	$total_votes = 0;
    }

    my $cfs_nodelist = PVE::Cluster::get_clinfo()->{nodelist};
    my $offline_nodes = grep { $cfs_nodelist->{$_}->{online} != 1 } keys %$cfs_nodelist;
    if ($offline_nodes > 0) {
	log_fail("$offline_nodes nodes are offline!");
    }

    my $qdevice_votes = 0;
    if (my $qdevice_setup = $conf->{main}->{quorum}->{device}) {
	$qdevice_votes = $qdevice_setup->{votes} // 1;
    }

    log_info("configured votes - nodes: $node_votes");
    log_info("configured votes - qdevice: $qdevice_votes");
    log_info("current expected votes: $expected_votes");
    log_info("current total votes: $total_votes");

    log_warn("expected votes set to non-standard value '$expected_votes'.")
	if $expected_votes != $node_votes + $qdevice_votes;
    log_warn("total votes < expected votes: $total_votes/$expected_votes!")
	if $total_votes < $expected_votes;

    my $conf_nodelist_count = scalar(keys %$conf_nodelist);
    my $cfs_nodelist_count = scalar(keys %$cfs_nodelist);
    log_warn("cluster consists of less than three quorum-providing nodes!")
	if $conf_nodelist_count < 3 && $conf_nodelist_count + $qdevice_votes < 3;

    log_fail("corosync.conf ($conf_nodelist_count) and pmxcfs ($cfs_nodelist_count) don't agree about size of nodelist.")
	if $conf_nodelist_count != $cfs_nodelist_count;

    print "\nChecking nodelist entries..\n";
    my $nodelist_pass = 1;
    for my $cs_node (sort keys %$conf_nodelist) {
	my $entry = $conf_nodelist->{$cs_node};
	if (!defined($entry->{name})) {
	    $nodelist_pass = 0;
	    log_fail("$cs_node: no name entry in corosync.conf.");
	}
	if (!defined($entry->{nodeid})) {
	    $nodelist_pass = 0;
	    log_fail("$cs_node: no nodeid configured in corosync.conf.");
	}
	my $gotLinks = 0;
	for my $link (0..7) {
	    $gotLinks++ if defined($entry->{"ring${link}_addr"});
	}
	if ($gotLinks <= 0) {
	    $nodelist_pass = 0;
	    log_fail("$cs_node: no ringX_addr (0 <= X <= 7) link defined in corosync.conf.");
	}

	my $verify_ring_ip = sub {
	    my $key = shift;
	    if (defined(my $ring = $entry->{$key})) {
		my ($resolved_ip, undef) = PVE::Corosync::resolve_hostname_like_corosync($ring, $conf);
		if (defined($resolved_ip)) {
		    if ($resolved_ip ne $ring) {
			$nodelist_pass = 0;
			log_warn(
			    "$cs_node: $key '$ring' resolves to '$resolved_ip'.\n"
			    ." Consider replacing it with the currently resolved IP address."
			);
		    }
		} else {
		    $nodelist_pass = 0;
		    log_fail(
			"$cs_node: unable to resolve $key '$ring' to an IP address according to Corosync's"
			." resolve strategy - cluster will potentially fail with Corosync 3.x/kronosnet!"
		    );
		}
	    }
	};
	for my $link (0..7) {
	    $verify_ring_ip->("ring${link}_addr");
	}
    }
    log_pass("nodelist settings OK") if $nodelist_pass;

    print "\nChecking totem settings..\n";
    my $totem = $conf->{main}->{totem};
    my $totem_pass = 1;

    my $transport = $totem->{transport};
    if (defined($transport)) {
	if ($transport ne 'knet') {
	    $totem_pass = 0;
	    log_fail("Corosync transport explicitly set to '$transport' instead of implicit default!");
	}
    }

    # TODO: are those values still up-to-date?
    if ((!defined($totem->{secauth}) || $totem->{secauth} ne 'on') && (!defined($totem->{crypto_cipher}) || $totem->{crypto_cipher} eq 'none')) {
	$totem_pass = 0;
	log_fail("Corosync authentication/encryption is not explicitly enabled (secauth / crypto_cipher / crypto_hash)!");
    } elsif (defined($totem->{crypto_cipher}) && $totem->{crypto_cipher} eq '3des') {
	$totem_pass = 0;
	log_fail("Corosync encryption cipher set to '3des', no longer supported in Corosync 3.x!"); # FIXME: can be removed?
    }

    log_pass("totem settings OK") if $totem_pass;
    print "\n";
    log_info("run 'pvecm status' to get detailed cluster status..");

    if (defined(my $corosync = $get_pkg->('corosync'))) {
	if ($corosync->{OldVersion} =~ m/^2\./) {
	    log_fail("\ncorosync 2.x installed, cluster-wide upgrade to 3.x needed!");
	} elsif ($corosync->{OldVersion} !~ m/^3\./) {
	    log_fail("\nunexpected corosync version installed: $corosync->{OldVersion}!");
	}
    }
}

sub check_ceph {
    print_header("CHECKING HYPER-CONVERGED CEPH STATUS");

    if (PVE::Ceph::Tools::check_ceph_inited(1)) {
	log_info("hyper-converged ceph setup detected!");
    } else {
	log_skip("no hyper-converged ceph setup detected!");
	return;
    }

    log_info("getting Ceph status/health information..");
    my $ceph_status = eval { PVE::API2::Ceph->status({ node => $nodename }); };
    my $noout = eval { PVE::API2::Cluster::Ceph->get_flag({ flag => "noout" }); };
    if ($@) {
	log_fail("failed to get 'noout' flag status - $@");
    }

    my $noout_wanted = 1;

    if (!$ceph_status || !$ceph_status->{health}) {
	log_fail("unable to determine Ceph status!");
    } else {
	my $ceph_health = $ceph_status->{health}->{status};
	if (!$ceph_health) {
	    log_fail("unable to determine Ceph health!");
	} elsif ($ceph_health eq 'HEALTH_OK') {
	    log_pass("Ceph health reported as 'HEALTH_OK'.");
	} elsif ($ceph_health eq 'HEALTH_WARN' && $noout && (keys %{$ceph_status->{health}->{checks}} == 1)) {
		log_pass("Ceph health reported as 'HEALTH_WARN' with a single failing check and 'noout' flag set.");
	} else {
		log_warn(
		    "Ceph health reported as '$ceph_health'.\n      Use the PVE dashboard or 'ceph -s'"
		    ." to determine the specific issues and try to resolve them."
		);
	}
    }

    # TODO: check OSD min-required version, if to low it breaks stuff!

    log_info("checking local Ceph version..");
    if (my $release = eval { PVE::Ceph::Tools::get_local_version(1) }) {
	my $code_name = $ceph_release2code->{"$release"} || 'unknown';
	if ($release == $ceph_supported_release) {
	    log_pass("found expected Ceph $ceph_supported_release $ceph_supported_code_name release.")
	} elsif ($release > $ceph_supported_release) {
	    log_warn(
		"found newer Ceph release $release $code_name as the expected $ceph_supported_release"
		." $ceph_supported_code_name, installed third party repos?!"
	    )
	} else {
	    log_fail(
		"Hyper-converged Ceph $release $code_name is to old for upgrade!\n"
		."      Upgrade Ceph first to $ceph_supported_code_name following our how-to:\n"
		."      <https://pve.proxmox.com/wiki/Category:Ceph_Upgrade>"
	    );
	}
    } else {
	log_fail("unable to determine local Ceph version!");
    }

    log_info("getting Ceph daemon versions..");
    my $ceph_versions = eval { PVE::Ceph::Tools::get_cluster_versions(undef, 1); };
    if (!$ceph_versions) {
	log_fail("unable to determine Ceph daemon versions!");
    } else {
	my $services = [
	    { 'key' => 'mon', 'name' => 'monitor' },
	    { 'key' => 'mgr', 'name' => 'manager' },
	    { 'key' => 'mds', 'name' => 'MDS' },
	    { 'key' => 'osd', 'name' => 'OSD' },
	];

	my $ceph_versions_simple = {};
	my $ceph_versions_commits = {};
	for my $type (keys %$ceph_versions) {
	    for my $full_version (keys $ceph_versions->{$type}->%*) {
		if ($full_version =~ m/^(.*) \((.*)\).*\(.*\)$/) {
		    # String is in the form of
		    # ceph version 17.2.6 (810db68029296377607028a6c6da1ec06f5a2b27) quincy (stable)
		    # only check the first part, e.g. 'ceph version 17.2.6', the commit hash can
		    # be different
		    $ceph_versions_simple->{$type}->{$1} = 1;
		    $ceph_versions_commits->{$type}->{$2} = 1;
		}
	    }
	}

	foreach my $service (@$services) {
	    my ($name, $key) = $service->@{'name', 'key'};
	    if (my $service_versions = $ceph_versions_simple->{$key}) {
		if (keys %$service_versions == 0) {
		    log_skip("no running instances detected for daemon type $name.");
		} elsif (keys %$service_versions == 1) {
		    log_pass("single running version detected for daemon type $name.");
		} else {
		    log_warn("multiple running versions detected for daemon type $name!");
		}
	    } else {
		log_skip("unable to determine versions of running Ceph $name instances.");
	    }
	    my $service_commits = $ceph_versions_commits->{$key};
	    log_info("different builds of same version detected for an $name. Are you in the middle of the upgrade?")
		if $service_commits && keys %$service_commits > 1;
	}

	my $overall_versions = $ceph_versions->{overall};
	if (!$overall_versions) {
	    log_warn("unable to determine overall Ceph daemon versions!");
	} elsif (keys %$overall_versions == 1) {
	    log_pass("single running overall version detected for all Ceph daemon types.");
	    $noout_wanted = 0; # off post-upgrade, on pre-upgrade
	} elsif (keys $ceph_versions_simple->{overall}->%* != 1) {
	    log_warn("overall version mismatch detected, check 'ceph versions' output for details!");
	}
    }

    if ($noout) {
	if ($noout_wanted) {
	    log_pass("'noout' flag set to prevent rebalancing during cluster-wide upgrades.");
	} else {
	    log_warn("'noout' flag set, Ceph cluster upgrade seems finished.");
	}
    } elsif ($noout_wanted) {
	log_warn("'noout' flag not set - recommended to prevent rebalancing during upgrades.");
    }

    log_info("checking Ceph config..");
    my $conf = PVE::Cluster::cfs_read_file('ceph.conf');
    if (%$conf) {
	my $global = $conf->{global};

	my $global_monhost = $global->{mon_host} // $global->{"mon host"} // $global->{"mon-host"};
	if (!defined($global_monhost)) {
	    log_warn(
		"No 'mon_host' entry found in ceph config.\n  It's recommended to add mon_host with"
		." all monitor addresses (without ports) to the global section."
	    );
	}

	my $ipv6 = $global->{ms_bind_ipv6} // $global->{"ms bind ipv6"} // $global->{"ms-bind-ipv6"};
	if ($ipv6) {
	    my $ipv4 = $global->{ms_bind_ipv4} // $global->{"ms bind ipv4"} // $global->{"ms-bind-ipv4"};
	    if ($ipv6 eq 'true' && (!defined($ipv4) || $ipv4 ne 'false')) {
		log_warn(
		    "'ms_bind_ipv6' is enabled but 'ms_bind_ipv4' is not disabled.\n  Make sure to"
		    ." disable 'ms_bind_ipv4' for ipv6 only clusters, or add an ipv4 network to public/cluster network."
		);
	    }
	}

	if (defined($global->{keyring})) {
	    log_warn(
		"[global] config section contains 'keyring' option, which will prevent services from"
		." starting with Nautilus.\n Move 'keyring' option to [client] section instead."
	    );
	}

    } else {
	log_warn("Empty ceph config found");
    }

    my $local_ceph_ver = PVE::Ceph::Tools::get_local_version(1);
    if (defined($local_ceph_ver)) {
	if ($local_ceph_ver <= 14) {
	    log_fail("local Ceph version too low, at least Octopus required..");
	}
    } else {
	log_fail("unable to determine local Ceph version.");
    }
}

sub check_backup_retention_settings {
    log_info("Checking backup retention settings..");

    my $pass = 1;

    my $node_has_retention;

    my $maxfiles_msg = "parameter 'maxfiles' is deprecated with PVE 7.x and will be removed in a " .
	"future version, use 'prune-backups' instead.";

    eval {
	my $confdesc = PVE::VZDump::Common::get_confdesc();

	my $fn = "/etc/vzdump.conf";
	my $raw = PVE::Tools::file_get_contents($fn);

	my $conf_schema = { type => 'object', properties => $confdesc, };
	my $param = PVE::JSONSchema::parse_config($conf_schema, $fn, $raw);

	if (defined($param->{maxfiles})) {
	    $pass = 0;
	    log_warn("$fn - $maxfiles_msg");
	}

	$node_has_retention = defined($param->{maxfiles}) || defined($param->{'prune-backups'});
    };
    if (my $err = $@) {
	$pass = 0;
	log_warn("unable to parse node's VZDump configuration - $err");
    }

    my $storage_cfg = PVE::Storage::config();

    for my $storeid (keys $storage_cfg->{ids}->%*) {
	my $scfg = $storage_cfg->{ids}->{$storeid};

	if (defined($scfg->{maxfiles})) {
	    $pass = 0;
	    log_warn("storage '$storeid' - $maxfiles_msg");
	}

	next if !$scfg->{content}->{backup};
	next if defined($scfg->{maxfiles}) || defined($scfg->{'prune-backups'});
	next if $node_has_retention;

	log_info(
	    "storage '$storeid' - no backup retention settings defined - by default, since PVE 7.0"
	    ." it will no longer keep only the last backup, but all backups"
	);
    }

    eval {
	my $vzdump_cron = PVE::Cluster::cfs_read_file('vzdump.cron');

	# only warn once, there might be many jobs...
	if (scalar(grep { defined($_->{maxfiles}) } $vzdump_cron->{jobs}->@*)) {
	    $pass = 0;
	    log_warn("/etc/pve/vzdump.cron - $maxfiles_msg");
	}
    };
    if (my $err = $@) {
	$pass = 0;
	log_warn("unable to parse node's VZDump configuration - $err");
    }

    log_pass("no backup retention problems found.") if $pass;
}

sub check_cifs_credential_location {
    log_info("checking CIFS credential location..");

    my $regex = qr/^(.*)\.cred$/;

    my $found;

    PVE::Tools::dir_glob_foreach('/etc/pve/priv/', $regex, sub {
	my ($filename) = @_;

	my ($basename) = $filename =~ $regex;

	log_warn(
	    "CIFS credentials '/etc/pve/priv/$filename' will be moved to"
	    ." '/etc/pve/priv/storage/$basename.pw' during the update"
	);

	$found = 1;
    });

    log_pass("no CIFS credentials at outdated location found.") if !$found;
}

sub check_custom_pool_roles {
    log_info("Checking custom roles for pool permissions..");

    if (! -f "/etc/pve/user.cfg") {
	log_skip("user.cfg does not exist");
	return;
    }

    my $raw = eval { PVE::Tools::file_get_contents('/etc/pve/user.cfg'); };
    if ($@) {
	log_fail("Failed to read '/etc/pve/user.cfg' - $@");
	return;
    }

    my $roles = {};
    while ($raw =~ /^\s*(.+?)\s*$/gm) {
	my $line = $1;
	my @data;

	foreach my $d (split (/:/, $line)) {
	    $d =~ s/^\s+//;
	    $d =~ s/\s+$//;
	    push @data, $d
	}

	my $et = shift @data;
	next if $et ne 'role';

	my ($role, $privlist) = @data;
	if (!PVE::AccessControl::verify_rolename($role, 1)) {
	    warn "user config - ignore role '$role' - invalid characters in role name\n";
	    next;
	}

	$roles->{$role} = {} if !$roles->{$role};
	foreach my $priv (split_list($privlist)) {
	    $roles->{$role}->{$priv} = 1;
	}
    }

    foreach my $role (sort keys %{$roles}) {
	next if PVE::AccessControl::role_is_special($role);

	# TODO: any role updates?
    }
}

my sub check_max_length {
    my ($raw, $max_length, $warning) = @_;
    log_warn($warning) if defined($raw) && length($raw) > $max_length; 
}

sub check_node_and_guest_configurations {
    log_info("Checking node and guest description/note length..");

    my @affected_nodes = grep {
	my $desc = PVE::NodeConfig::load_config($_)->{desc};
	defined($desc) && length($desc) > 64 * 1024
    } PVE::Cluster::get_nodelist();

    if (scalar(@affected_nodes) > 0) {
	log_warn("Node config description of the following nodes too long for new limit of 64 KiB:\n    "
	    . join(', ', @affected_nodes));
    } else {
	log_pass("All node config descriptions fit in the new limit of 64 KiB");
    }

    my $affected_guests_long_desc = [];
    my $affected_cts_cgroup_keys = [];

    my $cts = PVE::LXC::config_list();
    for my $vmid (sort { $a <=> $b } keys %$cts) {
	my $conf = PVE::LXC::Config->load_config($vmid);

	my $desc = $conf->{description};
	push @$affected_guests_long_desc, "CT $vmid" if defined($desc) && length($desc) > 8 * 1024;

	my $lxc_raw_conf = $conf->{lxc};
	push @$affected_cts_cgroup_keys, "CT $vmid"  if (grep (@$_[0] =~ /^lxc\.cgroup\./, @$lxc_raw_conf));
    }
    my $vms = PVE::QemuServer::config_list();
    for my $vmid (sort { $a <=> $b } keys %$vms) {
	my $desc = PVE::QemuConfig->load_config($vmid)->{description};
	push @$affected_guests_long_desc, "VM $vmid" if defined($desc) && length($desc) > 8 * 1024;
    }
    if (scalar($affected_guests_long_desc->@*) > 0) {
	log_warn("Guest config description of the following virtual-guests too long for new limit of 64 KiB:\n"
	    ."    " . join(", ", $affected_guests_long_desc->@*));
    } else {
	log_pass("All guest config descriptions fit in the new limit of 8 KiB");
    }

    log_info("Checking container configs for deprecated lxc.cgroup entries");

    if (scalar($affected_cts_cgroup_keys->@*) > 0) {
	if ($forced_legacy_cgroup) {
	    log_pass("Found legacy 'lxc.cgroup' keys, but system explicitly configured for legacy hybrid cgroup hierarchy.");
	}  else {
	    log_warn("The following CTs have 'lxc.cgroup' keys configured, which will be ignored in the new default unified cgroupv2:\n"
		."    " . join(", ", $affected_cts_cgroup_keys->@*) ."\n"
		."    Often it can be enough to change to the new 'lxc.cgroup2' prefix after the upgrade to Proxmox VE 7.x");
	}
    } else {
	log_pass("No legacy 'lxc.cgroup' keys found.");
    }
}

sub check_storage_content {
    log_info("Checking storage content type configuration..");

    my $found;
    my $pass = 1;

    my $storage_cfg = PVE::Storage::config();

    for my $storeid (sort keys $storage_cfg->{ids}->%*) {
	my $scfg = $storage_cfg->{ids}->{$storeid};

	next if $scfg->{shared};
	next if !PVE::Storage::storage_check_enabled($storage_cfg, $storeid, undef, 1);

	my $valid_content = PVE::Storage::Plugin::valid_content_types($scfg->{type});

	if (scalar(keys $scfg->{content}->%*) == 0 && !$valid_content->{none}) {
	    $pass = 0;
	    log_fail("storage '$storeid' does not support configured content type 'none'");
	    delete $scfg->{content}->{none}; # scan for guest images below
	}

	next if $scfg->{content}->{images};
	next if $scfg->{content}->{rootdir};

	# Skip 'iscsi(direct)' (and foreign plugins with potentially similar behavior) with 'none',
	# because that means "use LUNs directly" and vdisk_list() in PVE 6.x still lists those.
	# It's enough to *not* skip 'dir', because it is the only other storage that supports 'none'
	# and 'images' or 'rootdir', hence being potentially misconfigured.
	next if $scfg->{type} ne 'dir' && $scfg->{content}->{none};

	eval { PVE::Storage::activate_storage($storage_cfg, $storeid) };
	if (my $err = $@) {
	    log_warn("activating '$storeid' failed - $err");
	    next;
	}

	my $res = eval { PVE::Storage::vdisk_list($storage_cfg, $storeid); };
	if (my $err = $@) {
	    log_warn("listing images on '$storeid' failed - $err");
	    next;
	}
	my @volids = map { $_->{volid} } $res->{$storeid}->@*;

	my $number = scalar(@volids);
	if ($number > 0) {
	    log_info(
		"storage '$storeid' - neither content type 'images' nor 'rootdir' configured, but"
		."found $number guest volume(s)"
	    );
	}
    }

    my $check_volid = sub {
	my ($volid, $vmid, $vmtype, $reference) = @_;

	my $guesttext = $vmtype eq 'qemu' ? 'VM' : 'CT';
	my $prefix = "$guesttext $vmid - volume '$volid' ($reference)";

	my ($storeid) = PVE::Storage::parse_volume_id($volid, 1);
	return if !defined($storeid);

	my $scfg = $storage_cfg->{ids}->{$storeid};
	if (!$scfg) {
	    $pass = 0;
	    log_warn("$prefix - storage does not exist!");
	    return;
	}

	# cannot use parse_volname for containers, as it can return 'images'
	# but containers cannot have ISO images attached, so assume 'rootdir'
	my $vtype = 'rootdir';
	if ($vmtype eq 'qemu') {
	    ($vtype) = eval { PVE::Storage::parse_volname($storage_cfg, $volid); };
	    return if $@;
	}

	if (!$scfg->{content}->{$vtype}) {
	    $found = 1;
	    $pass = 0;
	    log_warn("$prefix - storage does not have content type '$vtype' configured.");
	}
    };

    my $cts = PVE::LXC::config_list();
    for my $vmid (sort { $a <=> $b } keys %$cts) {
	my $conf = PVE::LXC::Config->load_config($vmid);

	my $volhash = {};

	my $check = sub {
	    my ($ms, $mountpoint, $reference) = @_;

	    my $volid = $mountpoint->{volume};
	    return if !$volid || $mountpoint->{type} ne 'volume';

	    return if $volhash->{$volid}; # volume might be referenced multiple times

	    $volhash->{$volid} = 1;

	    $check_volid->($volid, $vmid, 'lxc', $reference);
	};

	my $opts = { include_unused => 1 };
	PVE::LXC::Config->foreach_volume_full($conf, $opts, $check, 'in config');
	for my $snapname (keys $conf->{snapshots}->%*) {
	    my $snap = $conf->{snapshots}->{$snapname};
	    PVE::LXC::Config->foreach_volume_full($snap, $opts, $check, "in snapshot '$snapname'");
	}
    }

    my $vms = PVE::QemuServer::config_list();
    for my $vmid (sort { $a <=> $b } keys %$vms) {
	my $conf = PVE::QemuConfig->load_config($vmid);

	my $volhash = {};

	my $check = sub {
	    my ($key, $drive, $reference) = @_;

	    my $volid = $drive->{file};
	    return if $volid =~ m|^/|;
	    return if $volhash->{$volid}; # volume might be referenced multiple times

	    $volhash->{$volid} = 1;
	    $check_volid->($volid, $vmid, 'qemu', $reference);
	};

	my $opts = {
	    extra_keys => ['vmstate'],
	    include_unused => 1,
	};
	# startup from a suspended state works even without 'images' content type on the
	# state storage, so do not check 'vmstate' for $conf
	PVE::QemuConfig->foreach_volume_full($conf, { include_unused => 1 }, $check, 'in config');
	for my $snapname (keys $conf->{snapshots}->%*) {
	    my $snap = $conf->{snapshots}->{$snapname};
	    PVE::QemuConfig->foreach_volume_full($snap, $opts, $check, "in snapshot '$snapname'");
	}
    }

    if ($found) {
	log_warn("Proxmox VE enforces stricter content type checks since 7.0. The guests above " .
	    "might not work until the storage configuration is fixed.");
    }

    if ($pass) {
	log_pass("no storage content problems found");
    }
}

sub check_storage_content_dirs {
    my $storage_cfg = PVE::Storage::config();

    # check that content dirs are pairwise inequal
    my $any_problematic = 0;
    for my $storeid (sort keys $storage_cfg->{ids}->%*) {
	my $scfg = $storage_cfg->{ids}->{$storeid};

	next if !PVE::Storage::storage_check_enabled($storage_cfg, $storeid, undef, 1);
	next if !$scfg->{path} || !$scfg->{content};

	eval { PVE::Storage::activate_storage($storage_cfg, $storeid) };
	if (my $err = $@) {
	    log_warn("activating '$storeid' failed - $err");
	    next;
	}

	my $resolved_subdirs = {};
	my $plugin = PVE::Storage::Plugin->lookup($scfg->{type});
	for my $vtype (keys $scfg->{content}->%*) {
	    my $abs_subdir = Cwd::abs_path($plugin->get_subdir($scfg, $vtype));
	    push $resolved_subdirs->{$abs_subdir}->@*, $vtype;
	}
	for my $subdir (keys $resolved_subdirs->%*) {
	    if (scalar($resolved_subdirs->{$subdir}->@*) > 1) {
		my $types = join(", ", $resolved_subdirs->{$subdir}->@*);
		log_warn("storage '$storeid' uses directory $subdir for multiple content types ($types).");
		$any_problematic = 1;
	     }
	}
    }
    if ($any_problematic) {
	log_fail("re-using directory for multiple content types (see above) is no longer supported in Proxmox VE 8!")
    } else {
	log_pass("no storage re-uses a directory for multiple content types.")
    }
}

sub check_containers_cgroup_compat {
    if ($forced_legacy_cgroup) {
	log_warn("System explicitly configured for legacy hybrid cgroup hierarchy.\n"
	    ."     NOTE: support for the hybrid cgroup hierarchy will be removed in future Proxmox VE 9 (~ 2025)."
	);
    }

    my $supports_cgroupv2 = sub {
	my ($conf, $rootdir, $ctid) = @_;

	my $get_systemd_version = sub {
	    my ($self) = @_;

	    my $sd_lib_dir = -d "/lib/systemd" ? "/lib/systemd" : "/usr/lib/systemd";
	    my $libsd = PVE::Tools::dir_glob_regex($sd_lib_dir, "libsystemd-shared-.+\.so");
	    if (defined($libsd) && $libsd =~ /libsystemd-shared-(\d+)\.so/) {
		return $1;
	    }

	    return undef;
	};

	my  $unified_cgroupv2_support = sub {
	    my ($self) = @_;

	    # https://www.freedesktop.org/software/systemd/man/systemd.html
	    # systemd is installed as symlink to /sbin/init
	    my $systemd = CORE::readlink('/sbin/init');

	    # assume non-systemd init will run with unified cgroupv2
	    if (!defined($systemd) || $systemd !~ m@/systemd$@) {
		return 1;
	    }

	    # systemd version 232 (e.g. debian stretch) supports the unified hierarchy
	    my $sdver = $get_systemd_version->();
	    if (!defined($sdver) || $sdver < 232) {
		return 0;
	    }

	    return 1;
	};

	my $ostype = $conf->{ostype};
	if (!defined($ostype)) {
	    log_warn("Found CT ($ctid) without 'ostype' set!");
	} elsif ($ostype eq 'devuan' || $ostype eq 'alpine') {
	    return 1; # no systemd, no cgroup problems
	}

	my $lxc_setup = PVE::LXC::Setup->new($conf, $rootdir);
	return $lxc_setup->protected_call($unified_cgroupv2_support);
    };

    my $log_problem = sub {
	my ($ctid) = @_;
	my $extra = $forced_legacy_cgroup ? '' : " or set systemd.unified_cgroup_hierarchy=0 in the Proxmox VE hosts' kernel cmdline";
	log_warn(
	    "Found at least one CT ($ctid) which does not support running in a unified cgroup v2 layout\n"
	    ."    Consider upgrading the Containers distro${extra}! Skipping further CT compat checks."
	);
    };

    my $cts = eval { PVE::API2::LXC->vmlist({ node => $nodename }) };
    if ($@) {
	log_warn("Failed to retrieve information about this node's CTs - $@");
	return;
    }

    if (!defined($cts) || !scalar(@$cts)) {
	log_skip("No containers on node detected.");
	return;
    }

    my @running_cts = sort { $a <=> $b } grep { $_->{status} eq 'running' } @$cts;
    my @offline_cts = sort { $a <=> $b } grep { $_->{status} ne 'running' } @$cts;

    for my $ct (@running_cts) {
	my $ctid = $ct->{vmid};
	my $pid = eval { PVE::LXC::find_lxc_pid($ctid) };
	if (my $err = $@) {
	    log_warn("Failed to get PID for running CT $ctid - $err");
	    next;
	}
	my $rootdir = "/proc/$pid/root";
	my $conf = PVE::LXC::Config->load_config($ctid);

	my $ret = eval { $supports_cgroupv2->($conf, $rootdir, $ctid) };
	if (my $err = $@) {
	    log_warn("Failed to get cgroup support status for CT $ctid - $err");
	    next;
	}
	if (!$ret) {
	    $log_problem->($ctid);
	    return;
	}
    }

    my $storage_cfg = PVE::Storage::config();
    for my $ct (@offline_cts) {
	my $ctid = $ct->{vmid};
	my ($conf, $rootdir, $ret);
	eval {
	    $conf = PVE::LXC::Config->load_config($ctid);
	    $rootdir = PVE::LXC::mount_all($ctid, $storage_cfg, $conf);
	    $ret = $supports_cgroupv2->($conf, $rootdir, $ctid);
	};
	if (my $err = $@) {
	    log_warn("Failed to load config and mount CT $ctid - $err");
	    eval { PVE::LXC::umount_all($ctid, $storage_cfg, $conf) };
	    next;
	}
	if (!$ret) {
	    $log_problem->($ctid);
	    eval { PVE::LXC::umount_all($ctid, $storage_cfg, $conf) };
	    last;
	}

	eval { PVE::LXC::umount_all($ctid, $storage_cfg, $conf) };
    }
};

sub check_apt_repos {
    log_info("Checking if the suite for the Debian security repository is correct..");

    my $found = 0;

    my $dir = '/etc/apt/sources.list.d';
    my $in_dir = 0;

    # TODO: check that (original) debian and Proxmox VE mirrors are present.

    my $check_file = sub {
	my ($file) = @_;

	$file = "${dir}/${file}" if $in_dir;

	my $raw = eval { PVE::Tools::file_get_contents($file) };
	return if !defined($raw);
	my @lines = split(/\n/, $raw);

	my $number = 0;
	for my $line (@lines) {
	    $number++;

	    next if length($line) == 0; # split would result in undef then...

	    ($line) = split(/#/, $line);

	    next if $line !~ m/^deb[[:space:]]/; # is case sensitive

	    my $suite;

	    # catch any of
	    # https://deb.debian.org/debian-security
	    # http://security.debian.org/debian-security
	    # http://security.debian.org/
	    if ($line =~ m|https?://deb\.debian\.org/debian-security/?\s+(\S*)|i) {
		$suite = $1;
	    } elsif ($line =~ m|https?://security\.debian\.org(?:.*?)\s+(\S*)|i) {
		$suite = $1;
	    } else {
		next;
	    }

	    $found = 1;

	    my $where = "in ${file}:${number}";
	    # TODO: is this useful (for some other checks)?
	}
    };

    $check_file->("/etc/apt/sources.list");

    $in_dir = 1;

    PVE::Tools::dir_glob_foreach($dir, '^.*\.list$', $check_file);

    if (!$found) {
	# only warn, it might be defined in a .sources file or in a way not caaught above
	log_warn("No Debian security repository detected in /etc/apt/sources.list and " .
	    "/etc/apt/sources.list.d/*.list");
    }
}

sub check_time_sync {
    my $unit_active = sub { return $get_systemd_unit_state->($_[0], 1) eq 'active' ? $_[0] : undef };

    log_info("Checking for supported & active NTP service..");
    if ($unit_active->('systemd-timesyncd.service')) {
	log_warn(
	    "systemd-timesyncd is not the best choice for time-keeping on servers, due to only applying"
	    ." updates on boot.\n  While not necessary for the upgrade it's recommended to use one of:\n"
	    ."    * chrony (Default in new Proxmox VE installations)\n    * ntpsec\n    * openntpd\n"
	);
    } elsif ($unit_active->('ntp.service')) {
	log_info("Debian deprecated and removed the ntp package for Bookworm, but the system"
	    ." will automatically migrate to the 'ntpsec' replacement package on upgrade.");
    } elsif (my $active_ntp = ($unit_active->('chrony.service') || $unit_active->('openntpd.service') || $unit_active->('ntpsec.service'))) {
	log_pass("Detected active time synchronisation unit '$active_ntp'");
    } else {
	log_warn(
	    "No (active) time synchronisation daemon (NTP) detected, but synchronized systems are important,"
	    ." especially for cluster and/or ceph!"
	);
    }
}

sub check_misc {
    print_header("MISCELLANEOUS CHECKS");
    my $ssh_config = eval { PVE::Tools::file_get_contents('/root/.ssh/config') };
    if (defined($ssh_config)) {
	log_fail("Unsupported SSH Cipher configured for root in /root/.ssh/config: $1")
	    if $ssh_config =~ /^Ciphers .*(blowfish|arcfour|3des).*$/m;
    } else {
	log_skip("No SSH config file found.");
    }

    log_info("Checking common daemon services..");
    $log_systemd_unit_state->('pveproxy.service');
    $log_systemd_unit_state->('pvedaemon.service');
    $log_systemd_unit_state->('pvescheduler.service');
    $log_systemd_unit_state->('pvestatd.service');

    check_time_sync();

    my $root_free = PVE::Tools::df('/', 10);
    log_warn("Less than 5 GB free space on root file system.")
	if defined($root_free) && $root_free->{avail} < 5 * 1000*1000*1000;

    log_info("Checking for running guests..");
    my $running_guests = 0;

    my $vms = eval { PVE::API2::Qemu->vmlist({ node => $nodename }) };
    log_warn("Failed to retrieve information about this node's VMs - $@") if $@;
    $running_guests += grep { $_->{status} eq 'running' } @$vms if defined($vms);

    my $cts = eval { PVE::API2::LXC->vmlist({ node => $nodename }) };
    log_warn("Failed to retrieve information about this node's CTs - $@") if $@;
    $running_guests += grep { $_->{status} eq 'running' } @$cts if defined($cts);

    if ($running_guests > 0) {
	log_warn("$running_guests running guest(s) detected - consider migrating or stopping them.")
    } else {
	log_pass("no running guest detected.")
    }

    log_info("Checking if the local node's hostname '$nodename' is resolvable..");
    my $local_ip = eval { PVE::Network::get_ip_from_hostname($nodename) };
    if ($@) {
	log_warn("Failed to resolve hostname '$nodename' to IP - $@");
    } else {
	log_info("Checking if resolved IP is configured on local node..");
	my $cidr = Net::IP::ip_is_ipv6($local_ip) ? "$local_ip/128" : "$local_ip/32";
	my $configured_ips = PVE::Network::get_local_ip_from_cidr($cidr);
	my $ip_count = scalar(@$configured_ips);

	if ($ip_count <= 0) {
	    log_fail("Resolved node IP '$local_ip' not configured or active for '$nodename'");
	} elsif ($ip_count > 1) {
	    log_warn("Resolved node IP '$local_ip' active on multiple ($ip_count) interfaces!");
	} else {
	    log_pass("Resolved node IP '$local_ip' configured and active on single interface.");
	}
    }

    log_info("Check node certificate's RSA key size");
    my $certs = PVE::API2::Certificates->info({ node => $nodename });
    my $certs_check = {
	'rsaEncryption' => {
	    minsize => 2048,
	    name => 'RSA',
	},
	'id-ecPublicKey' => {
	    minsize => 224,
	    name => 'ECC',
	},
    };

    my $certs_check_failed = 0;
    foreach my $cert (@$certs) {
	my ($type, $size, $fn) = $cert->@{qw(public-key-type public-key-bits filename)};

	if (!defined($type) || !defined($size)) {
	    log_warn("'$fn': cannot check certificate, failed to get it's type or size!");
	}

	my $check = $certs_check->{$type};
	if (!defined($check)) {
	    log_warn("'$fn': certificate's public key type '$type' unknown!");
	    next;
	}

	if ($size < $check->{minsize}) {
	    log_fail("'$fn', certificate's $check->{name} public key size is less than 2048 bit");
	    $certs_check_failed = 1;
	} else {
	    log_pass("Certificate '$fn' passed Debian Busters (and newer) security level for TLS connections ($size >= 2048)");
	}
    }

    check_backup_retention_settings();
    check_cifs_credential_location();
    check_custom_pool_roles();
    check_node_and_guest_configurations();
    check_apt_repos();
}

my sub colored_if {
    my ($str, $color, $condition) = @_;
    return "". ($condition ? colored($str, $color) : $str);
}

__PACKAGE__->register_method ({
    name => 'checklist',
    path => 'checklist',
    method => 'GET',
    description => 'Check (pre-/post-)upgrade conditions.',
    parameters => {
	additionalProperties => 0,
	properties => {
	    full => {
		description => 'perform additional, expensive checks.',
		type => 'boolean',
		optional => 1,
		default => 0,
	    },
	},
    },
    returns => { type => 'null' },
    code => sub {
	my ($param) = @_;

	my $kernel_cli = PVE::Tools::file_get_contents('/proc/cmdline');
	if ($kernel_cli =~ /systemd.unified_cgroup_hierarchy=0/){
	    $forced_legacy_cgroup = 1;
	}

	check_pve_packages();
	check_cluster_corosync();
	check_ceph();
	check_storage_health();
	check_misc();

	if ($param->{full}) {
	    check_containers_cgroup_compat();
	} else {
	    log_skip("NOTE: Expensive checks, like CT cgroupv2 compat, not performed without '--full' parameter");
	}

	print_header("SUMMARY");

	my $total = 0;
	$total += $_ for values %$counters;

	print "TOTAL:    $total\n";
	print colored("PASSED:   $counters->{pass}\n", 'green');
	print "SKIPPED:  $counters->{skip}\n";
	print colored_if("WARNINGS: $counters->{warn}\n", 'yellow', $counters->{warn} > 0);
	print colored_if("FAILURES: $counters->{fail}\n", 'bold red', $counters->{fail} > 0);

	if ($counters->{warn} > 0 || $counters->{fail} > 0) {
	    my $color = $counters->{fail} > 0 ? 'bold red' : 'yellow';
	    print colored("\nATTENTION: Please check the output for detailed information!\n", $color);
	    print colored("Try to solve the problems one at a time and then run this checklist tool again.\n", $color) if $counters->{fail} > 0;
	}

	return undef;
    }});

our $cmddef = [ __PACKAGE__, 'checklist', [], {}];

1;
