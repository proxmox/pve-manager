#!/usr/bin/perl

# Note: Test replication scheduler

use strict;
use warnings;
use JSON;

use lib ('.', '../..');

use Data::Dumper;

use Test::MockModule;
use ReplicationTestEnv;
use Test::More tests => 1;

use PVE::API2::Replication;

$ReplicationTestEnv::mocked_nodename = 'node1';

my $schedule = [];

my $mocked_replicate = sub {
    my ($guest_class, $jobcfg, $state, $start_time, $logfunc) = @_;

    push @$schedule, {
	id => $jobcfg->{id},
	guest => $jobcfg->{guest},
	vmtype => $jobcfg->{vmtype},
	guest_class => $guest_class,
	last_sync => $state->{last_sync},
	start => $start_time,
    };
};

my $pve_replication_module = Test::MockModule->new('PVE::Replication');
$pve_replication_module->mock(replicate => $mocked_replicate);

$ReplicationTestEnv::mocked_replication_jobs = {
    job_900_to_node2 => {
	'type'  => 'local',
	'target' => 'node2',
	'guest' => 900,
    },
    job_900_to_node1 => {
	'type'  => 'local',
	'target' => 'node1', # local node, job should be skipped
	'guest' => 900,
    },
};

$ReplicationTestEnv::mocked_vm_configs = {
    900 => {
	node => 'node1',
	snapshots => {},
	ide0 => 'local-lvm:vm-900-disk-1,size=4G',
	memory => 512,
	ide2 => 'none,media=cdrom',
    },
};

ReplicationTestEnv::setup();

for (my $i = 0; $i < 61; $i++) {
    PVE::API2::Replication::run_jobs($i*60);
}

#print Dumper($schedule);

my $exptected_schedule = [
    {
	last_sync => 0,
	start => 900,
	vmtype => 'qemu',
	guest_class => 'PVE::QemuConfig',
	id => 'job_900_to_node2',
	guest => 900
    },
    {
	last_sync => 900,
	start => 1800,
	vmtype => 'qemu',
	guest_class => 'PVE::QemuConfig',
	id => 'job_900_to_node2',
	guest => 900,
   },
    {
	last_sync => 1800,
	start => 2700,
	vmtype => 'qemu',
	guest_class => 'PVE::QemuConfig',
	id => 'job_900_to_node2',
	guest => 900
    },
    {
	last_sync => 2700,
	start => 3600,
	vmtype => 'qemu',
	guest_class => 'PVE::QemuConfig',
	id => 'job_900_to_node2',
	guest => 900
    }
];

is_deeply($schedule, $exptected_schedule);

exit(0);
