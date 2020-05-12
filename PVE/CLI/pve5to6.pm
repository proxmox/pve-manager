package PVE::CLI::pve5to6;

use strict;
use warnings;

use PVE::API2::APT;
use PVE::API2::Ceph;
use PVE::API2::LXC;
use PVE::API2::Qemu;
use PVE::API2::Certificates;

use PVE::Ceph::Tools;
use PVE::Cluster;
use PVE::Corosync;
use PVE::INotify;
use PVE::JSONSchema;
use PVE::RPCEnvironment;
use PVE::Storage;
use PVE::Tools qw(run_command $IPV4RE $IPV6RE);
use PVE::QemuServer;

use AptPkg::Cache;
use Socket qw(AF_INET AF_INET6 inet_ntop);
use Term::ANSIColor;

use PVE::CLIHandler;

use base qw(PVE::CLIHandler);

my $nodename = PVE::INotify::nodename();

sub setup_environment {
    PVE::RPCEnvironment->setup_default_cli_env();
}

my $min_pve_major = 5;
my $min_pve_minor = 4;
my $min_pve_pkgrel = 2;

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
    print color('red');
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
    my ($unit) = @_;

    my $state;
    my $filter_output = sub {
	$state = shift;
	chomp $state;
    };
    eval {
	run_command(['systemctl', 'is-enabled', "$unit"], outfunc => $filter_output, noerr => 1);
	return if !defined($state);
	run_command(['systemctl', 'is-active', "$unit"], outfunc => $filter_output, noerr => 1);
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

# taken from pve-cluster 6.0-4
my $resolve_hostname_like_corosync = sub {
    my ($hostname, $corosync_conf) = @_;

    my $corosync_strategy = $corosync_conf->{main}->{totem}->{ip_version};
    $corosync_strategy = lc ($corosync_strategy // "ipv6-4");

    my $match_ip_and_version = sub {
	my ($addr) = @_;

	return undef if !defined($addr);

	if ($addr =~ m/^$IPV4RE$/) {
	    return ($addr, 4);
	} elsif ($addr =~ m/^$IPV6RE$/) {
	    return ($addr, 6);
	}

	return undef;
    };

    my ($resolved_ip, $ip_version) = $match_ip_and_version->($hostname);

    return ($resolved_ip, $ip_version) if defined($resolved_ip);

    my $resolved_ip4;
    my $resolved_ip6;

    my @resolved_raw;
    eval { @resolved_raw = PVE::Tools::getaddrinfo_all($hostname); };

    return undef if ($@ || !@resolved_raw);

    foreach my $socket_info (@resolved_raw) {
	next if !$socket_info->{addr};

	my ($family, undef, $host) = PVE::Tools::unpack_sockaddr_in46($socket_info->{addr});

	if ($family == AF_INET && !defined($resolved_ip4)) {
	    $resolved_ip4 = inet_ntop(AF_INET, $host);
	} elsif ($family == AF_INET6 && !defined($resolved_ip6)) {
	    $resolved_ip6 = inet_ntop(AF_INET6, $host);
	}

	last if defined($resolved_ip4) && defined($resolved_ip6);
    }

    # corosync_strategy specifies the order in which IP addresses are resolved
    # by corosync. We need to match that order, to ensure we create firewall
    # rules for the correct address family.
    if ($corosync_strategy eq "ipv4") {
	$resolved_ip = $resolved_ip4;
    } elsif ($corosync_strategy eq "ipv6") {
	$resolved_ip = $resolved_ip6;
    } elsif ($corosync_strategy eq "ipv6-4") {
	$resolved_ip = $resolved_ip6 // $resolved_ip4;
    } elsif ($corosync_strategy eq "ipv4-6") {
	$resolved_ip = $resolved_ip4 // $resolved_ip6;
    }

    return $match_ip_and_version->($resolved_ip);
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
	log_pass("all packages uptodate");
    }

    print "\nChecking proxmox-ve package version..\n";
    if (defined(my $proxmox_ve = $get_pkg->('proxmox-ve'))) {
	my $min_pve_ver = "$min_pve_major.$min_pve_minor-$min_pve_pkgrel";

	my ($maj, $min, $pkgrel) = $proxmox_ve->{OldVersion} =~ m/^(\d+)\.(\d+)-(\d+)/;

	my $upgraded = 0;

	if ($maj > $min_pve_major) {
	    log_pass("already upgraded to Proxmox VE " . ($min_pve_major + 1));
	    $upgraded = 1;
	} elsif ($maj >= $min_pve_major && $min >= $min_pve_minor && $pkgrel >= $min_pve_pkgrel) {
	    log_pass("proxmox-ve package has version >= $min_pve_ver");
	} else {
	    log_fail("proxmox-ve package is too old, please upgrade to >= $min_pve_ver!");
	}

	my ($krunning, $kinstalled) = (qr/5\./, 'pve-kernel-5.0');
	if (!$upgraded) {
	    ($krunning, $kinstalled) = (qr/4\.15/, 'pve-kernel-4.15');
	}

	print "\nChecking running kernel version..\n";
	my $kernel_ver = $proxmox_ve->{RunningKernel};
	if (!defined($kernel_ver)) {
	    log_fail("unable to determine running kernel version.");
	} elsif ($kernel_ver =~ /^$krunning/) {
	    log_pass("expected running kernel '$kernel_ver'.");
	} elsif ($get_pkg->($kinstalled)) {
	    log_warn("expected kernel '$kinstalled' intalled but not yet rebooted!");
	} else {
	    log_warn("unexpected running and installed kernel '$kernel_ver'.");
	}

    }
    print "\nChecking for installed Debian Kernel..\n";
    if(my $apt_cache = AptPkg::Cache->new()) {
	my $p = $apt_cache->{'linux-image-amd64'};
	if ($p && $p->{SelectedState} eq 'Install') {
	    log_fail("Stock Debian kernel package installed. Please remove package 'linux-image-amd64'.");
	} else {
	    log_pass("Stock Debian kernel package not installed.");
	}

    } else {
	log_fail("unable to initialize AptPkg::Cache\n");
    }
}

sub get_vms_with_vmx {
    my $res = {
	cpu => [],
	flag => [],
    };
    my $vmlist = PVE::QemuServer::vzlist();

    foreach my $vmid ( sort { $a <=> $b } keys %$vmlist ) {
	my $pid = $vmlist->{$vmid}->{pid};
	next if !$pid; # skip not running vms

	my $cmdline = eval { PVE::Tools::file_get_contents("/proc/$pid/cmdline") };
	if ($cmdline) {
	    my @args = split(/\0/, $cmdline);
	    for (my $i = 0; $i < scalar(@args); $i++) {
		next if !$args[$i] || $args[$i] !~ m/^-?-cpu$/;

		my $cpuarg = $args[$i+1];
		if ($cpuarg =~ m/^(host|max)/) {
		    push @{$res->{cpu}}, $vmid;
		} elsif ($cpuarg =~ m/\+(vmx|svm)/) {
		    push @{$res->{flag}}, $vmid;
		}
	    }
	}
    }

    $res = undef if (scalar(@{$res->{cpu}}) + scalar(@{$res->{flag}})) <= 0;

    return $res;
}

sub check_kvm_nested {
    log_info("Checking KVM nesting support, which breaks live migration for VMs using it..");

    my $module_sysdir = "/sys/module";
    if (-e "$module_sysdir/kvm_amd") {
	$module_sysdir .= "/kvm_amd/parameters";
    } elsif (-e "$module_sysdir/kvm_intel") {
	$module_sysdir .= "/kvm_intel/parameters";
    } else {
	log_skip("no kvm module found");
	return;
    }

    if (-f "$module_sysdir/nested") {
	my $val = eval { PVE::Tools::file_read_firstline("$module_sysdir/nested") };
	if ($val && $val =~ m/Y|1/) {
	    my $list = get_vms_with_vmx();
	    if (!defined($list)) {
		log_pass("KVM nested parameter set, but currently no VM with a 'vmx' or 'svm' flag is running.");
	    } else {
		my $warnmsg = "KVM nested enabled. It will not be possible to live migrate the following running VMs to PVE 6:\n";
		if (@{$list->{cpu}}) {
		    $warnmsg .= "  VMID(s) with cputype 'host' or 'max': " . join(',', @{$list->{cpu}}) . "\n";
		}
		if (@{$list->{flag}}) {
		    $warnmsg .= "  VMID(s) with enforced cpu flag 'vmx' or 'svm': " . join(',', @{$list->{flag}}) . "\n";
		}
		log_warn($warnmsg);
	    }
	} else {
	    log_pass("KVM nested parameter not set.")
	}
    } else {
	log_skip("KVM nested parameter not found.");
    }
}

sub check_storage_health {
    print_header("CHECKING CONFIGURED STORAGES");
    my $cfg = PVE::Storage::config();

    my $ctime = time();

    my $info = PVE::Storage::storage_info($cfg);

    foreach my $storeid (keys %$info) {
	my $d = $info->{$storeid};
	if ($d->{enabled}) {
	    if ($d->{type} eq 'sheepdog') {
		log_fail("storage '$storeid' of type 'sheepdog' is enabled - experimental sheepdog support dropped in PVE 6")
	    } elsif ($d->{active}) {
		log_pass("storage '$storeid' enabled and active.");
	    } else {
		log_warn("storage '$storeid' enabled but not active!");
	    }
	} else {
	    log_skip("storage '$storeid' disabled.");
	}
    }
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
	log_fail("unable to get expected number of votes, setting to 0.");
	$expected_votes = 0;
    }
    if (!defined($total_votes)) {
	log_fail("unable to get expected number of votes, setting to 0.");
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
    log_warn("cluster consists of less than three nodes!")
	if $conf_nodelist_count < 3 && $conf_nodelist_count + $qdevice_votes < 3;

    log_fail("corosync.conf ($conf_nodelist_count) and pmxcfs ($cfs_nodelist_count) don't agree about size of nodelist.")
	if $conf_nodelist_count != $cfs_nodelist_count;

    print "\nChecking nodelist entries..\n";
    foreach my $cs_node (keys %$conf_nodelist) {
	my $entry = $conf_nodelist->{$cs_node};
	log_fail("$cs_node: no name entry in corosync.conf.")
	    if !defined($entry->{name});
	log_fail("$cs_node: no nodeid configured in corosync.conf.")
	    if !defined($entry->{nodeid});
	log_fail("$cs_node: neither ring0_addr nor ring1_addr defined in corosync.conf.")
	    if !defined($entry->{ring0_addr}) && !defined($entry->{ring1_addr});

	my $verify_ring_ip = sub {
	    my $key = shift;
	    my $ring = $entry->{$key};
	    if (defined($ring)) {
		my ($resolved_ip, undef) = $resolve_hostname_like_corosync->($ring, $conf);
		if (defined($resolved_ip)) {
		    if ($resolved_ip ne $ring) {
			log_warn("$cs_node: $key '$ring' resolves to '$resolved_ip'.\n Consider replacing it with the currently resolved IP address.");
		    } else {
			log_pass("$cs_node: $key is configured to use IP address '$ring'");
		    }
		} else {
		    log_fail("$cs_node: unable to resolve $key '$ring' to an IP address according to Corosync's resolve strategy - cluster will potentially fail with Corosync 3.x/kronosnet!");
		}
	    }
	};
	$verify_ring_ip->('ring0_addr');
	$verify_ring_ip->('ring1_addr');
    }

    print "\nChecking totem settings..\n";
    my $totem = $conf->{main}->{totem};
    my $transport = $totem->{transport};
    if (defined($transport)) {
	if ($transport ne 'knet') {
	    log_fail("Corosync transport explicitly set to '$transport' instead of implicit default!");
	} else {
	    log_pass("Corosync transport set to '$transport'.");
	}
    } else {
	log_pass("Corosync transport set to implicit default.");
    }

    if ((!defined($totem->{secauth}) || $totem->{secauth} ne 'on') && (!defined($totem->{crypto_cipher}) || $totem->{crypto_cipher} eq 'none')) {
	log_fail("Corosync authentication/encryption is not explicitly enabled (secauth / crypto_cipher / crypto_hash)!");
    } else {
	if (defined($totem->{crypto_cipher}) && $totem->{crypto_cipher} eq '3des') {
	    log_fail("Corosync encryption cipher set to '3des', no longer supported in Corosync 3.x!");
	} else {
	    log_pass("Corosync encryption and authentication enabled.");
	}
    }

    print "\n";
    log_info("run 'pvecm status' to get detailed cluster status..");

    print_header("CHECKING INSTALLED COROSYNC VERSION");
    if (defined(my $corosync = $get_pkg->('corosync'))) {
	if ($corosync->{OldVersion} =~ m/^2\./) {
	    log_fail("corosync 2.x installed, cluster-wide upgrade to 3.x needed!");
	} elsif ($corosync->{OldVersion} =~ m/^3\./) {
	    log_pass("corosync 3.x installed.");
	} else {
	    log_fail("unexpected corosync version installed: $corosync->{OldVersion}!");
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
    my $osd_flags = eval { PVE::API2::Ceph->get_flags({ node => $nodename }); };
    my $noout_wanted = 1;
    my $noout = $osd_flags =~ m/noout/ if $osd_flags;

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
		log_warn("Ceph health reported as '$ceph_health'.\n      Use the PVE ".
		  "dashboard or 'ceph -s' to determine the specific issues and try to resolve them.");
	}
    }

    log_info("getting Ceph OSD flags..");
    eval {
	if (!$osd_flags) {
	    log_fail("unable to get Ceph OSD flags!");
	} else {
	    if ($osd_flags =~ m/recovery_deletes/ && $osd_flags =~ m/purged_snapdirs/) {
		log_pass("all PGs have been scrubbed at least once while running Ceph Luminous.");
	    } else {
		log_fail("missing 'recovery_deletes' and/or 'purged_snapdirs' flag, scrub of all PGs required before upgrading to Nautilus!");
	    }
	}
    };

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

	foreach my $service (@$services) {
	    my $name = $service->{name};
	    if (my $service_versions = $ceph_versions->{$service->{key}}) {
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
	}

	my $overall_versions = $ceph_versions->{overall};
	if (!$overall_versions) {
	    log_warn("unable to determine overall Ceph daemon versions!");
	} elsif (keys %$overall_versions == 1) {
	    log_pass("single running overall version detected for all Ceph daemon types.");
	    if ((keys %$overall_versions)[0] =~ /^ceph version 14\./) {
		$noout_wanted = 0;
	    }
	} else {
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
	    log_warn("No 'mon_host' entry found in ceph config.\n  It's recommended to add mon_host with all monitor addresses (without ports) to the global section.");
	} else {
	    log_pass("Found 'mon_host' entry.");
	}

	my $ipv6 = $global->{ms_bind_ipv6} // $global->{"ms bind ipv6"} // $global->{"ms-bind-ipv6"};
	if ($ipv6) {
	    my $ipv4 = $global->{ms_bind_ipv4} // $global->{"ms bind ipv4"} // $global->{"ms-bind-ipv4"};
	    if ($ipv6 eq 'true' && (!defined($ipv4) || $ipv4 ne 'false')) {
		log_warn("'ms_bind_ipv6' is enabled but 'ms_bind_ipv4' is not disabled.\n  Make sure to disable 'ms_bind_ipv4' for ipv6 only clusters, or add an ipv4 network to public/cluster network.");
	    } else {
		log_pass("'ms_bind_ipv6' is enabled and 'ms_bind_ipv4' disabled");
	    }
	} else {
	    log_pass("'ms_bind_ipv6' not enabled");
	}

	if (defined($global->{keyring})) {
	    log_warn("[global] config section contains 'keyring' option, which will prevent services from starting with Nautilus.\n Move 'keyring' option to [client] section instead.");
	} else {
	    log_pass("no 'keyring' option in [global] section found.");
	}

    } else {
	log_warn("Empty ceph config found");
    }

    my $local_ceph_ver = PVE::Ceph::Tools::get_local_version(1);
    if (defined($local_ceph_ver)) {
	if ($local_ceph_ver == 14) {
	    my $scanned_osds = PVE::Tools::dir_glob_regex('/etc/ceph/osd', '^.*\.json$');
	    if (-e '/var/lib/ceph/osd/' && !defined($scanned_osds)) {
		log_warn("local Ceph version is Nautilus, local OSDs detected, but no conversion from ceph-disk to ceph-volume done (yet).");
	    }
	}
    } else {
	log_fail("unable to determine local Ceph version.");
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
    $log_systemd_unit_state->('pvestatd.service');

    my $root_free = PVE::Tools::df('/', 10);
    log_warn("Less than 2G free space on root file system.")
	if defined($root_free) && $root_free->{avail} < 2*1024*1024*1024;

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
	    log_warn("'$fn': certificate's public key type '$type' unknown, check Debian Busters release notes");
	    next;
	}

	if ($size < $check->{minsize}) {
	    log_fail("'$fn', certificate's $check->{name} public key size is less than 2048 bit");
	    $certs_check_failed = 1;
	} else {
	    log_pass("Certificate '$fn' passed Debian Busters security level for TLS connections ($size >= 2048)");
	}
    }

    check_kvm_nested();
}

__PACKAGE__->register_method ({
    name => 'checklist',
    path => 'checklist',
    method => 'GET',
    description => 'Check (pre-/post-)upgrade conditions.',
    parameters => {
	additionalProperties => 0,
	properties => {
	},
    },
    returns => { type => 'null' },
    code => sub {
	my ($param) = @_;

	check_pve_packages();
	check_cluster_corosync();
	check_ceph();
	check_storage_health();
	check_misc();

	print_header("SUMMARY");

	my $total = 0;
	$total += $_ for values %$counters;

	print "TOTAL:    $total\n";
	print colored("PASSED:   $counters->{pass}\n", 'green');
	print "SKIPPED:  $counters->{skip}\n";
	print colored("WARNINGS: $counters->{warn}\n", 'yellow');
	print colored("FAILURES: $counters->{fail}\n", 'red');

	if ($counters->{warn} > 0 || $counters->{fail} > 0) {
	    my $color = $counters->{fail} > 0 ? 'red' : 'yellow';
	    print colored("\nATTENTION: Please check the output for detailed information!\n", $color);
	    print colored("Try to solve the problems one at a time and then run this checklist tool again.\n", $color) if $counters->{fail} > 0;
	}

	return undef;
    }});

our $cmddef = [ __PACKAGE__, 'checklist', [], {}];

# for now drop all unknown params and just check
@ARGV = ();

1;
