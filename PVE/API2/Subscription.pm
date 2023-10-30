package PVE::API2::Subscription;

use strict;
use warnings;
use Digest::MD5 qw(md5_hex md5_base64);
use MIME::Base64;
use HTTP::Request;
use LWP::UserAgent;
use JSON;

use Proxmox::RS::Subscription;

use PVE::Tools;
use PVE::ProcFSTools;
use PVE::Exception qw(raise_param_exc);
use PVE::INotify;
use PVE::Cluster qw (cfs_read_file cfs_write_file);
use PVE::DataCenterConfig;
use PVE::AccessControl;
use PVE::Storage;
use PVE::JSONSchema qw(get_standard_option);

use PVE::SafeSyslog;

use PVE::API2Tools;
use PVE::RESTHandler;

use base qw(PVE::RESTHandler);

my $subscription_pattern = 'pve([1248])([cbsp])-[0-9a-f]{10}';
my $filename = "/etc/subscription";

sub get_sockets {
    my $info = PVE::ProcFSTools::read_cpuinfo();
    return $info->{sockets};
}

sub parse_key {
    my ($key, $noerr) = @_;

    if ($key =~ m/^${subscription_pattern}$/) {
	return wantarray ? ($1, $2) : $1; # number of sockets, level
    }
    return undef if $noerr;

    die "Wrong subscription key format\n";
}

sub check_key {
    my ($key, $req_sockets) = @_;

    my ($sockets, $level) = parse_key($key);
    if ($sockets < $req_sockets) {
	die "wrong number of sockets ($sockets < $req_sockets)\n";
    }
    return ($sockets, $level);
}

sub read_etc_subscription {
    my $req_sockets = get_sockets();
    my $server_id = PVE::API2Tools::get_hwaddress();

    my $info = Proxmox::RS::Subscription::read_subscription($filename);

    return $info if !$info || $info->{status} ne 'active';

    my ($sockets, $level);
    eval { ($sockets, $level) = check_key($info->{key}, $req_sockets); };
    if (my $err = $@) {
	chomp $err;
	$info->{status} = 'invalid';
	$info->{message} = $err;
    } else {
	$info->{level} = $level;
    }

    return $info;
}

my sub cache_is_valid {
    my ($info) = @_;

    return if !$info || $info->{status} ne 'active';

    my $checked_info = Proxmox::RS::Subscription::check_age($info, 1);
    return $checked_info->{status} eq 'active'
}

sub write_etc_subscription {
    my ($info) = @_;

    my $server_id = PVE::API2Tools::get_hwaddress();
    mkdir "/etc/apt/auth.conf.d";
    Proxmox::RS::Subscription::write_subscription(
        $filename, "/etc/apt/auth.conf.d/pve.conf", "enterprise.proxmox.com/debian/pve", $info);

    if (!(defined($info->{key}) && defined($info->{serverid}))) {
	unlink "/etc/apt/auth.conf.d/ceph.conf";
    } else {
	# FIXME: improve this, especially the selection of valid ceph-releases
	# NOTE: currently we should add future ceph releases as early as possible, to ensure that
	my $ceph_auth = '';
	for my $ceph_release ('quincy', 'reef') {
	    $ceph_auth .= "machine enterprise.proxmox.com/debian/ceph-${ceph_release}"
	    ." login $info->{key} password $info->{serverid}\n"
	}
	PVE::Tools::file_set_contents("/etc/apt/auth.conf.d/ceph.conf", $ceph_auth);
    }
}

__PACKAGE__->register_method ({
    name => 'get',
    path => '',
    method => 'GET',
    description => "Read subscription info.",
    proxyto => 'node',
    permissions => { user => 'all' },
    parameters => {
    	additionalProperties => 0,
	properties => {
	    node => get_standard_option('pve-node'),
	},
    },
    returns => { type => 'object'},
    code => sub {
	my ($param) = @_;

	my $node = $param->{node};

	my $rpcenv = PVE::RPCEnvironment::get();
	my $authuser = $rpcenv->get_user();
	my $has_permission = $rpcenv->check($authuser, "/nodes/$node", ['Sys.Audit'], 1);

	my $server_id = PVE::API2Tools::get_hwaddress();
	my $url = "https://www.proxmox.com/en/proxmox-virtual-environment/pricing";

	my $info = read_etc_subscription();
	if (!$info) {
	    my $no_subscription_info = {
		status => "notfound",
		message => "There is no subscription key",
		url => $url,
	    };
	    $no_subscription_info->{serverid} = $server_id if $has_permission;
	    return $no_subscription_info;
	}

	if (!$has_permission) {
	    return {
		status => $info->{status},
		message => $info->{message},
		url => $url,
	    }
	}

	$info->{serverid} = $server_id;
	$info->{sockets} = get_sockets();
	$info->{url} = $url;

	return $info
    }});

__PACKAGE__->register_method ({
    name => 'update',
    path => '',
    method => 'POST',
    permissions => {
	check => ['perm', '/nodes/{node}', [ 'Sys.Modify' ]],
    },
    description => "Update subscription info.",
    proxyto => 'node',
    protected => 1,
    parameters => {
    	additionalProperties => 0,
	properties => {
	    node => get_standard_option('pve-node'),
	    force => {
		description => "Always connect to server, even if local cache is still valid.",
		type => 'boolean',
		optional => 1,
		default => 0
	    }
	},
    },
    returns => { type => 'null'},
    code => sub {
	my ($param) = @_;

	my $info = read_etc_subscription();
	return undef if !$info;

	my $server_id = PVE::API2Tools::get_hwaddress();
	my $key = $info->{key};

	die "Updating offline key not possible - please remove and re-add subscription key to switch to online key.\n"
	    if $info->{signature};

	return undef if !$param->{force} && cache_is_valid($info); # key has been recently checked

	my $req_sockets = get_sockets();
	check_key($key, $req_sockets);

	my $dccfg = PVE::Cluster::cfs_read_file('datacenter.cfg');
	my $proxy = $dccfg->{http_proxy};

	$info = Proxmox::RS::Subscription::check_subscription($key, $server_id, "", "Proxmox VE", $proxy);

	write_etc_subscription($info);

	return undef;
    }});

__PACKAGE__->register_method ({
    name => 'set',
    path => '',
    method => 'PUT',
    permissions => {
	check => ['perm', '/nodes/{node}', [ 'Sys.Modify' ]],
    },
    description => "Set subscription key.",
    proxyto => 'node',
    protected => 1,
    parameters => {
	additionalProperties => 0,
	properties => {
	    node => get_standard_option('pve-node'),
	    key => {
		description => "Proxmox VE subscription key",
		type => 'string',
		pattern => "\\s*${subscription_pattern}\\s*",
		maxLength => 32,
	    },
	},
    },
    returns => { type => 'null'},
    code => sub {
	my ($param) = @_;

	my $key = PVE::Tools::trim($param->{key});

	my $new_info = {
	    status => 'New',
	    key => $key,
	    checktime => time(),
	};

	my $req_sockets = get_sockets();
	my $server_id = PVE::API2Tools::get_hwaddress();

	check_key($key, $req_sockets);

	write_etc_subscription($new_info);

	my $dccfg = PVE::Cluster::cfs_read_file('datacenter.cfg');
	my $proxy = $dccfg->{http_proxy};

	my $checked_info = Proxmox::RS::Subscription::check_subscription(
	    $key, $server_id, "", "Proxmox VE", $proxy);

	write_etc_subscription($checked_info);

	return undef;
    }});

__PACKAGE__->register_method ({
    name => 'delete',
    path => '',
    method => 'DELETE',
    permissions => {
	check => ['perm', '/nodes/{node}', [ 'Sys.Modify' ]],
    },
    description => "Delete subscription key of this node.",
    proxyto => 'node',
    protected => 1,
    parameters => {
	additionalProperties => 0,
	properties => {
	    node => get_standard_option('pve-node'),
	},
    },
    returns => { type => 'null'},
    code => sub {
	my $subscription_file = '/etc/subscription';
	return if ! -e $subscription_file;
	unlink($subscription_file) or die "cannot delete subscription key: $!";
	return undef;
    }});

1;
