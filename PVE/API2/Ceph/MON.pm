package PVE::API2::Ceph::MON;

use strict;
use warnings;

use Net::IP;
use File::Path;

use PVE::Ceph::Tools;
use PVE::Ceph::Services;
use PVE::Cluster qw(cfs_read_file cfs_write_file);
use PVE::JSONSchema qw(get_standard_option);
use PVE::Network;
use PVE::RADOS;
use PVE::RESTHandler;
use PVE::RPCEnvironment;
use PVE::Tools qw(run_command file_set_contents);

use base qw(PVE::RESTHandler);

my $find_mon_ip = sub {
    my ($pubnet, $node, $overwrite_ip) = @_;

    if (!$pubnet) {
	return $overwrite_ip // PVE::Cluster::remote_node_ip($node);
    }

    my $allowed_ips = PVE::Network::get_local_ip_from_cidr($pubnet);
    die "No IP configured and up from ceph public network '$pubnet'\n"
	if scalar(@$allowed_ips) < 1;

    if (!$overwrite_ip) {
	if (scalar(@$allowed_ips) == 1) {
	    return $allowed_ips->[0];
	}
	die "Multiple IPs for ceph public network '$pubnet' detected on $node:\n".
	    join("\n", @$allowed_ips) ."\nuse 'mon-address' to specify one of them.\n";
    } else {
	if (grep { $_ eq $overwrite_ip } @$allowed_ips) {
	    return $overwrite_ip;
	}
	die "Monitor IP '$overwrite_ip' not in ceph public network '$pubnet'\n"
	    if !PVE::Network::is_ip_in_cidr($overwrite_ip, $pubnet);

	die "Specified monitor IP '$overwrite_ip' not configured or up on $node!\n";
    }
};

__PACKAGE__->register_method ({
    name => 'listmon',
    path => '',
    method => 'GET',
    description => "Get Ceph monitor list.",
    proxyto => 'node',
    protected => 1,
    permissions => {
	check => ['perm', '/', [ 'Sys.Audit', 'Datastore.Audit' ], any => 1],
    },
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
		name => { type => 'string' },
		addr => { type => 'string' },
	    },
	},
	links => [ { rel => 'child', href => "{name}" } ],
    },
    code => sub {
	my ($param) = @_;

	PVE::Ceph::Tools::check_ceph_inited();

	my $res = [];

	my $cfg = cfs_read_file('ceph.conf');

	my $monhash = {};
	foreach my $section (keys %$cfg) {
	    my $d = $cfg->{$section};
	    if ($section =~ m/^mon\.(\S+)$/) {
		my $monid = $1;
		if ($d->{'mon addr'} && $d->{'host'}) {
		    $monhash->{$monid} = {
			addr => $d->{'mon addr'},
			host => $d->{'host'},
			name => $monid,
		    }
		}
	    }
	}

	eval {
	    my $rados = PVE::RADOS->new();
	    my $monstat = $rados->mon_command({ prefix => 'mon_status' });
	    my $mons = $monstat->{monmap}->{mons};
	    foreach my $d (@$mons) {
		next if !defined($d->{name});
		$monhash->{$d->{name}}->{rank} = $d->{rank};
		$monhash->{$d->{name}}->{addr} = $d->{addr};
		if (grep { $_ eq $d->{rank} } @{$monstat->{quorum}}) {
		    $monhash->{$d->{name}}->{quorum} = 1;
		}
	    }
	};
	warn $@ if $@;

	return PVE::RESTHandler::hash_to_array($monhash, 'name');
    }});

__PACKAGE__->register_method ({
    name => 'createmon',
    path => '',
    method => 'POST',
    description => "Create Ceph Monitor and Manager",
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
		description => "The ID for the monitor, when omitted the same as the nodename",
	    },
	    'exclude-manager' => {
		type => 'boolean',
		optional => 1,
		default => 0,
		description => "When set, only a monitor will be created.",
	    },
	    'mon-address' => {
		description => 'Overwrites autodetected monitor IP address. ' .
		               'Must be in the public network of ceph.',
		type => 'string', format => 'ip',
		optional => 1,
	    },
	},
    },
    returns => { type => 'string' },
    code => sub {
	my ($param) = @_;

	PVE::Ceph::Tools::check_ceph_installed('ceph_mon');

	PVE::Ceph::Tools::check_ceph_installed('ceph_mgr')
	    if (!$param->{'exclude-manager'});

	PVE::Ceph::Tools::check_ceph_inited();

	PVE::Ceph::Tools::setup_pve_symlinks();

	my $rpcenv = PVE::RPCEnvironment::get();

	my $authuser = $rpcenv->get_user();

	my $cfg = cfs_read_file('ceph.conf');

	my $moncount = 0;

	my $monaddrhash = {};

	my $systemd_managed = PVE::Ceph::Tools::systemd_managed();

	foreach my $section (keys %$cfg) {
	    next if $section eq 'global';
	    my $d = $cfg->{$section};
	    if ($section =~ m/^mon\./) {
		$moncount++;
		if ($d->{'mon addr'}) {
		    $monaddrhash->{$d->{'mon addr'}} = $section;
		}
	    }
	}

	my $monid = $param->{id} // $param->{node};

	my $monsection = "mon.$monid";
	my $pubnet = $cfg->{global}->{'public network'};
	my $ip = $find_mon_ip->($pubnet, $param->{node}, $param->{'mon-address'});

	my $monaddr = Net::IP::ip_is_ipv6($ip) ? "[$ip]:6789" : "$ip:6789";
	my $monname = $param->{node};

	die "monitor '$monsection' already exists\n" if $cfg->{$monsection};
	die "monitor address '$monaddr' already in use by '$monaddrhash->{$monaddr}'\n"
	    if $monaddrhash->{$monaddr};

	my $worker = sub  {
	    my $upid = shift;

	    my $pve_ckeyring_path = PVE::Ceph::Tools::get_config('pve_ckeyring_path');

	    if (! -f $pve_ckeyring_path) {
		run_command("ceph-authtool $pve_ckeyring_path --create-keyring " .
			    "--gen-key -n client.admin");
	    }

	    my $pve_mon_key_path = PVE::Ceph::Tools::get_config('pve_mon_key_path');
	    if (! -f $pve_mon_key_path) {
		run_command("cp $pve_ckeyring_path $pve_mon_key_path.tmp");
		run_command("ceph-authtool $pve_mon_key_path.tmp -n client.admin --set-uid=0 " .
			    "--cap mds 'allow' " .
			    "--cap osd 'allow *' " .
			    "--cap mgr 'allow *' " .
			    "--cap mon 'allow *'");
		run_command("cp $pve_mon_key_path.tmp /etc/ceph/ceph.client.admin.keyring") if $systemd_managed;
		run_command("chown ceph:ceph /etc/ceph/ceph.client.admin.keyring") if $systemd_managed;
		run_command("ceph-authtool $pve_mon_key_path.tmp --gen-key -n mon. --cap mon 'allow *'");
		run_command("mv $pve_mon_key_path.tmp $pve_mon_key_path");
	    }

	    my $ccname = PVE::Ceph::Tools::get_config('ccname');

	    my $mondir =  "/var/lib/ceph/mon/$ccname-$monid";
	    -d $mondir && die "monitor filesystem '$mondir' already exist\n";

	    my $monmap = "/tmp/monmap";

	    eval {
		mkdir $mondir;

		run_command("chown ceph:ceph $mondir") if $systemd_managed;

		if ($moncount > 0) {
		    my $rados = PVE::RADOS->new(timeout => PVE::Ceph::Tools::get_config('long_rados_timeout'));
		    my $mapdata = $rados->mon_command({ prefix => 'mon getmap', format => 'plain' });
		    file_set_contents($monmap, $mapdata);
		} else {
		    run_command("monmaptool --create --clobber --add $monid $monaddr --print $monmap");
		}

		run_command("ceph-mon --mkfs -i $monid --monmap $monmap --keyring $pve_mon_key_path");
		run_command("chown ceph:ceph -R $mondir") if $systemd_managed;
	    };
	    my $err = $@;
	    unlink $monmap;
	    if ($err) {
		File::Path::remove_tree($mondir);
		die $err;
	    }

	    $cfg->{$monsection} = {
		'host' => $monname,
		'mon addr' => $monaddr,
	    };

	    cfs_write_file('ceph.conf', $cfg);

	    my $create_keys_pid = fork();
	    if (!defined($create_keys_pid)) {
		die "Could not spawn ceph-create-keys to create bootstrap keys\n";
	    } elsif ($create_keys_pid == 0) {
		exit PVE::Tools::run_command(['ceph-create-keys', '-i', $monid]);
	    } else {
		PVE::Ceph::Services::ceph_service_cmd('start', $monsection);

		if ($systemd_managed) {
		    #to ensure we have the correct startup order.
		    eval { PVE::Tools::run_command(['/bin/systemctl', 'enable', "ceph-mon\@${monid}.service"]); };
		    warn "Enable ceph-mon\@${monid}.service manually"if $@;
		}
		waitpid($create_keys_pid, 0);
	    }

	    # create manager
	    if (!$param->{'exclude-manager'}) {
		my $rados = PVE::RADOS->new(timeout => PVE::Ceph::Tools::get_config('long_rados_timeout'));
		PVE::Ceph::Services::create_mgr($monid, $rados);
	    }
	};

	return $rpcenv->fork_worker('cephcreatemon', $monsection, $authuser, $worker);
    }});

__PACKAGE__->register_method ({
    name => 'destroymon',
    path => '{monid}',
    method => 'DELETE',
    description => "Destroy Ceph Monitor and Manager.",
    proxyto => 'node',
    protected => 1,
    permissions => {
	check => ['perm', '/', [ 'Sys.Modify' ]],
    },
    parameters => {
	additionalProperties => 0,
	properties => {
	    node => get_standard_option('pve-node'),
	    monid => {
		description => 'Monitor ID',
		type => 'string',
		pattern => '[a-zA-Z0-9]([a-zA-Z0-9\-]*[a-zA-Z0-9])?',
	    },
	    'exclude-manager' => {
		type => 'boolean',
		default => 0,
		optional => 1,
		description => "When set, removes only the monitor, not the manager"
	    }
	},
    },
    returns => { type => 'string' },
    code => sub {
	my ($param) = @_;

	my $rpcenv = PVE::RPCEnvironment::get();

	my $authuser = $rpcenv->get_user();

	PVE::Ceph::Tools::check_ceph_inited();

	my $cfg = cfs_read_file('ceph.conf');

	my $monid = $param->{monid};
	my $monsection = "mon.$monid";

	my $rados = PVE::RADOS->new();
	my $monstat = $rados->mon_command({ prefix => 'mon_status' });
	my $monlist = $monstat->{monmap}->{mons};

	die "no such monitor id '$monid'\n"
	    if !defined($cfg->{$monsection});

	my $ccname = PVE::Ceph::Tools::get_config('ccname');

	my $mondir =  "/var/lib/ceph/mon/$ccname-$monid";
	-d $mondir || die "monitor filesystem '$mondir' does not exist on this node\n";

	die "can't remove last monitor\n" if scalar(@$monlist) <= 1;

	my $worker = sub {
	    my $upid = shift;

	    # reopen with longer timeout
	    $rados = PVE::RADOS->new(timeout => PVE::Ceph::Tools::get_config('long_rados_timeout'));

	    $rados->mon_command({ prefix => "mon remove", name => $monid, format => 'plain' });

	    eval { PVE::Ceph::Services::ceph_service_cmd('stop', $monsection); };
	    warn $@ if $@;

	    delete $cfg->{$monsection};
	    cfs_write_file('ceph.conf', $cfg);
	    File::Path::remove_tree($mondir);

	    # remove manager
	    if (!$param->{'exclude-manager'}) {
		eval { PVE::Ceph::Services::destroy_mgr($monid) };
		warn $@ if $@;
	    }
	};

	return $rpcenv->fork_worker('cephdestroymon', $monsection,  $authuser, $worker);
    }});

1;
