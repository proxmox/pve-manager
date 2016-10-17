package PVE::API2::Backup;

use strict;
use warnings;
use Digest::SHA;

use PVE::SafeSyslog;
use PVE::Tools qw(extract_param);
use PVE::Cluster qw(cfs_register_file cfs_lock_file cfs_read_file cfs_write_file);
use PVE::RESTHandler;
use PVE::RPCEnvironment;
use PVE::JSONSchema;
use PVE::Storage;
use PVE::Exception qw(raise_param_exc);
use PVE::VZDump;

use base qw(PVE::RESTHandler);

cfs_register_file ('vzdump.cron', 
		   \&parse_vzdump_cron_config, 
		   \&write_vzdump_cron_config); 

PVE::JSONSchema::register_format('pve-day-of-week', \&verify_day_of_week);
sub verify_day_of_week {
    my ($value, $noerr) = @_;

    return $value if $value =~ m/^(mon|tue|wed|thu|fri|sat|sun)$/;

    return undef if $noerr;

    die "invalid day '$value'\n";
}


my $dowhash_to_dow = sub {
    my ($d, $num) = @_;

    my @da = ();
    push @da, $num ? 1 : 'mon' if $d->{mon};
    push @da, $num ? 2 : 'tue' if $d->{tue};
    push @da, $num ? 3 : 'wed' if $d->{wed};
    push @da, $num ? 4 : 'thu' if $d->{thu};
    push @da, $num ? 5 : 'fri' if $d->{fri};
    push @da, $num ? 6 : 'sat' if $d->{sat};
    push @da, $num ? 7 : 'sun' if $d->{sun};

    return join ',', @da;
};

# parse crontab style day of week
sub parse_dow {
    my ($dowstr, $noerr) = @_;

    my $dowmap = {mon => 1, tue => 2, wed => 3, thu => 4,
		  fri => 5, sat => 6, sun => 7};
    my $rdowmap = { '1' => 'mon', '2' => 'tue', '3' => 'wed', '4' => 'thu',
		    '5' => 'fri', '6' => 'sat', '7' => 'sun', '0' => 'sun'};

    my $res = {};

    $dowstr = '1,2,3,4,5,6,7' if $dowstr eq '*';

    foreach my $day (PVE::Tools::split_list($dowstr)) {
	if ($day =~ m/^(mon|tue|wed|thu|fri|sat|sun)-(mon|tue|wed|thu|fri|sat|sun)$/i) {
	    for (my $i = $dowmap->{lc($1)}; $i <= $dowmap->{lc($2)}; $i++) {
		my $r = $rdowmap->{$i};
		$res->{$r} = 1;	
	    }
	} elsif ($day =~ m/^(mon|tue|wed|thu|fri|sat|sun|[0-7])$/i) {
	    $day = $rdowmap->{$day} if $day =~ m/\d/;
	    $res->{lc($day)} = 1;
	} else {
	    return undef if $noerr;
	    die "unable to parse day of week '$dowstr'\n";
	}
    }

    return $res;
};

my $vzdump_properties = {
    additionalProperties => 0,
    properties => PVE::VZDump::json_config_properties({}),
};

sub parse_vzdump_cron_config {
    my ($filename, $raw) = @_;

    my $jobs = []; # correct jobs

    my $ejobs = []; # mailfomerd lines

    my $jid = 1; # we start at 1
    
    my $digest = Digest::SHA::sha1_hex(defined($raw) ? $raw : '');

    while ($raw && $raw =~ s/^(.*?)(\n|$)//) {
	my $line = $1;

	next if $line =~ m/^\#/;
	next if $line =~ m/^\s*$/;
	next if $line =~ m/^PATH\s*=/; # we always overwrite path

	if ($line =~ m|^(\d+)\s+(\d+)\s+\*\s+\*\s+(\S+)\s+root\s+(/\S+/)?(#)?vzdump(\s+(.*))?$|) {
	    eval {
		my $minute = int($1);
		my $hour = int($2);
		my $dow = $3;
		my $param = $7;
		my $enabled = $5;

		my $dowhash = parse_dow($dow, 1);
		die "unable to parse day of week '$dow' in '$filename'\n" if !$dowhash;

		my $args = PVE::Tools::split_args($param);
		my $opts = PVE::JSONSchema::get_options($vzdump_properties, $args, 'vmid');

		$opts->{enabled} = !defined($enabled);
		$opts->{id} = "$digest:$jid";
		$jid++;
		$opts->{starttime} = sprintf "%02d:%02d", $hour, $minute;
		$opts->{dow} = &$dowhash_to_dow($dowhash);

		push @$jobs, $opts;
	    };
	    my $err = $@;
	    if ($err) {
		syslog ('err', "parse error in '$filename': $err");
		push @$ejobs, { line => $line };
	    }
	} elsif ($line =~ m|^\S+\s+(\S+)\s+\S+\s+\S+\s+\S+\s+\S+\s+(\S.*)$|) {
	    syslog ('err', "warning: malformed line in '$filename'");
	    push @$ejobs, { line => $line };
	} else {
	    syslog ('err', "ignoring malformed line in '$filename'");
	}
    }

    my $res = {};
    $res->{digest} = $digest;
    $res->{jobs} = $jobs;
    $res->{ejobs} = $ejobs;

    return $res;
}

sub write_vzdump_cron_config {
    my ($filename, $cfg) = @_;

    my $out = "# cluster wide vzdump cron schedule\n";
    $out .= "# Automatically generated file - do not edit\n\n";
    $out .= "PATH=\"/usr/sbin:/usr/bin:/sbin:/bin\"\n\n";

    my $jobs = $cfg->{jobs} || [];
    foreach my $job (@$jobs) {
	my $enabled = ($job->{enabled}) ? '' : '#';
	my $dh = parse_dow($job->{dow});
	my $dow;
	if ($dh->{mon} && $dh->{tue} && $dh->{wed} && $dh->{thu} &&
	    $dh->{fri} && $dh->{sat} && $dh->{sun}) {
	    $dow = '*';
	} else {
	    $dow = &$dowhash_to_dow($dh, 1);
	    $dow = '*' if !$dow;
	}

	my ($hour, $minute);

	die "no job start time specified\n" if !$job->{starttime};
	if ($job->{starttime} =~ m/^(\d{1,2}):(\d{1,2})$/) {
	    ($hour, $minute) = (int($1), int($2));
	    die "hour '$hour' out of range\n" if $hour < 0 || $hour > 23;
	    die "minute '$minute' out of range\n" if $minute < 0 || $minute > 59;
	} else {
	    die "unable to parse job start time\n";
	}
	
	$job->{quiet} = 1; # we do not want messages from cron

	my $cmd = PVE::VZDump::command_line($job);

	$out .= sprintf "$minute $hour * * %-11s root $enabled$cmd\n", $dow;
    }

    my $ejobs = $cfg->{ejobs} || [];
    foreach my $job (@$ejobs) {
	$out .= "$job->{line}\n" if $job->{line};
    }

    return $out;
}

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
		id => { type => 'string' },
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
	properties => PVE::VZDump::json_config_properties({
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

	my $data = cfs_read_file('vzdump.cron');

	$param->{dow} = 'mon,tue,wed,thu,fri,sat,sun' if !defined($param->{dow});
	$param->{enabled} = 1 if !defined($param->{enabled});
	PVE::VZDump::verify_vzdump_parameters($param, 1);

	push @{$data->{jobs}}, $param;

	cfs_write_file('vzdump.cron', $data);

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
	    id => {
		type => 'string',
		description => "The job ID.",
		maxLength => 50,
	    }
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
	    id => {
		type => 'string',
		description => "The job ID.",
		maxLength => 50,
	    },
	},
    },
    returns => { type => 'null' },
    code => sub {
	my ($param) = @_;

	my $rpcenv = PVE::RPCEnvironment::get();
	my $user = $rpcenv->get_user();

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
	properties => PVE::VZDump::json_config_properties({
	    id => {
		type => 'string',
		description => "The job ID.",
		maxLength => 50,
	    },
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

		$job->{all} = 1 if defined($job->{exclude});

		if (defined($param->{vmid})) {
		    delete $job->{all};
		    delete $job->{exclude};
		} elsif ($param->{all}) {
		    delete $job->{vmid};
		}

		PVE::VZDump::verify_vzdump_parameters($job, 1);

		cfs_write_file('vzdump.cron', $data);

		return undef;
	    }
	}

	raise_param_exc({ id => "No such job '$param->{id}'" });

    }});

1;
