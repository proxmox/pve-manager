package PVE::API2::Cluster::Ceph;

use strict;
use warnings;

use JSON;

use PVE::Ceph::Services;
use PVE::Ceph::Tools;
use PVE::Cluster;
use PVE::Exception qw(raise_param_exc);
use PVE::JSONSchema qw(get_standard_option);
use PVE::RADOS;
use PVE::RESTHandler;
use PVE::SafeSyslog;
use PVE::Tools qw(extract_param);

use base qw(PVE::RESTHandler);

__PACKAGE__->register_method ({
    name => 'cephindex',
    path => '',
    method => 'GET',
    description => "Cluster ceph index.",
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
	    { name => 'metadata' },
	    { name => 'status' },
	    { name => 'flags' },
	];

	return $result;
    }
});

__PACKAGE__->register_method ({
    name => 'metadata',
    path => 'metadata',
    method => 'GET',
    description => "Get ceph metadata.",
    protected => 1,
    permissions => {
	check => ['perm', '/', [ 'Sys.Audit', 'Datastore.Audit' ], any => 1],
    },
    parameters => {
	additionalProperties => 0,
	properties => {
	    scope => {
		type => 'string',
		optional => 1,
		default => 'all',
		enum => ['all', 'versions', ],
	    },
	},
    },
    returns => { type => 'object' },
    code => sub {
	my ($param) = @_;

	my $scope = $param->{scope} // 'all';

	my $res = {};

	if (defined(my $versions = PVE::Ceph::Services::get_ceph_versions())) {
	    $res->{node} = $versions;
	}

	return $res if ($scope eq 'versions');

	# only check now, we want to allow calls with scope 'versions' on non-ceph nodes too!
	PVE::Ceph::Tools::check_ceph_inited();
	my $rados = PVE::RADOS->new();

	for my $type ( qw(mon mgr mds) ) {
	    my $typedata = PVE::Ceph::Services::get_cluster_service($type);
	    my $data = {};
	    for my $host (sort keys %$typedata) {
		for my $service (sort keys %{$typedata->{$host}}) {
		    $data->{"$service\@$host"} = $typedata->{$host}->{$service};
		}
	    }

	    # get data from metadata call and merge 'our' data
	    my $services = $rados->mon_command({ prefix => "$type metadata" });
	    for my $service ( @$services ) {
		my $hostname = $service->{hostname};
		next if !defined($hostname); # can happen if node is dead

		my $servicename =  $service->{name} // $service->{id};
		my $id = "$servicename\@$hostname";

		if ($data->{$id}) { # copy values over to the metadata hash
		    for my $k (keys %{$data->{$id}}) {
			$service->{$k} = $data->{$id}->{$k};
		    }
		}
		$data->{$id} = $service;
	    }

	    $res->{$type} = $data;
	}

	$res->{osd} = $rados->mon_command({ prefix => "osd metadata" });

	return $res;
    }
});

__PACKAGE__->register_method ({
    name => 'status',
    path => 'status',
    method => 'GET',
    description => "Get ceph status.",
    protected => 1,
    permissions => {
	check => ['perm', '/', [ 'Sys.Audit', 'Datastore.Audit' ], any => 1],
    },
    parameters => {
	additionalProperties => 0,
	properties => { },
    },
    returns => { type => 'object' },
    code => sub {
	my ($param) = @_;

	PVE::Ceph::Tools::check_ceph_inited();

	return PVE::Ceph::Tools::ceph_cluster_status();
    }
});

my $possible_flags = PVE::Ceph::Tools::get_possible_osd_flags();
my $possible_flags_list = [ sort keys %$possible_flags ];

my $get_current_set_flags = sub {
    my $rados = shift;

    $rados //= PVE::RADOS->new();

    my $stat = $rados->mon_command({ prefix => 'osd dump' });
    my $setflags = $stat->{flags} // '';
    return { map { $_ => 1 } PVE::Tools::split_list($setflags) };
};

__PACKAGE__->register_method ({
    name => 'get_all_flags',
    path => 'flags',
    method => 'GET',
    description => "get the status of all ceph flags",
    protected => 1,
    permissions => {
	check => ['perm', '/', [ 'Sys.Audit' ]],
    },
    parameters => {
	additionalProperties => 0,
	properties => {
	},
    },
    returns => {
	type => 'array',
	items => {
	    type => "object",
	    additionalProperties => 1,
	    properties => {
		name => {
		    description => "Flag name.",
		    type => 'string', enum => $possible_flags_list,
		},
		description => {
		    description => "Flag description.",
		    type => 'string',
		},
		value => {
		    description => "Flag value.",
		    type => 'boolean',
		},
	    },
	},
	links => [ { rel => 'child', href => "{name}" } ],
    },
    code => sub {
	my ($param) = @_;

	PVE::Ceph::Tools::check_ceph_configured();

	my $setflags = $get_current_set_flags->();

	my $res = [];
	foreach my $flag (@$possible_flags_list) {
	    my $el = {
		name => $flag,
		description => $possible_flags->{$flag}->{description},
		value => 0,
	    };

	    my $realflag = PVE::Ceph::Tools::get_real_flag_name($flag);
	    if ($setflags->{$realflag}) {
		$el->{value} = 1;
	    }

	    push @$res, $el;
	}

	return $res;
    }
});

__PACKAGE__->register_method ({
    name => 'set_flags',
    path => 'flags',
    method => 'PUT',
    description => "Set/Unset multiple ceph flags at once.",
    protected => 1,
    permissions => {
	check => ['perm', '/', [ 'Sys.Modify' ]],
    },
    parameters => {
	additionalProperties => 0,
	properties => $possible_flags,
    },
    returns => { type => 'string' },
    code => sub {
	my ($param) = @_;

	my $rpcenv = PVE::RPCEnvironment::get();
	my $user = $rpcenv->get_user();
	PVE::Ceph::Tools::check_ceph_configured();

	my $worker = sub {
	    my $rados = PVE::RADOS->new(); # (re-)open for forked worker

	    my $setflags = $get_current_set_flags->($rados);

	    my $errors = 0;
	    foreach my $flag (@$possible_flags_list) {
		next if !defined($param->{$flag});
		my $val = $param->{$flag};
		my $realflag = PVE::Ceph::Tools::get_real_flag_name($flag);

		next if !$val == !$setflags->{$realflag}; # we do not set/unset flags to the same state

		my $prefix = $val ? 'set' : 'unset';
		eval {
		    print "$prefix $flag\n";
		    $rados->mon_command({ prefix => "osd $prefix", key => $flag, });
		};
		if (my $err = $@) {
		    warn "error with $flag: '$err'\n";
		    $errors++;
		}
	    }

	    if ($errors) {
		die "could not set/unset $errors flags\n";
	    }
	};

	return $rpcenv->fork_worker('cephsetflags', undef,  $user, $worker);
    }});


__PACKAGE__->register_method ({
    name => 'get_flag',
    path => 'flags/{flag}',
    method => 'GET',
    description => "Get the status of a specific ceph flag.",
    protected => 1,
    permissions => {
	check => ['perm', '/', [ 'Sys.Audit' ]],
    },
    parameters => {
	additionalProperties => 0,
	properties => {
	    flag => {
		description => "The name of the flag name to get.",
		type => 'string', enum => $possible_flags_list,
	    },
	},
    },
    returns => {
	type => 'boolean',
    },
    code => sub {
	my ($param) = @_;

	PVE::Ceph::Tools::check_ceph_configured();

	my $realflag = PVE::Ceph::Tools::get_real_flag_name($param->{flag});

	my $setflags = $get_current_set_flags->();
	if ($setflags->{$realflag}) {
	    return 1;
	}

	return 0;
    }});

__PACKAGE__->register_method ({
    name => 'update_flag',
    path => 'flags/{flag}',
    method => 'PUT',
    description => "Set or clear (unset) a specific ceph flag",
    protected => 1,
    permissions => {
	check => ['perm', '/', [ 'Sys.Modify' ]],
    },
    parameters => {
	additionalProperties => 0,
	properties => {
	    flag => {
		description => 'The ceph flag to update',
		type => 'string',
		enum => $possible_flags_list,
	    },
	    value => {
		description => 'The new value of the flag',
		type => 'boolean',
	    },
	},
    },
    returns => { type => 'null' },
    code => sub {
	my ($param) = @_;

	PVE::Ceph::Tools::check_ceph_configured();

	my $cmd = $param->{value} ? 'set' : 'unset';

	my $rados = PVE::RADOS->new();
	$rados->mon_command({
	    prefix => "osd $cmd",
	    key => $param->{flag},
	});

	return undef;
    }});


1;
