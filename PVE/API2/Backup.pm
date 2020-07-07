package PVE::API2::Backup;

use strict;
use warnings;
use Digest::SHA;

use PVE::SafeSyslog;
use PVE::Tools qw(extract_param);
use PVE::Cluster qw(cfs_lock_file cfs_read_file cfs_write_file);
use PVE::RESTHandler;
use PVE::RPCEnvironment;
use PVE::JSONSchema;
use PVE::Storage;
use PVE::Exception qw(raise_param_exc);
use PVE::VZDump;
use PVE::VZDump::Common;

use base qw(PVE::RESTHandler);

PVE::JSONSchema::register_format('pve-day-of-week', \&verify_day_of_week);
sub verify_day_of_week {
    my ($value, $noerr) = @_;

    return $value if $value =~ m/^(mon|tue|wed|thu|fri|sat|sun)$/;

    return undef if $noerr;

    die "invalid day '$value'\n";
}

my $vzdump_job_id_prop = {
    type => 'string',
    description => "The job ID.",
    maxLength => 50
};

__PACKAGE__->register_method({
    name => 'index',
    path => '',
    method => 'GET',
    description => "List vzdump backup schedule.",
    permissions => {
	check => ['perm', '/', ['Sys.Audit']],
    },
    parameters => {
    	additionalProperties => 0,
	properties => {},
    },
    returns => {
	type => 'array',
	items => {
	    type => "object",
	    properties => {
		id => $vzdump_job_id_prop
	    },
	},
	links => [ { rel => 'child', href => "{id}" } ],
    },
    code => sub {
	my ($param) = @_;

	my $rpcenv = PVE::RPCEnvironment::get();
	my $user = $rpcenv->get_user();

	my $data = cfs_read_file('vzdump.cron');

	my $res = $data->{jobs} || [];

	return $res;
    }});

__PACKAGE__->register_method({
    name => 'create_job',
    path => '',
    method => 'POST',
    protected => 1,
    description => "Create new vzdump backup job.",
    permissions => {
	check => ['perm', '/', ['Sys.Modify']],
	description => "The 'tmpdir', 'dumpdir' and 'script' parameters are additionally restricted to the 'root\@pam' user.",
    },
    parameters => {
    	additionalProperties => 0,
	properties => PVE::VZDump::Common::json_config_properties({
	    starttime => {
		type => 'string',
		description => "Job Start time.",
		pattern => '\d{1,2}:\d{1,2}',
		typetext => 'HH:MM',
	    },
	    dow => {
		type => 'string', format => 'pve-day-of-week-list',
		optional => 1,
		description => "Day of week selection.",
		default => 'mon,tue,wed,thu,fri,sat,sun',
	    },
	    enabled => {
		type => 'boolean',
		optional => 1,
		description => "Enable or disable the job.",
		default => '1',
	    },
       }),
    },
    returns => { type => 'null' },
    code => sub {
	my ($param) = @_;

	my $rpcenv = PVE::RPCEnvironment::get();
	my $user = $rpcenv->get_user();

	foreach my $key (qw(tmpdir dumpdir script)) {
	    raise_param_exc({ $key => "Only root may set this option."})
		if defined($param->{$key}) && ($user ne 'root@pam');
	}

	if (my $pool = $param->{pool}) {
	    $rpcenv->check_pool_exist($pool);
	    $rpcenv->check($user, "/pool/$pool", ['VM.Backup']);
	}


	my $create_job = sub {
	    my $data = cfs_read_file('vzdump.cron');

	    $param->{dow} = 'mon,tue,wed,thu,fri,sat,sun' if !defined($param->{dow});
	    $param->{enabled} = 1 if !defined($param->{enabled});
	    PVE::VZDump::verify_vzdump_parameters($param, 1);

	    push @{$data->{jobs}}, $param;

	    cfs_write_file('vzdump.cron', $data);
	};
	cfs_lock_file('vzdump.cron', undef, $create_job);
	die "$@" if ($@);

	return undef;
    }});

__PACKAGE__->register_method({
    name => 'read_job',
    path => '{id}',
    method => 'GET',
    description => "Read vzdump backup job definition.",
    permissions => {
	check => ['perm', '/', ['Sys.Audit']],
    },
    parameters => {
    	additionalProperties => 0,
	properties => {
	    id => $vzdump_job_id_prop
	},
    },
    returns => {
	type => 'object',
    },
    code => sub {
	my ($param) = @_;

	my $rpcenv = PVE::RPCEnvironment::get();
	my $user = $rpcenv->get_user();

	my $data = cfs_read_file('vzdump.cron');

	my $jobs = $data->{jobs} || [];

	foreach my $job (@$jobs) {
	    return $job if $job->{id} eq $param->{id};
	}

	raise_param_exc({ id => "No such job '$param->{id}'" });

    }});

__PACKAGE__->register_method({
    name => 'delete_job',
    path => '{id}',
    method => 'DELETE',
    description => "Delete vzdump backup job definition.",
    permissions => {
	check => ['perm', '/', ['Sys.Modify']],
    },
    protected => 1,
    parameters => {
    	additionalProperties => 0,
	properties => {
	    id => $vzdump_job_id_prop
	},
    },
    returns => { type => 'null' },
    code => sub {
	my ($param) = @_;

	my $rpcenv = PVE::RPCEnvironment::get();
	my $user = $rpcenv->get_user();

	my $delete_job = sub {
	    my $data = cfs_read_file('vzdump.cron');

	    my $jobs = $data->{jobs} || [];
	    my $newjobs = [];

	    my $found;
	    foreach my $job (@$jobs) {
		if ($job->{id} eq $param->{id}) {
		    $found = 1;
		} else {
		    push @$newjobs, $job;
		}
	    }

	    raise_param_exc({ id => "No such job '$param->{id}'" }) if !$found;

	    $data->{jobs} = $newjobs;

	    cfs_write_file('vzdump.cron', $data);
	};
	cfs_lock_file('vzdump.cron', undef, $delete_job);
	die "$@" if ($@);

	return undef;
    }});

__PACKAGE__->register_method({
    name => 'update_job',
    path => '{id}',
    method => 'PUT',
    protected => 1,
    description => "Update vzdump backup job definition.",
    permissions => {
	check => ['perm', '/', ['Sys.Modify']],
    },
    parameters => {
    	additionalProperties => 0,
	properties => PVE::VZDump::Common::json_config_properties({
	    id => $vzdump_job_id_prop,
	    starttime => {
		type => 'string',
		description => "Job Start time.",
		pattern => '\d{1,2}:\d{1,2}',
		typetext => 'HH:MM',
	    },
	    dow => {
		type => 'string', format => 'pve-day-of-week-list',
		optional => 1,
		description => "Day of week selection.",
	    },
	    delete => {
		type => 'string', format => 'pve-configid-list',
		description => "A list of settings you want to delete.",
		optional => 1,
	    },
	    enabled => {
		type => 'boolean',
		optional => 1,
		description => "Enable or disable the job.",
		default => '1',
	    },
       }),
    },
    returns => { type => 'null' },
    code => sub {
	my ($param) = @_;

	my $rpcenv = PVE::RPCEnvironment::get();
	my $user = $rpcenv->get_user();

	foreach my $key (qw(tmpdir dumpdir script)) {
	    raise_param_exc({ $key => "Only root may set this option."})
		if defined($param->{$key}) && ($user ne 'root@pam');
	}


	if (my $pool = $param->{pool}) {
	    $rpcenv->check_pool_exist($pool);
	    $rpcenv->check($user, "/pool/$pool", ['VM.Backup']);
	}

	my $update_job = sub {
	    my $data = cfs_read_file('vzdump.cron');

	    my $jobs = $data->{jobs} || [];

	    die "no options specified\n" if !scalar(keys %$param);

	    PVE::VZDump::verify_vzdump_parameters($param);

	    my @delete = PVE::Tools::split_list(extract_param($param, 'delete'));

	    foreach my $job (@$jobs) {
		if ($job->{id} eq $param->{id}) {

		    foreach my $k (@delete) {
			if (!PVE::VZDump::option_exists($k)) {
			    raise_param_exc({ delete => "unknown option '$k'" });
			}

			delete $job->{$k};
		    }

		    foreach my $k (keys %$param) {
			$job->{$k} = $param->{$k};
		    }

		    $job->{all} = 1 if (defined($job->{exclude}) && !defined($job->{pool}));

		    if (defined($param->{vmid})) {
			delete $job->{all};
			delete $job->{exclude};
			delete $job->{pool};
		    } elsif ($param->{all}) {
			delete $job->{vmid};
			delete $job->{pool};
		    } elsif ($job->{pool}) {
			delete $job->{vmid};
			delete $job->{all};
			delete $job->{exclude};
		    }

		    PVE::VZDump::verify_vzdump_parameters($job, 1);

		    cfs_write_file('vzdump.cron', $data);

		    return undef;
		}
	    }
	    raise_param_exc({ id => "No such job '$param->{id}'" });
	};
	cfs_lock_file('vzdump.cron', undef, $update_job);
	die "$@" if ($@);
    }});

1;
