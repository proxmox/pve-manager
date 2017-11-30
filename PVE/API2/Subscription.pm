package PVE::API2::Subscription;

use strict;
use warnings;
use Digest::MD5 qw(md5_hex md5_base64);
use MIME::Base64;
use HTTP::Request;
use LWP::UserAgent;
use JSON;

use PVE::Tools;
use PVE::ProcFSTools;
use PVE::Exception qw(raise_param_exc);
use PVE::INotify;
use PVE::Cluster qw (cfs_read_file cfs_write_file);
use PVE::AccessControl;
use PVE::Storage;
use PVE::JSONSchema qw(get_standard_option);

use PVE::SafeSyslog;
use PVE::Subscription;

use PVE::API2Tools;
use PVE::RESTHandler;

use base qw(PVE::RESTHandler);

PVE::INotify::register_file('subscription', "/etc/subscription",
			    \&read_etc_pve_subscription,
			    \&write_etc_pve_subscription);

my $subscription_pattern = 'pve([124])([cbsp])-[0-9a-f]{10}';

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

sub read_etc_pve_subscription {
    my ($filename, $fh) = @_;

    my $req_sockets = get_sockets();
    my $server_id = PVE::API2Tools::get_hwaddress();

    my $info = PVE::Subscription::read_subscription($server_id, $filename, $fh);

    return $info if $info->{status} ne 'Active';

    my ($sockets, $level);
    eval { ($sockets, $level) = check_key($info->{key}, $req_sockets); };
    if (my $err = $@) {
	chomp $err;
	$info->{status} = 'Invalid';
	$info->{message} = $err;
    } else {
	$info->{level} = $level;
    }

    return $info;
}

sub write_etc_pve_subscription {
    my ($filename, $fh, $info) = @_;

    my $server_id = PVE::API2Tools::get_hwaddress();
    PVE::Subscription::write_subscription($server_id, $filename, $fh, $info);
}

__PACKAGE__->register_method ({
    name => 'get',
    path => '',
    method => 'GET',
    permissions => {
	check => ['perm', '/nodes/{node}', [ 'Sys.Audit' ]],
    },
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

	my $server_id = PVE::API2Tools::get_hwaddress();
	my $url = "http://www.proxmox.com/products/proxmox-ve/subscription-service-plans";

	my $info = PVE::INotify::read_file('subscription');
	if (!$info) {
	    return {
		status => "NotFound",
		message => "There is no subscription key",
		serverid => $server_id,
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
		description => "Always connect to server, even if we have up to date info inside local cache.",
		type => 'boolean',
		optional => 1,
		default => 0
	    }
	},
    },
    returns => { type => 'null'},
    code => sub {
	my ($param) = @_;

	my $info = PVE::INotify::read_file('subscription');
	return undef if !$info;

	my $server_id = PVE::API2Tools::get_hwaddress();
	my $key = $info->{key};

	if ($key) {
	    PVE::Subscription::update_apt_auth($key, $server_id);
	}

	if (!$param->{force} && $info->{status} eq 'Active') {
	    my $age = time() -  $info->{checktime};
	    return undef if $age < $PVE::Subscription::localkeydays*60*60*24;
	}

	my $req_sockets = get_sockets();
	check_key($key, $req_sockets);

	my $dccfg = PVE::Cluster::cfs_read_file('datacenter.cfg');
	my $proxy = $dccfg->{http_proxy};

	$info = PVE::Subscription::check_subscription($key, $server_id, $proxy);

	PVE::INotify::write_file('subscription', $info);

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
		pattern => $subscription_pattern,
		maxLength => 32,
	    },
	},
    },
    returns => { type => 'null'},
    code => sub {
	my ($param) = @_;

	my $key = PVE::Tools::trim($param->{key});

	my $info = {
	    status => 'New',
	    key => $key,
	    checktime => time(),
	};

	my $req_sockets = get_sockets();
	my $server_id = PVE::API2Tools::get_hwaddress();

	check_key($key, $req_sockets);

	PVE::INotify::write_file('subscription', $info);

	my $dccfg = PVE::Cluster::cfs_read_file('datacenter.cfg');
	my $proxy = $dccfg->{http_proxy};

	$info = PVE::Subscription::check_subscription($key, $server_id, $proxy);

	PVE::INotify::write_file('subscription', $info);

	return undef;
    }});

1;
