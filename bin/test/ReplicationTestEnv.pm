package ReplicationTestEnv;

use strict;
use warnings;
use JSON;
use Clone 'clone';
use File::Basename;

use lib ('.', '../..');

use Data::Dumper;

use PVE::INotify;
use PVE::Cluster;
use PVE::Storage;
use PVE::ReplicationConfig;
use PVE::ReplicationState;
use PVE::API2::Replication;
use PVE::Replication;
use PVE::QemuConfig;
use PVE::LXC::Config;


use Test::MockModule;

our $mocked_nodename = 'node1';

our $mocked_replication_jobs = {};

my $pve_replication_config_module = Test::MockModule->new('PVE::ReplicationConfig');
my $pve_replication_state_module = Test::MockModule->new('PVE::ReplicationState');

our $mocked_vm_configs = {};

our $mocked_ct_configs = {};

my $mocked_get_members = sub {
    return {
	node1 => { online => 1 },
	node2 => { online => 1 },
	node3 => { online => 1 },
    };
};

my $mocked_vmlist = sub {
    my $res = {};

    foreach my $id (keys %$mocked_ct_configs) {
	my $d = $mocked_ct_configs->{$id};
	$res->{$id} = { 'type' => 'lxc', 'node' => $d->{node}, 'version' => 1 };
    }
    foreach my $id (keys %$mocked_vm_configs) {
	my $d = $mocked_vm_configs->{$id};
	$res->{$id} = { 'type' => 'qemu', 'node' => $d->{node}, 'version' => 1 };
    }

    return { 'ids' => $res };
};

my $mocked_get_ssh_info  = sub {
    my ($node, $network_cidr) = @_;

    return { node => $node };
};

my $mocked_ssh_info_to_command = sub {
    my ($info, @extra_options) = @_;

    return ['fake_ssh', $info->{name}, @extra_options];
};

my $statefile = ".mocked_repl_state";

unlink $statefile;
$PVE::ReplicationState::state_path = $statefile;
$PVE::ReplicationState::state_lock = ".mocked_repl_state_lock";
$PVE::API2::Replication::pvesr_lock_path = ".mocked_pvesr_lock";
$PVE::GuestHelpers::lockdir = ".mocked_pve-manager_lock";

if (!mkdir($PVE::GuestHelpers::lockdir) && !$!{EEXIST}) {
    # If we cannot create the guest helper lockdir we'll loop endlessly, so die
    # if it fails.
    die "mkdir($PVE::GuestHelpers::lockdir): $!\n";
}

my $pve_cluster_module = Test::MockModule->new('PVE::Cluster');

my $pve_inotify_module = Test::MockModule->new('PVE::INotify');

my $mocked_qemu_load_conf = sub {
    my ($class, $vmid, $node) = @_;

    $node = $mocked_nodename if !$node;

    my $conf = $mocked_vm_configs->{$vmid};

    die "no such vm '$vmid'" if !defined($conf);
    die "vm '$vmid' on wrong node" if $conf->{node} ne $node;

    return $conf;
};

my $pve_qemuserver_module = Test::MockModule->new('PVE::QemuServer');

my $pve_qemuconfig_module = Test::MockModule->new('PVE::QemuConfig');

my $mocked_lxc_load_conf = sub {
    my ($class, $vmid, $node) = @_;

    $node = $mocked_nodename if !$node;

    my $conf = $mocked_ct_configs->{$vmid};

    die "no such ct '$vmid'" if !defined($conf);
    die "ct '$vmid' on wrong node" if $conf->{node} ne $node;

    return $conf;
};

my $pve_lxc_config_module = Test::MockModule->new('PVE::LXC::Config');

my $mocked_replication_config_new = sub {

    my $res = clone($mocked_replication_jobs);

    return bless { ids => $res }, 'PVE::ReplicationConfig';
};

my $mocked_storage_config = {
    ids => {
	local => {
	    type => 'dir',
	    shared => 0,
	    content => {
		'iso' => 1,
		'backup' => 1,
	    },
	    path => "/var/lib/vz",
	},
	'local-zfs' => {
	    type => 'zfspool',
	    pool => 'nonexistent-testpool',
	    shared => 0,
	    content => {
		'images' => 1,
		'rootdir' => 1
	    },
	},
    },
};

my $pve_storage_module = Test::MockModule->new('PVE::Storage');

my $mocked_storage_content = {};

sub register_mocked_volid {
    my ($volid, $snapname) = @_;

    my ($storeid, $volname) = PVE::Storage::parse_volume_id($volid);
    my $scfg = $mocked_storage_config->{ids}->{$storeid} ||
	die "no such storage '$storeid'\n";

    my $d = $mocked_storage_content->{$storeid}->{$volname} //= {};

    $d->{$snapname} = 1 if $snapname;
}

my $mocked_volume_snapshot_list = sub {
    my ($cfg, $volid, $prefix) = @_;

    my ($storeid, $volname) = PVE::Storage::parse_volume_id($volid);
    my $snaps = [];

    if (my $d = $mocked_storage_content->{$storeid}->{$volname}) {
	$snaps = [keys %$d];
    }

    return $snaps;
};

my $mocked_volume_snapshot = sub {
    my ($cfg, $volid, $snap) = @_;

    my ($storeid, $volname) = PVE::Storage::parse_volume_id($volid);

    my $d = $mocked_storage_content->{$storeid}->{$volname};
    die "no such volid '$volid'\n" if !$d;
    $d->{$snap} = 1;
};

my $mocked_volume_snapshot_delete = sub {
    my ($cfg, $volid, $snap, $running) = @_;

    my ($storeid, $volname) = PVE::Storage::parse_volume_id($volid);
    my $d = $mocked_storage_content->{$storeid}->{$volname};
    die "no such volid '$volid'\n" if !$d;
    delete $d->{$snap} || die "no such snapshot '$snap' on '$volid'\n";
};

my $pve_replication_module = Test::MockModule->new('PVE::Replication');

my $mocked_job_logfile_name = sub {
    my ($jobid) = @_;

    return ".mocked_replication_log_$jobid";
};

my $mocked_log_time = 0;

my $mocked_get_log_time = sub {
    return $mocked_log_time;
};

sub setup {
    $pve_replication_state_module->mock(job_logfile_name => $mocked_job_logfile_name);
    $pve_replication_module->mock(get_log_time => $mocked_get_log_time);

    $pve_storage_module->mock(config => sub { return $mocked_storage_config; });
    $pve_storage_module->mock(volume_snapshot_list => $mocked_volume_snapshot_list);
    $pve_storage_module->mock(volume_snapshot => $mocked_volume_snapshot);
    $pve_storage_module->mock(volume_snapshot_delete => $mocked_volume_snapshot_delete);

    $pve_replication_config_module->mock(new => $mocked_replication_config_new);
    $pve_qemuserver_module->mock(check_running => sub { return 0; });
    $pve_qemuconfig_module->mock(load_config => $mocked_qemu_load_conf);

    $pve_lxc_config_module->mock(load_config => $mocked_lxc_load_conf);


    $pve_cluster_module->mock(
	get_ssh_info => $mocked_get_ssh_info,
	ssh_info_to_command => $mocked_ssh_info_to_command,
	get_vmlist => sub { return $mocked_vmlist->(); },
	get_members => $mocked_get_members,
	cfs_update => sub {});
    $pve_inotify_module->mock('nodename' => sub { return $mocked_nodename; });
};

# code to generate/conpare test logs

my $logname;
my $logfh;

sub openlog {
    my ($filename) = @_;

    if (!$filename) {
	# compute from $0
	$filename = basename($0);
	if ($filename =~ m/^(\S+)\.pl$/) {
	    $filename = "$1.log";
	} else {
	    die "unable to compute log name for $0";
	}
    }

    die "log already open" if defined($logname);

    open (my $fh, ">", "$filename.tmp") ||
	die "unable to open log  - $!";

    $logname = $filename;
    $logfh = $fh;
}

sub commit_log {

    close($logfh);

    if (-f $logname) {
	my $diff = `diff -u '$logname' '$logname.tmp'`;
	if ($diff) {
	    warn "got unexpeted output\n";
	    print "# diff -u '$logname' '$logname.tmp'\n";
	    print $diff;
	    exit(-1);
	}
    } else {
	rename("$logname.tmp", $logname) || die "rename log failed - $!";
    }
}

my $status;

# helper to track job status
sub track_jobs {
    my ($ctime) = @_;

    $mocked_log_time = $ctime;

    my $logmsg = sub {
	my ($msg) = @_;

	print "$msg\n";
	print $logfh "$msg\n";
    };

    if (!$status) {
	$status = PVE::ReplicationState::job_status();
	foreach my $jobid (sort keys %$status) {
	    my $jobcfg = $status->{$jobid};
	    $logmsg->("$ctime $jobid: new job next_sync => $jobcfg->{next_sync}");
	}
    }

    PVE::API2::Replication::run_jobs($ctime, $logmsg, 1);

    my $new = PVE::ReplicationState::job_status();

    # detect removed jobs
    foreach my $jobid (sort keys %$status) {
	if (!$new->{$jobid}) {
	    $logmsg->("$ctime $jobid: vanished job");
	}
    }

    foreach my $jobid (sort keys %$new) {
	my $jobcfg = $new->{$jobid};
	my $oldcfg = $status->{$jobid};
	if (!$oldcfg) {
	    $logmsg->("$ctime $jobid: new job next_sync => $jobcfg->{next_sync}");
	    next; # no old state to compare
	} else {
	    foreach my $k (qw(target guest vmtype next_sync)) {
		my $changes = '';
		if ($oldcfg->{$k} ne $jobcfg->{$k}) {
		    $changes .= ', ' if $changes;
		    $changes .= "$k => $jobcfg->{$k}";
		}
		$logmsg->("$ctime $jobid: changed config $changes") if $changes;
	    }
	}

	my $oldstate = $oldcfg->{state};

	my $state = $jobcfg->{state};

	my $changes = '';
	foreach my $k (qw(last_node last_try last_sync fail_count error)) {
	    if (($oldstate->{$k} // '') ne ($state->{$k} // '')) {
		my $value = $state->{$k} // '';
		chomp $value;
		$changes .= ', ' if $changes;
		$changes .= "$k => $value";
	    }
	}
	$logmsg->("$ctime $jobid: changed state $changes") if $changes;

	my $old_storeid_list = $oldstate->{storeid_list};
	my $storeid_list = $state->{storeid_list};

	my $storeid_list_changes = 0;
	foreach my $storeid (@$storeid_list) {
	    next if grep { $_ eq $storeid } @$old_storeid_list;
	    $storeid_list_changes = 1;
	}

	foreach my $storeid (@$old_storeid_list) {
	    next if grep { $_ eq $storeid } @$storeid_list;
	    $storeid_list_changes = 1;
	}

	$logmsg->("$ctime $jobid: changed storeid list " . join(',', @$storeid_list))
	    if $storeid_list_changes;
    }
    $status = $new;
}


1;
