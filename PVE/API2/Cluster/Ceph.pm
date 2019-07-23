package PVE::API2::Cluster::Ceph;

use strict;
use warnings;

use PVE::Ceph::Services;
use PVE::Ceph::Tools;
use PVE::Cluster;
use PVE::Exception qw(raise_param_exc);
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
	properties => {},
    },
    returns => { type => 'object' },
    code => sub {
	my ($param) = @_;

	PVE::Ceph::Tools::check_ceph_inited();

	my $rados = PVE::RADOS->new();

	my $res = {
	    version => PVE::Cluster::get_node_kv("ceph-version"),
	};

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
		my $servicename =  $service->{name} // $service->{id};
		my $id = "$servicename\@$hostname";

		if ($data->{$id}) {
		    # copy values over to the metadata hash
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

	my $rados = PVE::RADOS->new();
	my $status = $rados->mon_command({ prefix => 'status' });
	$status->{health} = $rados->mon_command({ prefix => 'health', detail => 'detail' });
	return $status;
    }
});

1;
