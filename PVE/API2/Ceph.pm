package PVE::API2::Ceph;

use strict;
use warnings;

use File::Path;
use Net::IP;
use UUID;

use PVE::Ceph::Tools;
use PVE::Ceph::Services;
use PVE::Cluster qw(cfs_read_file cfs_write_file);
use PVE::JSONSchema qw(get_standard_option);
use PVE::Network;
use PVE::RADOS;
use PVE::RESTHandler;
use PVE::RPCEnvironment;
use PVE::Storage;
use PVE::Tools qw(run_command file_get_contents file_set_contents);

use PVE::API2::Ceph::OSD;
use PVE::API2::Ceph::FS;
use PVE::API2::Ceph::MDS;
use PVE::API2::Storage::Config;

use base qw(PVE::RESTHandler);

my $pve_osd_default_journal_size = 1024*5;

__PACKAGE__->register_method ({
    subclass => "PVE::API2::Ceph::OSD",
    path => 'osd',
});

__PACKAGE__->register_method ({
    subclass => "PVE::API2::Ceph::MDS",
    path => 'mds',
});

__PACKAGE__->register_method ({
    subclass => "PVE::API2::Ceph::FS",
    path => 'fs',
});

__PACKAGE__->register_method ({
    name => 'index',
    path => '',
    method => 'GET',
    description => "Directory index.",
    permissions => { user => 'all' },
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
	    properties => {},
	},
	links => [ { rel => 'child', href => "{name}" } ],
    },
    code => sub {
	my ($param) = @_;

	my $result = [
	    { name => 'init' },
	    { name => 'mon' },
	    { name => 'osd' },
	    { name => 'pools' },
	    { name => 'fs' },
	    { name => 'mds' },
	    { name => 'stop' },
	    { name => 'start' },
	    { name => 'status' },
	    { name => 'crush' },
	    { name => 'config' },
	    { name => 'log' },
	    { name => 'disks' },
	    { name => 'flags' },
	    { name => 'rules' },
	];

	return $result;
    }});

__PACKAGE__->register_method ({
    name => 'disks',
    path => 'disks',
    method => 'GET',
    description => "List local disks.",
    proxyto => 'node',
    protected => 1,
    permissions => {
	check => ['perm', '/', [ 'Sys.Audit', 'Datastore.Audit' ], any => 1],
    },
    parameters => {
	additionalProperties => 0,
	properties => {
	    node => get_standard_option('pve-node'),
	    type => {
		description => "Only list specific types of disks.",
		type => 'string',
		enum => ['unused', 'journal_disks'],
		optional => 1,
	    },
	},
    },
    returns => {
	type => 'array',
	items => {
	    type => "object",
	    properties => {
		dev => { type => 'string' },
		used => { type => 'string', optional => 1 },
		gpt => { type => 'boolean' },
		size => { type => 'integer' },
		osdid => { type => 'integer' },
		vendor =>  { type => 'string', optional => 1 },
		model =>  { type => 'string', optional => 1 },
		serial =>  { type => 'string', optional => 1 },
	    },
	},
	# links => [ { rel => 'child', href => "{}" } ],
    },
    code => sub {
	my ($param) = @_;

	PVE::Ceph::Tools::check_ceph_inited();

	my $disks = PVE::Diskmanage::get_disks(undef, 1);

	my $res = [];
	foreach my $dev (keys %$disks) {
	    my $d = $disks->{$dev};
	    if ($param->{type}) {
		if ($param->{type} eq 'journal_disks') {
		    next if $d->{osdid} >= 0;
		    next if !$d->{gpt};
		} elsif ($param->{type} eq 'unused') {
		    next if $d->{used};
		} else {
		    die "internal error"; # should not happen
		}
	    }

	    $d->{dev} = "/dev/$dev";
	    push @$res, $d;
	}

	return $res;
    }});

__PACKAGE__->register_method ({
    name => 'config',
    path => 'config',
    method => 'GET',
    permissions => {
	check => ['perm', '/', [ 'Sys.Audit', 'Datastore.Audit' ], any => 1],
    },
    description => "Get Ceph configuration.",
    parameters => {
	additionalProperties => 0,
	properties => {
	    node => get_standard_option('pve-node'),
	},
    },
    returns => { type => 'string' },
    code => sub {
	my ($param) = @_;

	PVE::Ceph::Tools::check_ceph_inited();

	my $path = PVE::Ceph::Tools::get_config('pve_ceph_cfgpath');
	return file_get_contents($path);

    }});

my $add_storage = sub {
    my ($pool, $storeid) = @_;

    my $storage_params = {
	type => 'rbd',
	pool => $pool,
	storage => $storeid,
	krbd => 0,
	content => 'rootdir,images',
    };

    PVE::API2::Storage::Config->create($storage_params);
};

my $get_storages = sub {
    my ($pool) = @_;

    my $cfg = PVE::Storage::config();

    my $storages = $cfg->{ids};
    my $res = {};
    foreach my $storeid (keys %$storages) {
	my $curr = $storages->{$storeid};
	$res->{$storeid} = $storages->{$storeid}
	    if $curr->{type} eq 'rbd' && $pool eq $curr->{pool};
    }

    return $res;
};

__PACKAGE__->register_method ({
    name => 'listmon',
    path => 'mon',
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
    name => 'init',
    path => 'init',
    method => 'POST',
    description => "Create initial ceph default configuration and setup symlinks.",
    proxyto => 'node',
    protected => 1,
    permissions => {
	check => ['perm', '/', [ 'Sys.Modify' ]],
    },
    parameters => {
	additionalProperties => 0,
	properties => {
	    node => get_standard_option('pve-node'),
	    network => {
		description => "Use specific network for all ceph related traffic",
		type => 'string', format => 'CIDR',
		optional => 1,
		maxLength => 128,
	    },
	    'cluster-network' => {
		description => "Declare a separate cluster network, OSDs will route" .
		    "heartbeat, object replication and recovery traffic over it",
		type => 'string', format => 'CIDR',
		requires => 'network',
		optional => 1,
		maxLength => 128,
	    },
	    size => {
		description => 'Targeted number of replicas per object',
		type => 'integer',
		default => 3,
		optional => 1,
		minimum => 1,
		maximum => 7,
	    },
	    min_size => {
		description => 'Minimum number of available replicas per object to allow I/O',
		type => 'integer',
		default => 2,
		optional => 1,
		minimum => 1,
		maximum => 7,
	    },
	    pg_bits => {
		description => "Placement group bits, used to specify the " .
		    "default number of placement groups.\n\nNOTE: 'osd pool " .
		    "default pg num' does not work for default pools.",
		type => 'integer',
		default => 6,
		optional => 1,
		minimum => 6,
		maximum => 14,
	    },
	    disable_cephx => {
		description => "Disable cephx authentification.\n\n" .
		    "WARNING: cephx is a security feature protecting against " .
		    "man-in-the-middle attacks. Only consider disabling cephx ".
		    "if your network is private!",
		type => 'boolean',
		optional => 1,
		default => 0,
	    },
	},
    },
    returns => { type => 'null' },
    code => sub {
	my ($param) = @_;

	my $version = PVE::Ceph::Tools::get_local_version(1);

	if (!$version || $version < 12) {
	    die "Ceph Luminous required - please run 'pveceph install'\n";
	} else {
	    PVE::Ceph::Tools::check_ceph_installed('ceph_bin');
	}

	# simply load old config if it already exists
	my $cfg = cfs_read_file('ceph.conf');

	if (!$cfg->{global}) {

	    my $fsid;
	    my $uuid;

	    UUID::generate($uuid);
	    UUID::unparse($uuid, $fsid);

	    my $auth = $param->{disable_cephx} ? 'none' : 'cephx';

	    $cfg->{global} = {
		'fsid' => $fsid,
		'auth cluster required' => $auth,
		'auth service required' => $auth,
		'auth client required' => $auth,
		'osd journal size' => $pve_osd_default_journal_size,
		'osd pool default size' => $param->{size} // 3,
		'osd pool default min size' => $param->{min_size} // 2,
		'mon allow pool delete' => 'true',
	    };

	    # this does not work for default pools
	    #'osd pool default pg num' => $pg_num,
	    #'osd pool default pgp num' => $pg_num,
	}

	$cfg->{global}->{keyring} = '/etc/pve/priv/$cluster.$name.keyring';
	$cfg->{osd}->{keyring} = '/var/lib/ceph/osd/ceph-$id/keyring';

	if ($param->{pg_bits}) {
	    $cfg->{global}->{'osd pg bits'} = $param->{pg_bits};
	    $cfg->{global}->{'osd pgp bits'} = $param->{pg_bits};
	}

	if ($param->{network}) {
	    $cfg->{global}->{'public network'} = $param->{network};
	    $cfg->{global}->{'cluster network'} = $param->{network};
	}

	if ($param->{'cluster-network'}) {
	    $cfg->{global}->{'cluster network'} = $param->{'cluster-network'};
	}

	cfs_write_file('ceph.conf', $cfg);

	PVE::Ceph::Tools::setup_pve_symlinks();

	return undef;
    }});

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
    name => 'createmon',
    path => 'mon',
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
    path => 'mon/{monid}',
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
		eval { PVE::Ceph::Services::destroy_mgr($mgrid) };
		warn $@ if $@;
	    }
	};

	return $rpcenv->fork_worker('cephdestroymon', $monsection,  $authuser, $worker);
    }});

__PACKAGE__->register_method ({
    name => 'createmgr',
    path => 'mgr',
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
    path => 'mgr/{id}',
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

__PACKAGE__->register_method ({
    name => 'stop',
    path => 'stop',
    method => 'POST',
    description => "Stop ceph services.",
    proxyto => 'node',
    protected => 1,
    permissions => {
	check => ['perm', '/', [ 'Sys.Modify' ]],
    },
    parameters => {
	additionalProperties => 0,
	properties => {
	    node => get_standard_option('pve-node'),
	    service => {
		description => 'Ceph service name.',
		type => 'string',
		optional => 1,
		default => 'ceph.target',
		pattern => '(mon|mds|osd|mgr)\.[A-Za-z0-9\-]{1,32}',
	    },
	},
    },
    returns => { type => 'string' },
    code => sub {
	my ($param) = @_;

	my $rpcenv = PVE::RPCEnvironment::get();

	my $authuser = $rpcenv->get_user();

	PVE::Ceph::Tools::check_ceph_inited();

	my $cfg = cfs_read_file('ceph.conf');
	scalar(keys %$cfg) || die "no configuration\n";

	my $worker = sub {
	    my $upid = shift;

	    my $cmd = ['stop'];
	    if ($param->{service}) {
		push @$cmd, $param->{service};
	    }

	    PVE::Ceph::Services::ceph_service_cmd(@$cmd);
	};

	return $rpcenv->fork_worker('srvstop', $param->{service} || 'ceph',
				    $authuser, $worker);
    }});

__PACKAGE__->register_method ({
    name => 'start',
    path => 'start',
    method => 'POST',
    description => "Start ceph services.",
    proxyto => 'node',
    protected => 1,
    permissions => {
	check => ['perm', '/', [ 'Sys.Modify' ]],
    },
    parameters => {
	additionalProperties => 0,
	properties => {
	    node => get_standard_option('pve-node'),
	    service => {
		description => 'Ceph service name.',
		type => 'string',
		optional => 1,
		default => 'ceph.target',
		pattern => '(mon|mds|osd|mgr)\.[A-Za-z0-9\-]{1,32}',
	    },
	},
    },
    returns => { type => 'string' },
    code => sub {
	my ($param) = @_;

	my $rpcenv = PVE::RPCEnvironment::get();

	my $authuser = $rpcenv->get_user();

	PVE::Ceph::Tools::check_ceph_inited();

	my $cfg = cfs_read_file('ceph.conf');
	scalar(keys %$cfg) || die "no configuration\n";

	my $worker = sub {
	    my $upid = shift;

	    my $cmd = ['start'];
	    if ($param->{service}) {
		push @$cmd, $param->{service};
	    }

	    PVE::Ceph::Services::ceph_service_cmd(@$cmd);
	};

	return $rpcenv->fork_worker('srvstart', $param->{service} || 'ceph',
				    $authuser, $worker);
    }});

__PACKAGE__->register_method ({
    name => 'restart',
    path => 'restart',
    method => 'POST',
    description => "Restart ceph services.",
    proxyto => 'node',
    protected => 1,
    permissions => {
	check => ['perm', '/', [ 'Sys.Modify' ]],
    },
    parameters => {
	additionalProperties => 0,
	properties => {
	    node => get_standard_option('pve-node'),
	    service => {
		description => 'Ceph service name.',
		type => 'string',
		optional => 1,
		default => 'ceph.target',
		pattern => '(mon|mds|osd|mgr)\.[A-Za-z0-9\-]{1,32}',
	    },
	},
    },
    returns => { type => 'string' },
    code => sub {
	my ($param) = @_;

	my $rpcenv = PVE::RPCEnvironment::get();

	my $authuser = $rpcenv->get_user();

	PVE::Ceph::Tools::check_ceph_inited();

	my $cfg = cfs_read_file('ceph.conf');
	scalar(keys %$cfg) || die "no configuration\n";

	my $worker = sub {
	    my $upid = shift;

	    my $cmd = ['restart'];
	    if ($param->{service}) {
		push @$cmd, $param->{service};
	    }

	    PVE::Ceph::Services::ceph_service_cmd(@$cmd);
	};

	return $rpcenv->fork_worker('srvrestart', $param->{service} || 'ceph',
				    $authuser, $worker);
    }});

__PACKAGE__->register_method ({
    name => 'status',
    path => 'status',
    method => 'GET',
    description => "Get ceph status.",
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
    returns => { type => 'object' },
    code => sub {
	my ($param) = @_;

	PVE::Ceph::Tools::check_ceph_enabled();

	my $rados = PVE::RADOS->new();
	my $status = $rados->mon_command({ prefix => 'status' });
	$status->{health} = $rados->mon_command({ prefix => 'health', detail => 'detail' });
	return $status;
    }});

__PACKAGE__->register_method ({
    name => 'lspools',
    path => 'pools',
    method => 'GET',
    description => "List all pools.",
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
		pool => { type => 'integer' },
		pool_name => { type => 'string' },
		size => { type => 'integer' },
	    },
	},
	links => [ { rel => 'child', href => "{pool_name}" } ],
    },
    code => sub {
	my ($param) = @_;

	PVE::Ceph::Tools::check_ceph_inited();

	my $rados = PVE::RADOS->new();

	my $stats = {};
	my $res = $rados->mon_command({ prefix => 'df' });

	foreach my $d (@{$res->{pools}}) {
	    next if !$d->{stats};
	    next if !defined($d->{id});
	    $stats->{$d->{id}} = $d->{stats};
	}

	$res = $rados->mon_command({ prefix => 'osd dump' });
	my $rulestmp = $rados->mon_command({ prefix => 'osd crush rule dump'});

	my $rules = {};
	for my $rule (@$rulestmp) {
	    $rules->{$rule->{rule_id}} = $rule->{rule_name};
	}

	my $data = [];
	foreach my $e (@{$res->{pools}}) {
	    my $d = {};
	    foreach my $attr (qw(pool pool_name size min_size pg_num crush_rule)) {
		$d->{$attr} = $e->{$attr} if defined($e->{$attr});
	    }

	    if (defined($d->{crush_rule}) && defined($rules->{$d->{crush_rule}})) {
		$d->{crush_rule_name} = $rules->{$d->{crush_rule}};
	    }

	    if (my $s = $stats->{$d->{pool}}) {
		$d->{bytes_used} = $s->{bytes_used};
		$d->{percent_used} = $s->{percent_used};
	    }
	    push @$data, $d;
	}


	return $data;
    }});

__PACKAGE__->register_method ({
    name => 'createpool',
    path => 'pools',
    method => 'POST',
    description => "Create POOL",
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
		description => "The name of the pool. It must be unique.",
		type => 'string',
	    },
	    size => {
		description => 'Number of replicas per object',
		type => 'integer',
		default => 3,
		optional => 1,
		minimum => 1,
		maximum => 7,
	    },
	    min_size => {
		description => 'Minimum number of replicas per object',
		type => 'integer',
		default => 2,
		optional => 1,
		minimum => 1,
		maximum => 7,
	    },
	    pg_num => {
		description => "Number of placement groups.",
		type => 'integer',
		default => 128,
		optional => 1,
		minimum => 8,
		maximum => 32768,
	    },
	    crush_rule => {
		description => "The rule to use for mapping object placement in the cluster.",
		type => 'string',
		optional => 1,
	    },
	    application => {
		description => "The application of the pool, 'rbd' by default.",
		type => 'string',
		enum => ['rbd', 'cephfs', 'rgw'],
		optional => 1,
	    },
	    add_storages => {
		description => "Configure VM and CT storage using the new pool.",
		type => 'boolean',
		optional => 1,
	    },
	},
    },
    returns => { type => 'string' },
    code => sub {
	my ($param) = @_;

	PVE::Cluster::check_cfs_quorum();
	PVE::Ceph::Tools::check_ceph_inited();

	my $pve_ckeyring_path = PVE::Ceph::Tools::get_config('pve_ckeyring_path');

	die "not fully configured - missing '$pve_ckeyring_path'\n"
	    if ! -f $pve_ckeyring_path;

	my $pool = $param->{name};
	my $rpcenv = PVE::RPCEnvironment::get();
	my $user = $rpcenv->get_user();

	if ($param->{add_storages}) {
	    $rpcenv->check($user, '/storage', ['Datastore.Allocate']);
	    die "pool name contains characters which are illegal for storage naming\n"
		if !PVE::JSONSchema::parse_storage_id($pool);
	}

	my $pg_num = $param->{pg_num} || 128;
	my $size = $param->{size} || 3;
	my $min_size = $param->{min_size} || 2;
	my $application = $param->{application} // 'rbd';

	my $worker = sub {

	    PVE::Ceph::Tools::create_pool($pool, $param);

	    if ($param->{add_storages}) {
		my $err;
		eval { $add_storage->($pool, "${pool}"); };
		if ($@) {
		    warn "failed to add storage: $@";
		    $err = 1;
		}
		die "adding storage for pool '$pool' failed, check log and add manually!\n"
		    if $err;
	    }
	};

	return $rpcenv->fork_worker('cephcreatepool', $pool,  $user, $worker);
    }});

__PACKAGE__->register_method ({
    name => 'get_flags',
    path => 'flags',
    method => 'GET',
    description => "get all set ceph flags",
    proxyto => 'node',
    protected => 1,
    permissions => {
	check => ['perm', '/', [ 'Sys.Audit' ]],
    },
    parameters => {
	additionalProperties => 0,
	properties => {
	    node => get_standard_option('pve-node'),
	},
    },
    returns => { type => 'string' },
    code => sub {
	my ($param) = @_;

	PVE::Ceph::Tools::check_ceph_inited();

	my $pve_ckeyring_path = PVE::Ceph::Tools::get_config('pve_ckeyring_path');

	die "not fully configured - missing '$pve_ckeyring_path'\n"
	    if ! -f $pve_ckeyring_path;

	my $rados = PVE::RADOS->new();

	my $stat = $rados->mon_command({ prefix => 'osd dump' });

	return $stat->{flags} // '';
    }});

__PACKAGE__->register_method ({
    name => 'set_flag',
    path => 'flags/{flag}',
    method => 'POST',
    description => "Set a ceph flag",
    proxyto => 'node',
    protected => 1,
    permissions => {
	check => ['perm', '/', [ 'Sys.Modify' ]],
    },
    parameters => {
	additionalProperties => 0,
	properties => {
	    node => get_standard_option('pve-node'),
	    flag => {
		description => 'The ceph flag to set/unset',
		type => 'string',
		enum => [ 'full', 'pause', 'noup', 'nodown', 'noout', 'noin', 'nobackfill', 'norebalance', 'norecover', 'noscrub', 'nodeep-scrub', 'notieragent'],
	    },
	},
    },
    returns => { type => 'null' },
    code => sub {
	my ($param) = @_;

	PVE::Ceph::Tools::check_ceph_inited();

	my $pve_ckeyring_path = PVE::Ceph::Tools::get_config('pve_ckeyring_path');

	die "not fully configured - missing '$pve_ckeyring_path'\n"
	    if ! -f $pve_ckeyring_path;

	my $set = $param->{set} // !$param->{unset};
	my $rados = PVE::RADOS->new();

	$rados->mon_command({
	    prefix => "osd set",
	    key => $param->{flag},
	});

	return undef;
    }});

__PACKAGE__->register_method ({
    name => 'unset_flag',
    path => 'flags/{flag}',
    method => 'DELETE',
    description => "Unset a ceph flag",
    proxyto => 'node',
    protected => 1,
    permissions => {
	check => ['perm', '/', [ 'Sys.Modify' ]],
    },
    parameters => {
	additionalProperties => 0,
	properties => {
	    node => get_standard_option('pve-node'),
	    flag => {
		description => 'The ceph flag to set/unset',
		type => 'string',
		enum => [ 'full', 'pause', 'noup', 'nodown', 'noout', 'noin', 'nobackfill', 'norebalance', 'norecover', 'noscrub', 'nodeep-scrub', 'notieragent'],
	    },
	},
    },
    returns => { type => 'null' },
    code => sub {
	my ($param) = @_;

	PVE::Ceph::Tools::check_ceph_inited();

	my $pve_ckeyring_path = PVE::Ceph::Tools::get_config('pve_ckeyring_path');

	die "not fully configured - missing '$pve_ckeyring_path'\n"
	    if ! -f $pve_ckeyring_path;

	my $set = $param->{set} // !$param->{unset};
	my $rados = PVE::RADOS->new();

	$rados->mon_command({
	    prefix => "osd unset",
	    key => $param->{flag},
	});

	return undef;
    }});

__PACKAGE__->register_method ({
    name => 'destroypool',
    path => 'pools/{name}',
    method => 'DELETE',
    description => "Destroy pool",
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
		description => "The name of the pool. It must be unique.",
		type => 'string',
	    },
	    force => {
		description => "If true, destroys pool even if in use",
		type => 'boolean',
		optional => 1,
		default => 0,
	    },
	    remove_storages => {
		description => "Remove all pveceph-managed storages configured for this pool",
		type => 'boolean',
		optional => 1,
		default => 0,
	    },
	},
    },
    returns => { type => 'string' },
    code => sub {
	my ($param) = @_;

	PVE::Ceph::Tools::check_ceph_inited();

	my $rpcenv = PVE::RPCEnvironment::get();
	my $user = $rpcenv->get_user();
	$rpcenv->check($user, '/storage', ['Datastore.Allocate'])
	    if $param->{remove_storages};

	my $pool = $param->{name};

	my $worker = sub {
	    my $storages = $get_storages->($pool);

	    # if not forced, destroy ceph pool only when no
	    # vm disks are on it anymore
	    if (!$param->{force}) {
		my $storagecfg = PVE::Storage::config();
		foreach my $storeid (keys %$storages) {
		    my $storage = $storages->{$storeid};

		    # check if any vm disks are on the pool
		    print "checking storage '$storeid' for RBD images..\n";
		    my $res = PVE::Storage::vdisk_list($storagecfg, $storeid);
		    die "ceph pool '$pool' still in use by storage '$storeid'\n"
			if @{$res->{$storeid}} != 0;
		}
	    }

	    PVE::Ceph::Tools::destroy_pool($pool);

	    if ($param->{remove_storages}) {
		my $err;
		foreach my $storeid (keys %$storages) {
		    # skip external clusters, not managed by pveceph
		    next if $storages->{$storeid}->{monhost};
		    eval { PVE::API2::Storage::Config->delete({storage => $storeid}) };
		    if ($@) {
			warn "failed to remove storage '$storeid': $@\n";
			$err = 1;
		    }
		}
		die "failed to remove (some) storages - check log and remove manually!\n"
		    if $err;
	    }
	};
	return $rpcenv->fork_worker('cephdestroypool', $pool,  $user, $worker);
    }});


__PACKAGE__->register_method ({
    name => 'crush',
    path => 'crush',
    method => 'GET',
    description => "Get OSD crush map",
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
    returns => { type => 'string' },
    code => sub {
	my ($param) = @_;

	PVE::Ceph::Tools::check_ceph_inited();

	# this produces JSON (difficult to read for the user)
	# my $txt = &$run_ceph_cmd_text(['osd', 'crush', 'dump'], quiet => 1);

	my $txt = '';

	my $mapfile = "/var/tmp/ceph-crush.map.$$";
	my $mapdata = "/var/tmp/ceph-crush.txt.$$";

	my $rados = PVE::RADOS->new();

	eval {
	    my $bindata = $rados->mon_command({ prefix => 'osd getcrushmap', format => 'plain' });
	    file_set_contents($mapfile, $bindata);
	    run_command(['crushtool', '-d', $mapfile, '-o', $mapdata]);
	    $txt = file_get_contents($mapdata);
	};
	my $err = $@;

	unlink $mapfile;
	unlink $mapdata;

	die $err if $err;

	return $txt;
    }});

__PACKAGE__->register_method({
    name => 'log',
    path => 'log',
    method => 'GET',
    description => "Read ceph log",
    proxyto => 'node',
    permissions => {
	check => ['perm', '/nodes/{node}', [ 'Sys.Syslog' ]],
    },
    protected => 1,
    parameters => {
	additionalProperties => 0,
	properties => {
	    node => get_standard_option('pve-node'),
	    start => {
		type => 'integer',
		minimum => 0,
		optional => 1,
	    },
	    limit => {
		type => 'integer',
		minimum => 0,
		optional => 1,
	    },
	},
    },
    returns => {
	type => 'array',
	items => {
	    type => "object",
	    properties => {
		n => {
		  description=>  "Line number",
		  type=> 'integer',
		},
		t => {
		  description=>  "Line text",
		  type => 'string',
		}
	    }
	}
    },
    code => sub {
	my ($param) = @_;

	PVE::Ceph::Tools::check_ceph_inited();

	my $rpcenv = PVE::RPCEnvironment::get();
	my $user = $rpcenv->get_user();
	my $node = $param->{node};

	my $logfile = "/var/log/ceph/ceph.log";
	my ($count, $lines) = PVE::Tools::dump_logfile($logfile, $param->{start}, $param->{limit});

	$rpcenv->set_result_attrib('total', $count);

	return $lines;
    }});

__PACKAGE__->register_method ({
    name => 'rules',
    path => 'rules',
    method => 'GET',
    description => "List ceph rules.",
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
	    properties => {},
	},
	links => [ { rel => 'child', href => "{name}" } ],
    },
    code => sub {
	my ($param) = @_;

	PVE::Ceph::Tools::check_ceph_inited();

	my $rados = PVE::RADOS->new();

	my $rules = $rados->mon_command({ prefix => 'osd crush rule ls' });

	my $res = [];

	foreach my $rule (@$rules) {
	    push @$res, { name => $rule };
	}

	return $res;
    }});

1;
