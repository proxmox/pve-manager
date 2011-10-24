package PVE::API2::Cluster;

use strict;
use warnings;

use PVE::SafeSyslog;
use PVE::Tools qw(extract_param);
use PVE::Cluster qw(cfs_register_file cfs_lock_file cfs_read_file cfs_write_file);
use PVE::Storage;
use JSON;
use PVE::API2::VZDump;


use Data::Dumper; # fixme: remove

use Apache2::Const qw(:http);

use PVE::RESTHandler;
use PVE::RPCEnvironment;

use base qw(PVE::RESTHandler);

my $dc_schema = PVE::Cluster::get_datacenter_schema();
my $dc_properties = { 
    delete => {
	type => 'string', format => 'pve-configid-list',
	description => "A list of settings you want to delete.",
	optional => 1,
    }
};
foreach my $opt (keys %{$dc_schema->{properties}}) {
    $dc_properties->{$opt} = $dc_schema->{properties}->{$opt};
}

__PACKAGE__->register_method ({
    name => 'index', 
    path => '', 
    method => 'GET',
    description => "Cluster index.",
    permissions => { user => 'all' },
    parameters => {
    	additionalProperties => 0,
	properties => {},
    },
    returns => {
	type => 'array',
	items => {
	    type => "object",
	    properties => {},
	},
	links => [ { rel => 'child', href => "{name}" } ],
    },
    code => sub {
	my ($param) = @_;
    
	my $result = [
	    { name => 'log' },
	    { name => 'options' },
	    { name => 'resources' },
	    { name => 'tasks' },
	    { name => 'vzdump' },
	    ];

	return $result;
    }});

__PACKAGE__->register_method({
    name => 'log', 
    path => 'log', 
    method => 'GET',
    description => "Read cluster log",
    permissions => { user => 'all' },
    parameters => {
    	additionalProperties => 0,
	properties => {
	    max => {
		type => 'integer',
		description => "Maximum number of entries.",
		optional => 1,
		minimum => 1,
	    }
	},
    },
    returns => {
	type => 'array',
	items => {
	    type => "object",
	    properties => {},
	},
    },
    code => sub {
	my ($param) = @_;

	my $rpcenv = PVE::RPCEnvironment::get();

	my $max = $param->{max} || 0;
	my $user = $rpcenv->get_user();

	my $admin = $rpcenv->check($user, "/", [ 'Sys.Syslog' ]);

	my $loguser = $admin ? '' : $user;

	my $res = decode_json(PVE::Cluster::get_cluster_log($loguser, $max));

	return $res->{data};
    }});

__PACKAGE__->register_method({
    name => 'resources', 
    path => 'resources', 
    method => 'GET',
    description => "Resources index (cluster wide).",
    permissions => { user => 'all' },
    parameters => {
    	additionalProperties => 0,
	properties => {},
    },
    returns => {
	type => 'array',
	items => {
	    type => "object",
	    properties => {
	    },
	},
    },
    code => sub {
	my ($param) = @_;

	my $rpcenv = PVE::RPCEnvironment::get();
	my $user = $rpcenv->get_user();

	my $res = [];

	my $nodelist = PVE::Cluster::get_nodelist();
	my $members = PVE::Cluster::get_members();

	my $rrd = PVE::Cluster::rrd_dump();

	my $vmlist = PVE::Cluster::get_vmlist() || {};
	my $idlist = $vmlist->{ids} || {};


	# we try to generate 'numbers' by using "$X + 0"
	foreach my $vmid (keys %$idlist) {
	    my $data = $idlist->{$vmid};

	    next if !$rpcenv->check($user, "/vms/$vmid", [ 'VM.Audit' ]);

	    my $entry = {
		id => "$data->{type}/$vmid",
		vmid => $vmid + 0, 
		node => $data->{node},
		type => $data->{type},
	    };

	    if (my $d = $rrd->{"pve2-vm/$vmid"}) {

		$entry->{uptime} = ($d->[0] || 0) + 0;
		$entry->{name} = $d->[1];

		$entry->{maxcpu} = ($d->[3] || 0) + 0;
		$entry->{cpu} = ($d->[4] || 0) + 0;
		$entry->{maxmem} = ($d->[5] || 0) + 0;
		$entry->{mem} = ($d->[6] || 0) + 0;
		$entry->{maxdisk} = ($d->[7] || 0) + 0;
		$entry->{disk} = ($d->[8] || 0) + 0;
	    }

	    push @$res, $entry;
	}

	foreach my $node (@$nodelist) {
	    my $entry = {
		id => "node/$node",
		node => $node,
		type => "node",
	    };
	    if (my $d = $rrd->{"pve2-node/$node"}) {

		if (!$members || # no cluster
		    ($members->{$node} && $members->{$node}->{online})) {
		    $entry->{uptime} = ($d->[0] || 0) + 0;
		    $entry->{cpu} = ($d->[4] || 0) + 0;
		    $entry->{mem} = ($d->[7] || 0) + 0;
		    $entry->{disk} = ($d->[11] || 0) + 0;
		}

		$entry->{maxcpu} = ($d->[3] || 0) + 0;
		$entry->{maxmem} = ($d->[6] || 0) + 0;
		$entry->{maxdisk} = ($d->[10] || 0) + 0;
	    }


	    push @$res, $entry;
	}

	my $cfg = PVE::Storage::config();
	my @sids =  PVE::Storage::storage_ids ($cfg);

	foreach my $storeid (@sids) {
	    my $scfg =  PVE::Storage::storage_config($cfg, $storeid);
	    next if !$rpcenv->check($user, "/storage/$storeid", [ 'Datastore.Audit' ]);
	    # we create a entry for each node
	    foreach my $node (@$nodelist) {
		next if !PVE::Storage::storage_check_enabled($cfg, $storeid, $node, 1);
		my $entry = {
		    id => "storage/$node/$storeid",
		    storage => $storeid, 
		    node => $node, 
		    type => 'storage', 
		}; 

		if (my $d = $rrd->{"pve2-storage/$node/$storeid"}) {
		    $entry->{maxdisk} = ($d->[1] || 0) + 0;
		    $entry->{disk} = ($d->[2] || 0) + 0;
		}

		push @$res, $entry;

	    }
	}

	return $res;
    }});

__PACKAGE__->register_method({
    name => 'tasks', 
    path => 'tasks', 
    method => 'GET',
    description => "List recent tasks (cluster wide).",
    permissions => { user => 'all' },
    parameters => {
    	additionalProperties => 0,
	properties => {},
    },
    returns => {
	type => 'array',
	items => {
	    type => "object",
	    properties => {
		upid => { type => 'string' },
	    },
	},
    },
    code => sub {
	my ($param) = @_;

	my $rpcenv = PVE::RPCEnvironment::get();
	my $user = $rpcenv->get_user();

	my $tlist = PVE::Cluster::get_tasklist();

	my $res = [];

	return $res if !$tlist;

	my $all = $rpcenv->check($user, "/", [ 'Sys.Audit' ]);

	foreach my $task (@$tlist) {
	    push @$res, $task if $all || ($task->{user} eq $user);
	}
   
	return $res;
    }});

__PACKAGE__->register_method({
    name => 'get_options', 
    path => 'options', 
    method => 'GET',
    description => "Get datacenter options.",
    permissions => {
	path => '/',
	privs => [ 'Sys.Audit' ],
    },
    parameters => {
    	additionalProperties => 0,
	properties => {},
    },
    returns => {
	type => "object",
	properties => {},
    },
    code => sub {
	my ($param) = @_;
	return PVE::Cluster::cfs_read_file('datacenter.cfg');
    }});

__PACKAGE__->register_method({
    name => 'set_options', 
    path => 'options', 
    method => 'PUT',
    description => "Set datacenter options.",
    permissions => {
	path => '/',
	privs => [ 'Sys.Modify' ],
    },
    protected => 1,
    parameters => {
    	additionalProperties => 0,
	properties => $dc_properties,
    },
    returns => { type => "null" },
    code => sub {
	my ($param) = @_;

	my $filename = 'datacenter.cfg';

	my $delete = extract_param($param, 'delete');

	my $code = sub {

	    my $conf = cfs_read_file($filename);

	    foreach my $opt (keys %$param) {
		$conf->{$opt} = $param->{$opt};
	    }

	    foreach my $opt (PVE::Tools::split_list($delete)) {
		delete $conf->{$opt};
	    };

	    cfs_write_file($filename, $conf);
	};

	cfs_lock_file($filename, undef, $code);
	die $@ if $@;

	return undef;
    }});

cfs_register_file ('vzdump', 
		   \&parse_config, 
		   \&write_config); 

my $vzdump_method_info = PVE::API2::VZDump->map_method_by_name('vzdump');

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

sub parse_dow {
    my ($dowstr, $noerr) = @_;

    my $dowmap = {mon => 1, tue => 2, wed => 3, thu => 4,
		  fri => 5, sat => 6, sun => 7};
    my $rdowmap = { '1' => 'mon', '2' => 'tue', '3' => 'wed', '4' => 'thu',
		    '5' => 'fri', '6' => 'sat', '7' => 'sun', '0' => 'sun'};

    my $res = {};

    $dowstr = '1,2,3,4,5,6,7' if $dowstr eq '*';

    foreach my $day (split (/,/, $dowstr)) {
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

sub parse_config {
    my ($filename, $raw) = @_;

    my $jobs = []; # correct jobs

    my $ejobs = []; # mailfomerd lines

    my $jid = 1; # we start at 1
    
    my $digest = Digest::SHA1::sha1_hex(defined($raw) ? $raw : '');

    while ($raw && $raw =~ s/^(.*?)(\n|$)//) {
	my $line = $1;

	next if $line =~ m/^\#/;
	next if $line =~ m/^\s*$/;
	next if $line =~ m/^PATH\s*=/; # we always overwrite path

	if ($line =~ m|^(\d+)\s+(\d+)\s+\*\s+\*\s+(\S+)\s+root\s+(/\S+/)?vzdump(\s+(.*))?$|) {
	    eval {
		my $minute = int($1);
		my $hour = int($2);
		my $dow = $3;
		my $param = $6;

		my $dowhash = parse_dow($dow, 1);
		die "unable to parse day of week '$dow' in '$filename'\n" if !$dowhash;

		my $args = [ split(/\s+/, $param)];

		my $opts = PVE::JSONSchema::get_options($vzdump_method_info->{parameters}, 
							$args, undef, undef, 'vmid');

		$opts->{id} = "$digest:$jid";
		$jid++;
		$opts->{hour} = $hour;
		$opts->{minute} = $minute;
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

sub write_config {
    my ($filename, $cfg) = @_;

    my $out = "# cluster wide vzdump cron schedule\n";
    $out .= "# Atomatically generated file - do not edit\n\n";
    $out .= "PATH=\"/usr/sbin:/usr/bin:/sbin:/bin\"\n\n";

    my $jobs = $cfg->{jobs} || [];
    foreach my $job (@$jobs) {
	my $dh = parse_dow($job->{dow});
	my $dow;
	if ($dh->{mon} && $dh->{tue} && $dh->{wed} && $dh->{thu} &&
	    $dh->{fri} && $dh->{sat} && $dh->{sun}) {
	    $dow = '*';
	} else {
	    $dow = &$dowhash_to_dow($dh, 1);
	    $dow = '*' if !$dow;
	}

	my $param = "";
	foreach my $p (keys %$job) {
	    next if $p eq 'id' || $p eq 'vmid' || $p eq 'hour' || 
		$p eq 'minute' || $p eq 'dow';
	    $param .= " --$p " . $job->{$p};
	}

	$param .= $job->{vmid} if $job->{vmid};

	$out .= sprintf "$job->{minute} $job->{hour} * * %-11s root vzdump$param\n", $dow;
    }

    my $ejobs = $cfg->{ejobs} || [];
    foreach my $job (@$ejobs) {
	$out .= "$job->{line}\n" if $job->{line};
    }

    return $out;
}

__PACKAGE__->register_method({
    name => 'vzdump', 
    path => 'vzdump', 
    method => 'GET',
    description => "List vzdump backup schedule.",
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

	my $data = cfs_read_file('vzdump');

	my $res = $data->{jobs} || [];

	return $res;
    }});

1;
