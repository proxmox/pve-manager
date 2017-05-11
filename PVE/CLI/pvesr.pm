package PVE::CLI::pvesr;

use strict;
use warnings;
use POSIX qw(strftime);
use JSON;

use PVE::JSONSchema qw(get_standard_option);
use PVE::INotify;
use PVE::RPCEnvironment;
use PVE::Tools qw(extract_param);
use PVE::SafeSyslog;
use PVE::CLIHandler;

use PVE::Replication;
use PVE::API2::ReplicationConfig;
use PVE::API2::Replication;

use base qw(PVE::CLIHandler);

my $nodename = PVE::INotify::nodename();

sub setup_environment {
    PVE::RPCEnvironment->setup_default_cli_env();
}

__PACKAGE__->register_method ({
    name => 'run',
    path => 'run',
    method => 'POST',
    description => "This method is called by the systemd-timer and executes all (or a specific) sync jobs.",
    parameters => {
	additionalProperties => 0,
	properties => {
	    id => get_standard_option('pve-replication-id', { optional => 1 }),
	},
    },
    returns => { type => 'null' },
    code => sub {
	my ($param) = @_;

	if (my $id = extract_param($param, 'id')) {

	    PVE::Replication::run_single_job($id);

	} else {

	    PVE::Replication::run_jobs();
	}

	return undef;
    }});

__PACKAGE__->register_method ({
    name => 'enable',
    path => 'enable',
    method => 'POST',
    description => "Enable a replication job.",
    parameters => {
	additionalProperties => 0,
	properties => {
	    id => get_standard_option('pve-replication-id'),
	},
    },
    returns => { type => 'null' },
    code => sub {
	my ($param) = @_;

	$param->{disable} = 0;

	return PVE::API2::ReplicationConfig->update($param);
    }});

__PACKAGE__->register_method ({
    name => 'disable',
    path => 'disable',
    method => 'POST',
    description => "Disable a replication job.",
    parameters => {
	additionalProperties => 0,
	properties => {
	    id => get_standard_option('pve-replication-id'),
	},
    },
    returns => { type => 'null' },
    code => sub {
	my ($param) = @_;

	$param->{disable} = 1;

	return PVE::API2::ReplicationConfig->update($param);
    }});

my $print_job_list = sub {
    my ($list) = @_;

    my $format = "%-20s %10s %-20s %10s %5s %8s\n";

    printf($format, "JobID", "GuestID", "Target", "Interval", "Rate", "Enabled");

    foreach my $job (sort { $a->{guest} <=> $b->{guest} } @$list) {
	my $plugin = PVE::ReplicationConfig->lookup($job->{type});
	my $tid = $plugin->get_unique_target_id($job);

	printf($format, $job->{id}, $job->{guest}, $tid,
	       defined($job->{interval}) ? $job->{interval} : '-',
	       defined($job->{rate}) ? $job->{rate} : '-',
	       $job->{disable} ? 'no' : 'yes'
	    );
    }
};

my $print_job_status = sub {
    my ($list) = @_;

    my $format = "%-20s %10s %-20s %20s %10s %10s %s\n";

    printf($format, "JobID", "GuestID", "Target", "LastSync", "Duration", "FailCount", "State");

    foreach my $job (sort { $a->{guest} <=> $b->{guest} } @$list) {
	my $plugin = PVE::ReplicationConfig->lookup($job->{type});
	my $tid = $plugin->get_unique_target_id($job);

	my $timestr = $job->{last_sync} ?
	    strftime("%Y-%m-%d_%H:%M:%S", localtime($job->{last_sync})) : '-';

	printf($format, $job->{id}, $job->{guest}, $tid,
	       $timestr, $job->{duration} // '-',
	       $job->{fail_count}, , $job->{error} // 'OK');
    }
};

our $cmddef = {
    status => [ 'PVE::API2::Replication', 'status', [], { node => $nodename }, $print_job_status ],

    jobs => [ 'PVE::API2::ReplicationConfig', 'index' , [], {}, $print_job_list ],
    read => [ 'PVE::API2::ReplicationConfig', 'read' , ['id'], {},
	     sub { my $res = shift; print to_json($res, { utf8 => 1, pretty => 1, canonical => 1}); }],
    update => [ 'PVE::API2::ReplicationConfig', 'update' , ['id'], {} ],
    delete => [ 'PVE::API2::ReplicationConfig', 'delete' , ['id'], {} ],
    'create-local-job' => [ 'PVE::API2::ReplicationConfig', 'create' , ['id', 'guest', 'target'],
			    { type => 'local' } ],

    enable => [ __PACKAGE__, 'enable', ['id'], {}],
    disable => [ __PACKAGE__, 'disable', ['id'], {}],

    run => [ __PACKAGE__ , 'run'],
};

1;
