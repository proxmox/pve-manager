package PVE::Service::pvestatd;

use strict;
use warnings;

use PVE::SafeSyslog;
use PVE::Daemon;

use Time::HiRes qw (gettimeofday);
use PVE::Tools qw(dir_glob_foreach file_read_firstline);
use PVE::ProcFSTools;
use PVE::CpuSet;
use Filesys::Df;
use PVE::INotify;
use PVE::Network;
use PVE::Cluster qw(cfs_read_file);
use PVE::Storage;
use PVE::QemuServer;
use PVE::LXC;
use PVE::LXC::Config;
use PVE::RPCEnvironment;
use PVE::API2::Subscription;
use PVE::AutoBalloon;

use PVE::Status::Plugin;
use PVE::Status::Graphite;
use PVE::Status::InfluxDB;

PVE::Status::Graphite->register();
PVE::Status::InfluxDB->register();
PVE::Status::Plugin->init();

use base qw(PVE::Daemon);

my $opt_debug;
my $restart_request;

my $nodename = PVE::INotify::nodename();

my $cmdline = [$0, @ARGV];

my %daemon_options = (restart_on_error => 5, stop_wait_time => 5);
my $daemon = __PACKAGE__->new('pvestatd', $cmdline, %daemon_options);

sub init {
    my ($self) = @_;

    $opt_debug = $self->{debug};

    PVE::Cluster::cfs_update();
}

sub shutdown {
    my ($self) = @_;

    syslog('info' , "server closing");

    # wait for children
    1 while (waitpid(-1, POSIX::WNOHANG()) > 0);

    $self->exit_daemon(0);
}

sub hup {
    my ($self) = @_;

    $restart_request = 1;
}

my $generate_rrd_string = sub {
    my ($data) = @_;

    return join(':', map { $_ // 'U' } @$data);
};

sub update_node_status {
    my ($status_cfg) = @_;

    my ($avg1, $avg5, $avg15) = PVE::ProcFSTools::read_loadavg();

    my $stat = PVE::ProcFSTools::read_proc_stat();

    my $netdev = PVE::ProcFSTools::read_proc_net_dev();

    my ($uptime) = PVE::ProcFSTools::read_proc_uptime();

    my $cpuinfo = PVE::ProcFSTools::read_cpuinfo();

    my $maxcpu = $cpuinfo->{cpus}; 

    my $subinfo = PVE::INotify::read_file('subscription');
    my $sublevel = $subinfo->{level} || '';

    # traffic from/to physical interface cards
    my $netin = 0;
    my $netout = 0;
    foreach my $dev (keys %$netdev) {
	next if $dev !~ m/^$PVE::Network::PHYSICAL_NIC_RE$/;
	$netin += $netdev->{$dev}->{receive};
	$netout += $netdev->{$dev}->{transmit};
    }
 
    my $meminfo = PVE::ProcFSTools::read_meminfo();

    my $dinfo = df('/', 1);     # output is bytes

    my $ctime = time();

    # everything not free is considered to be used
    my $dused = $dinfo->{blocks} - $dinfo->{bfree};

    my $data = $generate_rrd_string->(
	[$uptime, $sublevel, $ctime, $avg1, $maxcpu, $stat->{cpu}, $stat->{wait},
	 $meminfo->{memtotal}, $meminfo->{memused},
	 $meminfo->{swaptotal}, $meminfo->{swapused},
	 $dinfo->{blocks}, $dused, $netin, $netout]);

    PVE::Cluster::broadcast_rrd("pve2-node/$nodename", $data);

    foreach my $id (keys %{$status_cfg->{ids}}) {
	my $plugin_config = $status_cfg->{ids}->{$id};
	next if $plugin_config->{disable};
	my $plugin = PVE::Status::Plugin->lookup($plugin_config->{type});

	my $d = {};
	$d->{uptime} = $uptime;
	$d->{cpustat} = $stat;
	$d->{cpustat}->{avg1} = $avg1;
	$d->{cpustat}->{avg5} = $avg5;
	$d->{cpustat}->{avg15} = $avg15;
	$d->{cpustat}->{cpus} = $maxcpu;
	$d->{memory} = $meminfo;
	$d->{blockstat} = $dinfo;
	$d->{nics} = $netdev;

	$plugin->update_node_status($plugin_config, $nodename, $d, $ctime);
    }
}

sub auto_balloning {
    my ($vmstatus) =  @_;

    my $log = sub {
       return if !$opt_debug;
       print @_;
    };

    my $hostmeminfo = PVE::ProcFSTools::read_meminfo();

    # to debug, run 'pvestatd -d' and set  memtotal here
    #$hostmeminfo->{memtotal} = int(2*1024*1024*1024/0.8); # you can set this to test

    my $hostfreemem = $hostmeminfo->{memtotal} - $hostmeminfo->{memused};

    # we try to use about 80% host memory
    # goal: we want to change memory usage by this amount (positive or negative)
    my $goal = int($hostmeminfo->{memtotal}*0.8 - $hostmeminfo->{memused});

    my $maxchange = 100*1024*1024;
    my $res = PVE::AutoBalloon::compute_alg1($vmstatus, $goal, $maxchange);
 
    &$log("host goal: $goal free: $hostfreemem total: $hostmeminfo->{memtotal}\n");

    foreach my $vmid (keys %$vmstatus) {
	next if !$res->{$vmid};
	my $d = $vmstatus->{$vmid};
	my $diff = int($res->{$vmid} - $d->{balloon});
	my $absdiff = $diff < 0 ? -$diff : $diff;
	if ($absdiff > 0) {
	    &$log("BALLOON $vmid to $res->{$vmid} ($diff)\n");
	    eval {
		PVE::QemuServer::vm_mon_cmd($vmid, "balloon", 
					    value => int($res->{$vmid}));
	    };
	    warn $@ if $@;
	}
    }
}

sub update_qemu_status {
    my ($status_cfg) = @_;

    my $ctime = time();

    my $vmstatus = PVE::QemuServer::vmstatus(undef, 1);

    eval { auto_balloning($vmstatus); };
    syslog('err', "auto ballooning error: $@") if $@;

    foreach my $vmid (keys %$vmstatus) {
	my $d = $vmstatus->{$vmid};
	my $data;
	my $status = $d->{qmpstatus} || $d->{status} || 'stopped';
	my $template = $d->{template} ? $d->{template} : "0";
	if ($d->{pid}) { # running
	    $data = $generate_rrd_string->(
		[$d->{uptime}, $d->{name}, $status, $template, $ctime, $d->{cpus}, $d->{cpu},
		 $d->{maxmem}, $d->{mem}, $d->{maxdisk}, $d->{disk},
		 $d->{netin}, $d->{netout}, $d->{diskread}, $d->{diskwrite}]);
	} else {
	    $data = $generate_rrd_string->(
		[0, $d->{name}, $status, $template, $ctime, $d->{cpus}, undef,
		 $d->{maxmem}, undef, $d->{maxdisk}, $d->{disk}, undef, undef, undef, undef]);
	}
	PVE::Cluster::broadcast_rrd("pve2.3-vm/$vmid", $data);

	foreach my $id (keys %{$status_cfg->{ids}}) {
	    my $plugin_config = $status_cfg->{ids}->{$id};
	    next if $plugin_config->{disable};
	    my $plugin = PVE::Status::Plugin->lookup($plugin_config->{type});
	    $plugin->update_qemu_status($plugin_config, $vmid, $d, $ctime, $nodename);
	}
    }
}

sub remove_stale_lxc_consoles {

    my $vmstatus = PVE::LXC::vmstatus();
    my $pidhash = PVE::LXC::find_lxc_console_pids();

    foreach my $vmid (keys %$pidhash) {
	next if defined($vmstatus->{$vmid});
	syslog('info', "remove stale lxc-console for CT $vmid");
	foreach my $pid (@{$pidhash->{$vmid}}) {
	    kill(9, $pid);
	}
    }
}

my $rebalance_error_count = {};

sub rebalance_lxc_containers {

    return if !-d '/sys/fs/cgroup/cpuset/lxc'; # nothing to do...

    my $all_cpus = PVE::CpuSet->new_from_cgroup('lxc', 'effective_cpus');
    my @allowed_cpus = $all_cpus->members();
    my $cpucount = scalar(@allowed_cpus);
    my $max_cpuid = $allowed_cpus[-1];

    my @cpu_ctcount = (0) x ($max_cpuid+1);
    my @balanced_cts;

    my $modify_cpuset = sub {
	my ($vmid, $cpuset, $newset) = @_;

	if (!$rebalance_error_count->{$vmid}) {
	    syslog('info', "modified cpu set for lxc/$vmid: " .
		   $newset->short_string());
	}

	eval {

	    if (-d "/sys/fs/cgroup/cpuset/lxc/$vmid/ns") {
		# allow all, so that we can set new cpuset in /ns
		$all_cpus->write_to_cgroup("lxc/$vmid");
		eval {
		    $newset->write_to_cgroup("lxc/$vmid/ns");
		};
		if (my $err = $@) {
		    warn $err if !$rebalance_error_count->{$vmid}++;
		    # restore original
		    $cpuset->write_to_cgroup("lxc/$vmid");
		} else {
		    # also apply to container root cgroup
		    $newset->write_to_cgroup("lxc/$vmid");
		    $rebalance_error_count->{$vmid} = 0;
		}
	    } else {
		# old style container
		$newset->write_to_cgroup("lxc/$vmid");
		$rebalance_error_count->{$vmid} = 0;
	    }
	};
	if (my $err = $@) {
	    warn $err if !$rebalance_error_count->{$vmid}++;
	}
    };

    my $ctlist = PVE::LXC::config_list();

    foreach my $vmid (sort keys %$ctlist) {
	next if ! -d "/sys/fs/cgroup/cpuset/lxc/$vmid";

	my ($conf, $cpuset);
	eval {

	    $conf = PVE::LXC::Config->load_config($vmid);

	    $cpuset = PVE::CpuSet->new_from_cgroup("lxc/$vmid");
	};
	if (my $err = $@) {
	    warn $err;
	    next;
	}

	my @cpuset_members = $cpuset->members();

	if (!PVE::LXC::Config->has_lxc_entry($conf, 'lxc.cgroup.cpuset.cpus')) {

	    my $cores = $conf->{cores} || $cpucount;
	    $cores = $cpucount if $cores > $cpucount;

	    # see if the number of cores was hot-reduced or
	    # hasn't been enacted at all yet
	    my $newset = PVE::CpuSet->new();
	    if ($cores <  scalar(@cpuset_members)) {
		for (my $i = 0; $i < $cores; $i++) {
		    $newset->insert($cpuset_members[$i]);
		}
	    } elsif ($cores > scalar(@cpuset_members)) {
		my $count = $newset->insert(@cpuset_members);
		foreach my $cpu (@allowed_cpus) {
		    $count += $newset->insert($cpu);
		    last if $count >= $cores;
		}
	    } else {
		$newset->insert(@cpuset_members);
	    }

	    # Apply hot-plugged changes if any:
	    if (!$newset->is_equal($cpuset)) {
		@cpuset_members = $newset->members();
		$modify_cpuset->($vmid, $cpuset, $newset);
	    }

	    # Note: no need to rebalance if we already use all cores
	    push @balanced_cts, [$vmid, $cores, $newset]
		if defined($conf->{cores}) && ($cores != $cpucount);
	}

	foreach my $cpu (@cpuset_members) {
	    $cpu_ctcount[$cpu]++ if $cpu <= $max_cpuid;
	}
    }

    my $find_best_cpu = sub {
	my ($cpulist, $cpu) = @_;

	my $cur_cost = $cpu_ctcount[$cpu];
	my $cur_cpu = $cpu;

	foreach my $candidate (@$cpulist) {
	    my $cost = $cpu_ctcount[$candidate];
	    if ($cost < ($cur_cost -1)) {
		$cur_cost = $cost;
		$cur_cpu = $candidate;
	    }
	}

	return $cur_cpu;
    };

    foreach my $bct (@balanced_cts) {
	my ($vmid, $cores, $cpuset) = @$bct;

	my $newset = PVE::CpuSet->new();

	my $rest = [];
	foreach my $cpu (@allowed_cpus) {
	    next if $cpuset->has($cpu);
	    push @$rest, $cpu;
	}

	my @members = $cpuset->members();
	foreach my $cpu (@members) {
	    my $best =  &$find_best_cpu($rest, $cpu);
	    if ($best != $cpu) {
		$cpu_ctcount[$best]++;
		$cpu_ctcount[$cpu]--;
	    }
	    $newset->insert($best);
	}

	if (!$newset->is_equal($cpuset)) {
	    $modify_cpuset->($vmid, $cpuset, $newset);
	}
    }
}

sub update_lxc_status {
    my ($status_cfg) = @_;

    my $ctime = time();

    my $vmstatus = PVE::LXC::vmstatus();

    foreach my $vmid (keys %$vmstatus) {
	my $d = $vmstatus->{$vmid};
	my $template = $d->{template} ? $d->{template} : "0";
	my $data;
	if ($d->{status} eq 'running') { # running
	    $data = $generate_rrd_string->(
		[$d->{uptime}, $d->{name}, $d->{status}, $template,
		 $ctime, $d->{cpus}, $d->{cpu},
		 $d->{maxmem}, $d->{mem},
		 $d->{maxdisk}, $d->{disk},
		 $d->{netin}, $d->{netout},
		 $d->{diskread}, $d->{diskwrite}]);
	} else {
	    $data = $generate_rrd_string->(
		[0, $d->{name}, $d->{status}, $template, $ctime, $d->{cpus}, undef,
		 $d->{maxmem}, undef, $d->{maxdisk}, $d->{disk}, undef, undef, undef, undef]);
	}
	PVE::Cluster::broadcast_rrd("pve2.3-vm/$vmid", $data);

	foreach my $id (keys %{$status_cfg->{ids}}) {
	    my $plugin_config = $status_cfg->{ids}->{$id};
	    next if $plugin_config->{disable};
	    my $plugin = PVE::Status::Plugin->lookup($plugin_config->{type});
	    $plugin->update_lxc_status($plugin_config, $vmid, $d, $ctime, $nodename);
	}
    }
}

sub update_storage_status {
    my ($status_cfg) = @_;

    my $cfg = PVE::Storage::config();

    my $ctime = time();

    my $info = PVE::Storage::storage_info($cfg);

    foreach my $storeid (keys %$info) {
	my $d = $info->{$storeid};
	next if !$d->{active};

	my $data = $generate_rrd_string->([$ctime, $d->{total}, $d->{used}]);

	my $key = "pve2-storage/${nodename}/$storeid";
	PVE::Cluster::broadcast_rrd($key, $data);

	foreach my $id (keys %{$status_cfg->{ids}}) {
	    my $plugin_config = $status_cfg->{ids}->{$id};
	    next if $plugin_config->{disable};
	    my $plugin = PVE::Status::Plugin->lookup($plugin_config->{type});
	    $plugin->update_storage_status($plugin_config, $nodename, $storeid, $d, $ctime);
	}
    }
}

sub update_status {

    # update worker list. This is not really required and
    # we just call this to make sure that we have a correct
    # list in case of an unexpected crash.
    my $rpcenv = PVE::RPCEnvironment::get();

    eval {
	my $tlist = $rpcenv->active_workers();
	PVE::Cluster::broadcast_tasklist($tlist);
    };
    my $err = $@;
    syslog('err', $err) if $err;

    my $status_cfg = PVE::Cluster::cfs_read_file('status.cfg');

    eval {
	update_node_status($status_cfg);
    };
    $err = $@;
    syslog('err', "node status update error: $err") if $err;

    eval {
	update_qemu_status($status_cfg);
    };
    $err = $@;
    syslog('err', "qemu status update error: $err") if $err;

    eval {
	update_lxc_status($status_cfg);
    };
    $err = $@;
    syslog('err', "lxc status update error: $err") if $err;

    eval {
	rebalance_lxc_containers();
    };
    $err = $@;
    syslog('err', "lxc cpuset rebalance error: $err") if $err;

    eval {
	update_storage_status($status_cfg);
    };
    $err = $@;
    syslog('err', "storage status update error: $err") if $err;

    eval {
	remove_stale_lxc_consoles();
    };
    $err = $@;
    syslog('err', "lxc console cleanup error: $err") if $err;
}

my $next_update = 0;

# do not update directly after startup, because install scripts
# have a problem with that
my $cycle = 0; 
my $updatetime = 10;

my $initial_memory_usage;

sub run {
    my ($self) = @_;

    for (;;) { # forever

 	$next_update = time() + $updatetime;

	if ($cycle) {
	    my ($ccsec, $cusec) = gettimeofday ();
	    eval {
		# syslog('info', "start status update");
		PVE::Cluster::cfs_update();
		update_status();
	    };
	    my $err = $@;

	    if ($err) {
		syslog('err', "status update error: $err");
	    }

	    my ($ccsec_end, $cusec_end) = gettimeofday ();
	    my $cptime = ($ccsec_end-$ccsec) + ($cusec_end - $cusec)/1000000;

	    syslog('info', sprintf("status update time (%.3f seconds)", $cptime))
		if ($cptime > 5);
	}

	$cycle++;

	my $mem = PVE::ProcFSTools::read_memory_usage();

	if (!defined($initial_memory_usage) || ($cycle < 10)) {
	    $initial_memory_usage = $mem->{resident};
	} else {
	    my $diff = $mem->{resident} - $initial_memory_usage;
	    if ($diff > 5*1024*1024) {
		syslog ('info', "restarting server after $cycle cycles to " .
			"reduce memory usage (free $mem->{resident} ($diff) bytes)");
		$self->restart_daemon();
	    }
	}

	my $wcount = 0;
	while ((time() < $next_update) && 
	       ($wcount < $updatetime) && # protect against time wrap
	       !$restart_request) { $wcount++; sleep (1); };

	$self->restart_daemon() if $restart_request;
    }
}

$daemon->register_start_command();
$daemon->register_restart_command(1);
$daemon->register_stop_command();
$daemon->register_status_command();

our $cmddef = {
    start => [ __PACKAGE__, 'start', []],
    restart => [ __PACKAGE__, 'restart', []],
    stop => [ __PACKAGE__, 'stop', []],
    status => [ __PACKAGE__, 'status', [], undef, sub { print shift . "\n";} ],
};

1;





