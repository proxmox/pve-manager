package PVE::API2Tools;

use strict;
use warnings;
use PVE::Tools;
use Digest::MD5 qw(md5_hex);
use URI;
use URI::Escape;
use PVE::SafeSyslog;

my $hwaddress;

sub get_hwaddress {
    
    return $hwaddress if defined ($hwaddress);

    my $fn = '/etc/ssh/ssh_host_rsa_key.pub';
    my $sshkey = PVE::Tools::file_get_contents($fn);
    $hwaddress = uc(md5_hex($sshkey));

    return $hwaddress;
}

sub extract_node_stats {
    my ($node, $members, $rrd) = @_;

    my $entry = {
	id => "node/$node",
	node => $node,
	type => "node",
    };

    if (my $d = $rrd->{"pve2-node/$node"}) {
		    
	if (!$members || # no cluster
	    ($members->{$node} && $members->{$node}->{online})) {
	    $entry->{uptime} = ($d->[0] || 0) + 0;
	    $entry->{cpu} = ($d->[5] || 0) + 0;
	    $entry->{mem} = ($d->[8] || 0) + 0;
	    $entry->{disk} = ($d->[12] || 0) + 0;
	}
	$entry->{level} = $d->[1];
	$entry->{maxcpu} = ($d->[4] || 0) + 0;
	$entry->{maxmem} = ($d->[7] || 0) + 0;
	$entry->{maxdisk} = ($d->[11] || 0) + 0;
    }

    return $entry;
}

sub extract_vm_stats {
    my ($vmid, $data, $rrd) = @_;

    my $entry = {
	id => "$data->{type}/$vmid",
	vmid => $vmid + 0, 
	node => $data->{node},
	type => $data->{type},
    };

    my $d;

    if ($d = $rrd->{"pve2-vm/$vmid"}) {

	$entry->{uptime} = ($d->[0] || 0) + 0;
	$entry->{name} = $d->[1];
	$entry->{status} = $entry->{uptime} ? 'running' : 'stopped';
	$entry->{maxcpu} = ($d->[3] || 0) + 0;
	$entry->{cpu} = ($d->[4] || 0) + 0;
	$entry->{maxmem} = ($d->[5] || 0) + 0;
	$entry->{mem} = ($d->[6] || 0) + 0;
	$entry->{maxdisk} = ($d->[7] || 0) + 0;
	$entry->{disk} = ($d->[8] || 0) + 0;
	$entry->{netin} = ($d->[9] || 0) + 0;
	$entry->{netout} = ($d->[10] || 0) + 0;
	$entry->{diskread} = ($d->[11] || 0) + 0;
	$entry->{diskwrite} = ($d->[12] || 0) + 0;
    
    } elsif ($d = $rrd->{"pve2.3-vm/$vmid"}) {

	$entry->{uptime} = ($d->[0] || 0) + 0;
	$entry->{name} = $d->[1];
	$entry->{status} = $d->[2];
	$entry->{template} = $d->[3] + 0;

	$entry->{maxcpu} = ($d->[5] || 0) + 0;
	$entry->{cpu} = ($d->[6] || 0) + 0;
	$entry->{maxmem} = ($d->[7] || 0) + 0;
	$entry->{mem} = ($d->[8] || 0) + 0;
	$entry->{maxdisk} = ($d->[9] || 0) + 0;
	$entry->{disk} = ($d->[10] || 0) + 0;
	$entry->{netin} = ($d->[11] || 0) + 0;
	$entry->{netout} = ($d->[12] || 0) + 0;
	$entry->{diskread} = ($d->[13] || 0) + 0;
	$entry->{diskwrite} = ($d->[14] || 0) + 0;
    };

    return $entry;
};

sub extract_storage_stats {
    my ($storeid, $scfg, $node, $rrd) = @_;

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

    return $entry;
};

sub parse_http_proxy {
    my ($proxyenv) = @_;

    my $uri = URI->new($proxyenv);

    my $scheme = $uri->scheme;
    my $host = $uri->host;
    my $port = $uri->port || 3128;

    my ($username, $password);

    if (defined(my $p_auth = $uri->userinfo())) {
	($username, $password) = map URI::Escape::uri_unescape($_), split(":", $p_auth, 2);
    }

    return ("$host:$port", $username, $password);
}

sub run_spiceterm {
    my ($authpath, $permissions, $vmid, $node, $proxy, $title, $shcmd) = @_;

    my $rpcenv = PVE::RPCEnvironment::get();

    my $authuser = $rpcenv->get_user();

    my $port = PVE::Tools::next_spice_port();
    
    my ($ticket, undef, $remote_viewer_config) = 
	PVE::AccessControl::remote_viewer_config($authuser, $vmid, $node, $proxy, $title, $port);

    my $timeout = 10; 

    my $cmd = ['/usr/bin/spiceterm', '--port', $port, '--addr', '127.0.0.1',
	       '--timeout', $timeout, '--authpath', $authpath, 
	       '--permissions', $permissions];

    my $dcconf = PVE::Cluster::cfs_read_file('datacenter.cfg');
    push @$cmd, '--keymap', $dcconf->{keyboard} if $dcconf->{keyboard};

    push @$cmd, '--', @$shcmd;

    my $realcmd = sub {
	my $upid = shift;

	syslog ('info', "starting spiceterm $upid - $title\n");

	my $cmdstr = join (' ', @$cmd);
	syslog ('info', "launch command: $cmdstr");

	eval { 
	    foreach my $k (keys %ENV) {
		next if $k eq 'PATH' || $k eq 'TERM' || $k eq 'USER' || $k eq 'HOME';
		delete $ENV{$k};
	    }
	    $ENV{PWD} = '/';
	    $ENV{SPICE_TICKET} = $ticket;
	    PVE::Tools::run_command($cmd, errmsg => "spiceterm failed"); 
	};
	if (my $err = $@) {
	    syslog ('err', $err);
	}

	return;
    };

    if ($vmid) {
	$rpcenv->fork_worker('spiceproxy', $vmid, $authuser, $realcmd);
    } else {
	$rpcenv->fork_worker('spiceshell', undef, $authuser, $realcmd);
    }

    PVE::Tools::wait_for_vnc_port($port);

    return $remote_viewer_config;
}

1;
