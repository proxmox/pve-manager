package PVE::API2::Ceph::MGR;

use strict;
use warnings;

use File::Path;

use PVE::Ceph::Tools;
use PVE::Ceph::Services;
use PVE::Cluster qw(cfs_read_file);
use PVE::JSONSchema qw(get_standard_option);
use PVE::RADOS;
use PVE::RPCEnvironment;
use PVE::Tools qw(run_command);

use base qw(PVE::RESTHandler);

__PACKAGE__->register_method ({
    name => 'createmgr',
    path => '',
    method => 'POST',
    description => "Create Ceph Manager",
    proxyto => 'node',
    protected => 1,
    permissions => {
	check => ['perm', '/', [ 'Sys.Modify' ]],
    },
    parameters => {
	additionalProperties => 0,
	properties => {
	    node => get_standard_option('pve-node'),
	    id => {
		type => 'string',
		optional => 1,
		pattern => '[a-zA-Z0-9]([a-zA-Z0-9\-]*[a-zA-Z0-9])?',
		description => "The ID for the manager, when omitted the same as the nodename",
	    },
	},
    },
    returns => { type => 'string' },
    code => sub {
	my ($param) = @_;

	PVE::Ceph::Tools::check_ceph_installed('ceph_mgr');

	PVE::Ceph::Tools::check_ceph_inited();

	my $rpcenv = PVE::RPCEnvironment::get();

	my $authuser = $rpcenv->get_user();

	my $mgrid = $param->{id} // $param->{node};

	my $worker = sub  {
	    my $upid = shift;

	    my $rados = PVE::RADOS->new(timeout => PVE::Ceph::Tools::get_config('long_rados_timeout'));

	    PVE::Ceph::Services::create_mgr($mgrid, $rados);
	};

	return $rpcenv->fork_worker('cephcreatemgr', "mgr.$mgrid", $authuser, $worker);
    }});

__PACKAGE__->register_method ({
    name => 'destroymgr',
    path => '{id}',
    method => 'DELETE',
    description => "Destroy Ceph Manager.",
    proxyto => 'node',
    protected => 1,
    permissions => {
	check => ['perm', '/', [ 'Sys.Modify' ]],
    },
    parameters => {
	additionalProperties => 0,
	properties => {
	    node => get_standard_option('pve-node'),
	    id => {
		description => 'The ID of the manager',
		type => 'string',
		pattern => '[a-zA-Z0-9]([a-zA-Z0-9\-]*[a-zA-Z0-9])?',
	    },
	},
    },
    returns => { type => 'string' },
    code => sub {
	my ($param) = @_;

	my $rpcenv = PVE::RPCEnvironment::get();

	my $authuser = $rpcenv->get_user();

	PVE::Ceph::Tools::check_ceph_inited();

	my $mgrid = $param->{id};

	my $worker = sub {
	    my $upid = shift;

	    PVE::Ceph::Services::destroy_mgr($mgrid);
	};

	return $rpcenv->fork_worker('cephdestroymgr', "mgr.$mgrid",  $authuser, $worker);
    }});
