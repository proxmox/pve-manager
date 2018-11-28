package PVE::API2::Ceph::FS;

use strict;
use warnings;

use PVE::CephTools;
use PVE::JSONSchema qw(get_standard_option);
use PVE::RADOS;
use PVE::RESTHandler;
use PVE::RPCEnvironment;
use PVE::Storage;

use PVE::API2::Storage::Config;

use base qw(PVE::RESTHandler);

__PACKAGE__->register_method ({
    name => 'index',
    path => '',
    method => 'GET',
    description => "Directory index.",
    permissions => {
	check => ['perm', '/', [ 'Sys.Audit', 'Datastore.Audit' ], any => 1],
    },
    protected => 1,
    parameters => {
	additionalProperties => 0,
	properties => {
	    node => get_standard_option('pve-node'),
	},
    },
    returns => {
	type => 'array',
	items => {
	    type => "object",
	    properties => {
		name => {
		    description => "The ceph filesystem name.",
		    type => 'string',
		},
		metadata_pool => {
		    description => "The name of the metadata pool.",
		    type => 'string',
		},
		data_pool => {
		    description => "The name of the data pool.",
		    type => 'string',
		},
	    },
	},
	links => [ { rel => 'child', href => "{name}" } ],
    },
    code => sub {
	my ($param) = @_;

	my $rados = PVE::RADOS->new();

	my $cephfs_list = $rados->mon_command({ prefix => "fs ls" });
	# we get something like:
	#{
	#   'metadata_pool_id' => 2,
	#   'data_pool_ids' => [ 1 ],
	#   'metadata_pool' => 'cephfs_metadata',
	#   'data_pools' => [ 'cephfs_data' ],
	#   'name' => 'cephfs',
	#}

	my $res = [
	    map {{
		name => $_->{name},
		metadata_pool => $_->{metadata_pool},
		data_pool => $_->{data_pools}->[0],
	    }} @$cephfs_list
	];

	return $res;
    }
});

__PACKAGE__->register_method ({
    name => 'createfs',
    path => '{name}',
    method => 'POST',
    description => "Create a Ceph filesystem",
    proxyto => 'node',
    protected => 1,
    permissions => {
	check => ['perm', '/', [ 'Sys.Modify' ]],
    },
    parameters => {
	additionalProperties => 0,
	properties => {
	    node => get_standard_option('pve-node'),
	    name => {
		description => "The ceph filesystem name.",
		type => 'string',
		default => 'cephfs',
		optional => 1,
	    },
	    pg_num => {
		description => "Number of placement groups for the backing data pool. The metadata pool will use a quarter of this.",
		type => 'integer',
		default => 64,
		optional => 1,
		minimum => 8,
		maximum => 32768,
	    },
	    'add-storage' => {
		description => "Configure the created CephFS as storage for this cluster.",
		type => 'boolean',
		optional => 1,
		default => 0,
	    },
	},
    },
    returns => { type => 'string' },
    code => sub {
	my ($param) = @_;

	PVE::CephTools::check_ceph_inited();

	my $pve_ckeyring_path = PVE::CephTools::get_config('pve_ckeyring_path');
	die "Ceph is not fully configured - missing '$pve_ckeyring_path'\n"
	    if ! -f $pve_ckeyring_path;

	my $fs_name = $param->{name} // 'cephfs';
	my $pg_num = $param->{pg_num} // 64;

	my $pool_data = "${fs_name}_data";
	my $pool_metadata = "${fs_name}_metadata";

	my $rados = PVE::RADOS->new();
	my $ls_pools = PVE::CephTools::ls_pools();
	my $existing_pools = { map { $_->{poolname} => 1 } @$ls_pools };

	die "ceph pools '$pool_data' and/or '$pool_metadata' already exist\n"
	    if $existing_pools->{$pool_data} || $existing_pools->{$pool_metadata};

	my $running_mds = PVE::CephTools::get_cluster_mds_state($rados);
	die "no running Metadata Server (MDS) found!\n" if !scalar(keys %$running_mds);

	PVE::Storage::assert_sid_unused($fs_name) if $param->{add_storage};

	my $worker = sub {
	    $rados = PVE::RADOS->new();

	    my $pool_param = {
		application => 'cephfs',
		pg_num => $pg_num,
	    };

	    my @created_pools = ();
	    eval {
		print "creating data pool '$pool_data'...\n";
		PVE::CephTools::create_pool($pool_data, $pool_param, $rados);
		push @created_pools, $pool_data;

		print "creating metadata pool '$pool_metadata'...\n";
		$pool_param->{pg_num} = $pg_num >= 32 ? $pg_num / 4 : 8;
		PVE::CephTools::create_pool($pool_metadata, $pool_param, $rados);
		push @created_pools, $pool_metadata;

		print "configuring new CephFS '$fs_name'\n";
		$rados->mon_command({
		    prefix => "fs new",
		    fs_name => $fs_name,
		    metadata => $pool_metadata,
		    data => $pool_data,
		    format => 'plain',
		});
	    };
	    if (my $err = $@) {
		$@ = undef;

		if (@created_pools > 0) {
		    warn "Encountered error after creating at least one pool\n";
		    # our old connection is very likely broken now, recreate
		    $rados = PVE::RADOS->new();
		    foreach my $pool (@created_pools) {
			warn "cleaning up left over pool '$pool'\n";
			eval { PVE::CephTools::destroy_pool($pool, $rados) };
			warn "$@\n" if $@;
		    }
		}

		die "$err\n";
	    }
	    print "Successfully create CephFS '$fs_name'\n";

	    if ($param->{'add-storage'}) {
		print "Adding '$fs_name' to storage configuration...\n";

		my $waittime = 0;
		while (!PVE::CephTools::is_any_mds_active($rados)) {
		    if ($waittime >= 10) {
			die "Need MDS to add storage, but none got active!\n";
		    }

		    print "Waiting for an MDS to become active\n";
		    sleep(1);
		    $waittime++;
		}

		eval {
		    PVE::API2::Storage::Config->create({
			type => 'cephfs',
			storage => $fs_name,
			content => 'backup,iso,vztmpl',
		    })
		};
		die "adding storage for CephFS '$fs_name' failed, check log ".
		    "and add manually!\n$@\n" if $@;
	    }
	};

	my $rpcenv = PVE::RPCEnvironment::get();
	my $user = $rpcenv->get_user();

	return $rpcenv->fork_worker('cephfscreate', $fs_name,  $user, $worker);
    }
});

1;
