package ReplicationTestEnv;

use strict;
use warnings;
use JSON;

use lib ('.', '../..');

use Data::Dumper;

use PVE::INotify;
use PVE::Cluster;
use PVE::Storage;
use PVE::Replication;
use PVE::QemuConfig;
use PVE::LXC::Config;

use Test::MockModule;

our $mocked_nodename = 'node1';

our $mocked_replication_jobs = {};

my $pve_replicationconfig = Test::MockModule->new('PVE::ReplicationConfig');

our $mocked_vm_configs = {};

our $mocked_ct_configs = {};

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


my $statefile = ".mocked_repl_state";

unlink $statefile;
$PVE::Replication::state_path = $statefile;

my $mocked_write_state = sub {
    my ($state) = @_;

    PVE::Tools::file_set_contents($statefile, encode_json($state));
};

my $mocked_read_state = sub {

    return {} if ! -e $statefile;

    my $raw = PVE::Tools::file_get_contents($statefile);

    return {} if $raw eq '';

    return decode_json($raw);
};


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

my $mocked_replication_config = sub {

    my $res = $mocked_replication_jobs;
    
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
 
sub setup {
    $pve_storage_module->mock(config => sub { return $mocked_storage_config; });

    $pve_replicationconfig->mock(new => $mocked_replication_config);    
    $pve_qemuserver_module->mock(check_running => sub { return 0; });
    $pve_qemuconfig_module->mock(load_config => $mocked_qemu_load_conf);

    $pve_lxc_config_module->mock(load_config => $mocked_lxc_load_conf);


    $pve_cluster_module->mock(get_vmlist => sub { return $mocked_vmlist->(); });
    $pve_inotify_module->mock('nodename' => sub { return $mocked_nodename; });
};



1;
