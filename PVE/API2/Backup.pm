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

use constant ALL_DAYS => 'mon,tue,wed,thu,fri,sat,sun';

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

my $assert_param_permission = sub {
    my ($param, $user) = @_;
    return if $user eq 'root@pam'; # always OK

    for my $key (qw(tmpdir dumpdir script)) {
	raise_param_exc({ $key => "Only root may set this option."}) if exists $param->{$key};
    }
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
		default => ALL_DAYS,
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

	$assert_param_permission->($param, $user);

	if (my $pool = $param->{pool}) {
	    $rpcenv->check_pool_exist($pool);
	    $rpcenv->check($user, "/pool/$pool", ['VM.Backup']);
	}


	my $create_job = sub {
	    my $data = cfs_read_file('vzdump.cron');

	    $param->{dow} = ALL_DAYS if !defined($param->{dow});
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
	description => "The 'tmpdir', 'dumpdir' and 'script' parameters are additionally restricted to the 'root\@pam' user.",
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

	$assert_param_permission->($param, $user);

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

__PACKAGE__->register_method({
    name => 'get_volume_backup_included',
    path => '{id}/included_volumes',
    method => 'GET',
    protected => 1,
    description => "Returns included guests and the backup status of their disks. Optimized to be used in ExtJS tree views.",
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
	description => 'Root node of the tree object. Children represent guests, grandchildren represent volumes of that guest.',
	properties => {
	    children => {
		type => 'array',
		items => {
		    type => 'object',
		    properties => {
			id => {
			    type => 'integer',
			    description => 'VMID of the guest.',
			},
			name => {
			    type => 'string',
			    description => 'Name of the guest',
			    optional => 1,
			},
			type => {
			    type => 'string',
			    description => 'Type of the guest, VM, CT or unknown for removed but not purged guests.',
			    enum => ['qemu', 'lxc', 'unknown'],
			},
			children => {
			    type => 'array',
			    optional => 1,
			    description => 'The volumes of the guest with the information if they will be included in backups.',
			    items => {
				type => 'object',
				properties => {
				    id => {
					type => 'string',
					description => 'Configuration key of the volume.',
				    },
				    name => {
					type => 'string',
					description => 'Name of the volume.',
				    },
				    included => {
					type => 'boolean',
					description => 'Whether the volume is included in the backup or not.',
				    },
				    reason => {
					type => 'string',
					description => 'The reason why the volume is included (or excluded).',
				    },
				},
			    },
			},
		    },
		},
	    },
	},
    },
    code => sub {
	my ($param) = @_;

	my $rpcenv = PVE::RPCEnvironment::get();

	my $user = $rpcenv->get_user();

	my $vzconf = cfs_read_file('vzdump.cron');
	my $all_jobs = $vzconf->{jobs} || [];
	my $job;
	my $rrd = PVE::Cluster::rrd_dump();

	for my $j (@$all_jobs) {
	    if ($j->{id} eq $param->{id}) {
	       $job = $j;
	       last;
	    }
	}
	raise_param_exc({ id => "No such job '$param->{id}'" }) if !$job;

	my $vmlist = PVE::Cluster::get_vmlist();

	my @job_vmids;

	my $included_guests = PVE::VZDump::get_included_guests($job);

	for my $node (keys %{$included_guests}) {
	    my $node_vmids = $included_guests->{$node};
	    push(@job_vmids, @{$node_vmids});
	}

	# remove VMIDs to which the user has no permission to not leak infos
	# like the guest name
	my @allowed_vmids = grep {
		$rpcenv->check($user, "/vms/$_", [ 'VM.Audit' ], 1);
	} @job_vmids;

	my $result = {
	    children => [],
	};

	for my $vmid (@allowed_vmids) {

	    my $children = [];

	    # It's possible that a job has VMIDs configured that are not in
	    # vmlist. This could be because a guest was removed but not purged.
	    # Since there is no more data available we can only deliver the VMID
	    # and no volumes.
	    if (!defined $vmlist->{ids}->{$vmid}) {
		push(@{$result->{children}}, {
		    id => int($vmid),
		    type => 'unknown',
		    leaf => 1,
		});
		next;
	    }

	    my $type = $vmlist->{ids}->{$vmid}->{type};
	    my $node = $vmlist->{ids}->{$vmid}->{node};

	    my $conf;
	    my $volumes;
	    my $name = "";

	    if ($type eq 'qemu') {
		$conf = PVE::QemuConfig->load_config($vmid, $node);
		$volumes = PVE::QemuConfig->get_backup_volumes($conf);
		$name = $conf->{name};
	    } elsif ($type eq 'lxc') {
		$conf = PVE::LXC::Config->load_config($vmid, $node);
		$volumes = PVE::LXC::Config->get_backup_volumes($conf);
		$name = $conf->{hostname};
	    } else {
		die "VMID $vmid is neither Qemu nor LXC guest\n";
	    }

	    foreach my $volume (@$volumes) {
		my $disk = {
		    # id field must be unique for ExtJS tree view
		    id => "$vmid:$volume->{key}",
		    name => $volume->{volume_config}->{file} // $volume->{volume_config}->{volume},
		    included=> $volume->{included},
		    reason => $volume->{reason},
		    leaf => 1,
		};
		push(@{$children}, $disk);
	    }

	    my $leaf = 0;
	    # it's possible for a guest to have no volumes configured
	    $leaf = 1 if !@{$children};

	    push(@{$result->{children}}, {
		    id => int($vmid),
		    type => $type,
		    name => $name,
		    children => $children,
		    leaf => $leaf,
	    });
	}

	return $result;
    }});

1;
