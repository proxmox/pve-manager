package PVE::API2::Ceph;

use strict;
use warnings;
use File::Basename;
use File::Path;
use POSIX qw (LONG_MAX);
use Cwd qw(abs_path);
use IO::Dir;
use UUID;
use Net::IP;

use PVE::SafeSyslog;
use PVE::Tools qw(extract_param run_command file_get_contents file_read_firstline dir_glob_regex dir_glob_foreach);
use PVE::Exception qw(raise raise_param_exc);
use PVE::INotify;
use PVE::Cluster qw(cfs_lock_file cfs_read_file cfs_write_file);
use PVE::AccessControl;
use PVE::Storage;
use PVE::RESTHandler;
use PVE::RPCEnvironment;
use PVE::JSONSchema qw(get_standard_option);
use JSON;
use PVE::RADOS;

use base qw(PVE::RESTHandler);

use Data::Dumper; # fixme: remove

my $ccname = 'ceph'; # ceph cluster name
my $ceph_cfgdir = "/etc/ceph";
my $pve_ceph_cfgpath = "/etc/pve/$ccname.conf";
my $ceph_cfgpath = "$ceph_cfgdir/$ccname.conf";
my $pve_mon_key_path = "/etc/pve/priv/$ccname.mon.keyring";
my $pve_ckeyring_path = "/etc/pve/priv/$ccname.client.admin.keyring";

my $ceph_bootstrap_osd_keyring = "/var/lib/ceph/bootstrap-osd/$ccname.keyring";
my $ceph_bootstrap_mds_keyring = "/var/lib/ceph/bootstrap-mds/$ccname.keyring";

my $ceph_bin = "/usr/bin/ceph";

my $pve_osd_default_journal_size = 1024*5;

sub purge_all_ceph_files {
    # fixme: this is very dangerous - should we really support this function?

    unlink $ceph_cfgpath;

    unlink $pve_ceph_cfgpath;
    unlink $pve_ckeyring_path;
    unlink $pve_mon_key_path;

    unlink $ceph_bootstrap_osd_keyring;
    unlink $ceph_bootstrap_mds_keyring;

    system("rm -rf /var/lib/ceph/mon/ceph-*");

    # remove osd?

}

my $check_ceph_installed = sub {
    my ($noerr) = @_;

    if (! -x $ceph_bin) {
	die "ceph binaries not installed\n" if !$noerr;
	return undef;
    }

    return 1;
};

my $check_ceph_inited = sub {
    my ($noerr) = @_;

    return undef if !&$check_ceph_installed($noerr);

    if (! -f $pve_ceph_cfgpath) {
	die "pveceph configuration not initialized\n" if !$noerr;
	return undef;
    }

    return 1;
};

my $check_ceph_enabled = sub {
    my ($noerr) = @_;

    return undef if !&$check_ceph_inited($noerr);

    if (! -f $ceph_cfgpath) {
	die "pveceph configuration not enabled\n" if !$noerr;
	return undef;
    }

    return 1;
};

my $parse_ceph_config = sub {
    my ($filename) = @_;

    my $cfg = {};

    return $cfg if ! -f $filename;

    my $fh = IO::File->new($filename, "r") ||
	die "unable to open '$filename' - $!\n";

    my $section;

    while (defined(my $line = <$fh>)) {
	$line =~ s/[;#].*$//;
	$line =~ s/^\s+//;
	$line =~ s/\s+$//;
	next if !$line;

	$section = $1 if $line =~ m/^\[(\S+)\]$/;
	if (!$section) {
	    warn "no section - skip: $line\n";
	    next;
	}

	if ($line =~ m/^(.*\S)\s*=\s*(\S.*)$/) {
	    $cfg->{$section}->{$1} = $2;
	}

    }

    return $cfg;
};

my $write_ceph_config = sub {
    my ($cfg) = @_;

    my $out = '';

    my $cond_write_sec = sub {
	my $re = shift;

	foreach my $section (keys %$cfg) {
	    next if $section !~ m/^$re$/;
	    $out .= "[$section]\n";
	    foreach my $key (sort keys %{$cfg->{$section}}) {
		$out .= "\t $key = $cfg->{$section}->{$key}\n";
	    }
	    $out .= "\n";
	}
    };

    &$cond_write_sec('global');
    &$cond_write_sec('mon');
    &$cond_write_sec('osd');
    &$cond_write_sec('mon\..*');
    &$cond_write_sec('osd\..*');

    PVE::Tools::file_set_contents($pve_ceph_cfgpath, $out);
};

my $setup_pve_symlinks = sub {
    # fail if we find a real file instead of a link
    if (-f $ceph_cfgpath) {
	my $lnk = readlink($ceph_cfgpath);
	die "file '$ceph_cfgpath' already exists\n"
	    if !$lnk || $lnk ne $pve_ceph_cfgpath;
    } else {
	symlink($pve_ceph_cfgpath, $ceph_cfgpath) ||
	    die "unable to create symlink '$ceph_cfgpath' - $!\n";
    }
};

my $ceph_service_cmd = sub {
    run_command(['service', 'ceph', '-c', $pve_ceph_cfgpath, @_]);
};

sub list_disks {
    my $disklist = {};
    
    my $fd = IO::File->new("/proc/mounts", "r") ||
	die "unable to open /proc/mounts - $!\n";

    my $mounted = {};

    while (defined(my $line = <$fd>)) {
	my ($dev, $path, $fstype) = split(/\s+/, $line);
	next if !($dev && $path && $fstype);
	next if $dev !~ m|^/dev/|;
	my $real_dev = abs_path($dev);
	$mounted->{$real_dev} = $path;
    }
    close($fd);

    my $dev_is_mounted = sub {
	my ($dev) = @_;
	return $mounted->{$dev};
    };

    my $dir_is_epmty = sub {
	my ($dir) = @_;

	my $dh = IO::Dir->new ($dir);
	return 1 if !$dh;
	
	while (defined(my $tmp = $dh->read)) {
	    next if $tmp eq '.' || $tmp eq '..';
	    $dh->close;
	    return 0;
	}
	$dh->close;
	return 1;
    };

    my $journal_uuid = '45b0969e-9b03-4f30-b4c6-b4b80ceff106';

    my $journalhash = {};
    dir_glob_foreach('/dev/disk/by-parttypeuuid', "$journal_uuid\..+", sub {
	my ($entry) = @_;
	my $real_dev = abs_path("/dev/disk/by-parttypeuuid/$entry");
	$journalhash->{$real_dev} = 1;
    });

    dir_glob_foreach('/sys/block', '.*', sub {
	my ($dev) = @_;

	return if $dev eq '.';
	return if $dev eq '..';

	return if $dev =~ m|^ram\d+$|; # skip ram devices
	return if $dev =~ m|^loop\d+$|; # skip loop devices
	return if $dev =~ m|^md\d+$|; # skip md devices
	return if $dev =~ m|^dm-.*$|; # skip dm related things
	return if $dev =~ m|^fd\d+$|; # skip Floppy
	return if $dev =~ m|^sr\d+$|; # skip CDs

	my $devdir = "/sys/block/$dev/device";
	return if ! -d $devdir;
	
	my $size = file_read_firstline("/sys/block/$dev/size");
	return if !$size;

	$size = $size * 512;

	my $info = `udevadm info --path /sys/block/$dev --query all`;
	return if !$info;

	return if $info !~ m/^E: DEVTYPE=disk$/m;
	return if $info =~ m/^E: ID_CDROM/m;

	my $serial = 'unknown';
	if ($info =~ m/^E: ID_SERIAL_SHORT=(\S+)$/m) {
	    $serial = $1;
	}

	my $gpt = 0;
	if ($info =~ m/^E: ID_PART_TABLE_TYPE=gpt$/m) {
	    $gpt = 1;
	}

	# detect SSD (fixme - currently only works for ATA disks)
	my $rpm = 7200; # default guess
	if ($info =~ m/^E: ID_ATA_ROTATION_RATE_RPM=(\d+)$/m) {
	    $rpm = $1;
	}

	my $vendor = file_read_firstline("$devdir/vendor") || 'unknown';
	my $model = file_read_firstline("$devdir/model") || 'unknown';

	my $used;

	$used = 'LVM' if !&$dir_is_epmty("/sys/block/$dev/holders");

	$used = 'mounted' if &$dev_is_mounted("/dev/$dev");

	$disklist->{$dev} = { 
	    vendor => $vendor, 
	    model => $model, 
	    size => $size,
	    serial => $serial,
	    gpt => $gpt,
	    rmp => $rpm,
	}; 

	my $osdid = -1;

	my $journal_count = 0;

	my $found_partitions;
	my $found_lvm;
	my $found_mountpoints;
	dir_glob_foreach("/sys/block/$dev", "$dev.+", sub {
	    my ($part) = @_;

	    $found_partitions = 1;

	    if (my $mp = &$dev_is_mounted("/dev/$part")) {
		$found_mountpoints = 1;
		if ($mp =~ m|^/var/lib/ceph/osd/ceph-(\d+)$|) {
		    $osdid = $1;
		} 
	    }
	    if (!&$dir_is_epmty("/sys/block/$dev/$part/holders"))  {
		$found_lvm = 1;
	    }
	    $journal_count++ if $journalhash->{"/dev/$part"};
	});

	$used = 'mounted' if $found_mountpoints && !$used;
	$used = 'LVM' if $found_lvm && !$used;
	$used = 'partitions' if $found_partitions && !$used;

	$disklist->{$dev}->{used} = $used if $used;
	$disklist->{$dev}->{osdid} = $osdid;
	$disklist->{$dev}->{journals} = $journal_count;
    });

    return $disklist;
}

my $lookup_diskinfo = sub {
    my ($disklist, $disk) = @_;

    my $real_dev = abs_path($disk);
    $real_dev =~ s|/dev/||;
    my $diskinfo = $disklist->{$real_dev};
    
    die "disk '$disk' not found in disk list\n" if !$diskinfo;

    return wantarray ? ($diskinfo, $real_dev) : $diskinfo;
};

 
my $count_journal_disks = sub {
    my ($disklist, $disk) = @_;

    my $count = 0;

    my ($diskinfo, $real_dev) = &$lookup_diskinfo($disklist, $disk);
    die "journal disk '$disk' does not contain a GUID partition table\n" 
	if !$diskinfo->{gpt};

    $count = $diskinfo->{journals} if $diskinfo->{journals};

    return $count;
};

__PACKAGE__->register_method ({
    name => 'index',
    path => '',
    method => 'GET',
    description => "Directory index.",
    permissions => { user => 'all' },
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
	    { name => 'stop' },
	    { name => 'start' },
	    { name => 'status' },
	    { name => 'crush' },
	    { name => 'config' },
	    { name => 'log' },
	    { name => 'disks' },
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

	&$check_ceph_inited();

	my $disks = list_disks();

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

	&$check_ceph_inited();

	return PVE::Tools::file_get_contents($pve_ceph_cfgpath);

    }});

__PACKAGE__->register_method ({
    name => 'listmon',
    path => 'mon',
    method => 'GET',
    description => "Get Ceph monitor list.",
    proxyto => 'node',
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
		name => { type => 'string' },
		addr => { type => 'string' },
	    },
	},
	links => [ { rel => 'child', href => "{name}" } ],
    },
    code => sub {
	my ($param) = @_;

	&$check_ceph_inited();

	my $res = [];

	my $cfg = &$parse_ceph_config($pve_ceph_cfgpath);

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
	    size => {
		description => 'Number of replicas per object',
		type => 'integer',
		default => 2,
		optional => 1,
		minimum => 1,
		maximum => 3,
	    },
	    pg_bits => {
		description => "Placement group bits, used to specify the default number of placement groups (Note: 'osd pool default pg num' does not work for deafult pools)",
		type => 'integer',
		default => 6,
		optional => 1,
		minimum => 6,
		maximum => 14,
	    },
	},
    },
    returns => { type => 'null' },
    code => sub {
	my ($param) = @_;

	&$check_ceph_installed();

	# simply load old config if it already exists
	my $cfg = &$parse_ceph_config($pve_ceph_cfgpath);

	if (!$cfg->{global}) {

	    my $fsid;
	    my $uuid;

	    UUID::generate($uuid);
	    UUID::unparse($uuid, $fsid);

	    $cfg->{global} = {
		'fsid' => $fsid,
		'auth supported' => 'cephx',
		'auth cluster required' => 'cephx',
		'auth service required' => 'cephx',
		'auth client required' => 'cephx',
		'filestore xattr use omap' => 'true',
		'osd journal size' => $pve_osd_default_journal_size,
		'osd pool default min size' => 1,
	    };

	    # this does not work for default pools 
	    #'osd pool default pg num' => $pg_num,
	    #'osd pool default pgp num' => $pg_num, 
	}
	
	$cfg->{global}->{keyring} = '/etc/pve/priv/$cluster.$name.keyring';
	$cfg->{osd}->{keyring} = '/var/lib/ceph/osd/ceph-$id/keyring';

	$cfg->{global}->{'osd pool default size'} = $param->{size} if $param->{size};

	if ($param->{pg_bits}) {
	    $cfg->{global}->{'osd pg bits'} = $param->{pg_bits};
	    $cfg->{global}->{'osd pgp bits'} = $param->{pg_bits};
	}

	if ($param->{network}) {
	    $cfg->{global}->{'public network'} = $param->{network};
	    $cfg->{global}->{'cluster network'} = $param->{network};
	}

	&$write_ceph_config($cfg);

	&$setup_pve_symlinks();

	return undef;
    }});

my $find_node_ip = sub {
    my ($cidr) = @_;

    my $config = PVE::INotify::read_file('interfaces');

    my $net = Net::IP->new($cidr) || die Net::IP::Error() . "\n";

    foreach my $iface (keys %$config) {
	my $d = $config->{$iface};
	next if !$d->{address};
	my $a = Net::IP->new($d->{address});
	next if !$a;
	return $d->{address} if $net->overlaps($a);
    }

    die "unable to find local address within network '$cidr'\n";
};

__PACKAGE__->register_method ({
    name => 'createmon',
    path => 'mon',
    method => 'POST',
    description => "Create Ceph Monitor",
    proxyto => 'node',
    protected => 1,
    parameters => {
    	additionalProperties => 0,
	properties => {
	    node => get_standard_option('pve-node'),
	},
    },
    returns => { type => 'string' },
    code => sub {
	my ($param) = @_;

	&$check_ceph_inited();

	&$setup_pve_symlinks();

	my $rpcenv = PVE::RPCEnvironment::get();

	my $authuser = $rpcenv->get_user();

	my $cfg = &$parse_ceph_config($pve_ceph_cfgpath);

	my $moncount = 0;

	my $monaddrhash = {}; 

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

	my $monid;
	for (my $i = 0; $i < 7; $i++) {
	    if (!$cfg->{"mon.$i"}) {
		$monid = $i;
		last;
	    }
	}
	die "unable to find usable monitor id\n" if !defined($monid);

	my $monsection = "mon.$monid"; 
	my $ip;
	if (my $pubnet = $cfg->{global}->{'public network'}) {
	    $ip = &$find_node_ip($pubnet);
	} else {
	    $ip = PVE::Cluster::remote_node_ip($param->{node});
	}

	my $monaddr = "$ip:6789";
	my $monname = $param->{node};

	die "monitor '$monsection' already exists\n" if $cfg->{$monsection};
	die "monitor address '$monaddr' already in use by '$monaddrhash->{$monaddr}'\n" 
	    if $monaddrhash->{$monaddr};

	my $worker = sub  {
	    my $upid = shift;

	    if (! -f $pve_ckeyring_path) {
		run_command("ceph-authtool $pve_ckeyring_path --create-keyring " .
			    "--gen-key -n client.admin");
	    }

	    if (! -f $pve_mon_key_path) {
		run_command("cp $pve_ckeyring_path $pve_mon_key_path.tmp");
		run_command("ceph-authtool $pve_mon_key_path.tmp -n client.admin --set-uid=0 " .
			    "--cap mds 'allow' " .
			    "--cap osd 'allow *' " .
			    "--cap mon 'allow *'");
		run_command("ceph-authtool $pve_mon_key_path.tmp --gen-key -n mon. --cap mon 'allow *'");
		run_command("mv $pve_mon_key_path.tmp $pve_mon_key_path");
	    }

	    my $mondir =  "/var/lib/ceph/mon/$ccname-$monid";
	    -d $mondir && die "monitor filesystem '$mondir' already exist\n";
 
	    my $monmap = "/tmp/monmap";
	
	    eval {
		mkdir $mondir;

		if ($moncount > 0) {
		    my $rados = PVE::RADOS->new();
		    my $mapdata = $rados->mon_command({ prefix => 'mon getmap', format => 'plain' });
		    PVE::Tools::file_set_contents($monmap, $mapdata);
		} else {
		    run_command("monmaptool --create --clobber --add $monid $monaddr --print $monmap");
		}

		run_command("ceph-mon --mkfs -i $monid --monmap $monmap --keyring $pve_mon_key_path");
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

	    &$write_ceph_config($cfg);

	    &$ceph_service_cmd('start', $monsection);
	};

	return $rpcenv->fork_worker('cephcreatemon', $monsection, $authuser, $worker);
    }});

__PACKAGE__->register_method ({
    name => 'destroymon',
    path => 'mon/{monid}',
    method => 'DELETE',
    description => "Destroy Ceph monitor.",
    proxyto => 'node',
    protected => 1,
    parameters => {
    	additionalProperties => 0,
	properties => {
	    node => get_standard_option('pve-node'),
	    monid => {
		description => 'Monitor ID',
		type => 'integer',
	    },
	},
    },
    returns => { type => 'string' },
    code => sub {
	my ($param) = @_;

	my $rpcenv = PVE::RPCEnvironment::get();

	my $authuser = $rpcenv->get_user();

	&$check_ceph_inited();

	my $cfg = &$parse_ceph_config($pve_ceph_cfgpath);
       
	my $monid = $param->{monid};
	my $monsection = "mon.$monid";	

	my $rados = PVE::RADOS->new();
	my $monstat = $rados->mon_command({ prefix => 'mon_status' });
	my $monlist = $monstat->{monmap}->{mons};

	die "no such monitor id '$monid'\n" 
	    if !defined($cfg->{$monsection});

	my $mondir =  "/var/lib/ceph/mon/$ccname-$monid";
	-d $mondir || die "monitor filesystem '$mondir' does not exist on this node\n";

	die "can't remove last monitor\n" if scalar(@$monlist) <= 1;

	my $worker = sub {
	    my $upid = shift;

	    $rados->mon_command({ prefix => "mon remove", name => $monid });

	    eval { &$ceph_service_cmd('stop', $monsection); };
	    warn $@ if $@;

	    delete $cfg->{$monsection};
	    &$write_ceph_config($cfg);
	    File::Path::remove_tree($mondir);
	};

	return $rpcenv->fork_worker('cephdestroymon', $monsection,  $authuser, $worker);
    }});

__PACKAGE__->register_method ({
    name => 'stop',
    path => 'stop',
    method => 'POST',
    description => "Stop ceph services.",
    proxyto => 'node',
    protected => 1,
    parameters => {
    	additionalProperties => 0,
	properties => {
	    node => get_standard_option('pve-node'),
	    service => {
		description => 'Ceph service name.',
		type => 'string',
		optional => 1,
		pattern => '(mon|mds|osd)\.[A-Za-z0-9]{1,32}',
	    },
	},
    },
    returns => { type => 'string' },
    code => sub {
	my ($param) = @_;

	my $rpcenv = PVE::RPCEnvironment::get();

	my $authuser = $rpcenv->get_user();

	&$check_ceph_inited();

	my $cfg = &$parse_ceph_config($pve_ceph_cfgpath);
	scalar(keys %$cfg) || die "no configuration\n";

	my $worker = sub {
	    my $upid = shift;

	    my $cmd = ['stop'];
	    if ($param->{service}) {
		push @$cmd, $param->{service};
	    }

	    &$ceph_service_cmd(@$cmd);
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
    parameters => {
    	additionalProperties => 0,
	properties => {
	    node => get_standard_option('pve-node'),
	    service => {
		description => 'Ceph service name.',
		type => 'string',
		optional => 1,
		pattern => '(mon|mds|osd)\.[A-Za-z0-9]{1,32}',
	    },
	},
    },
    returns => { type => 'string' },
    code => sub {
	my ($param) = @_;

	my $rpcenv = PVE::RPCEnvironment::get();

	my $authuser = $rpcenv->get_user();

	&$check_ceph_inited();

	my $cfg = &$parse_ceph_config($pve_ceph_cfgpath);
	scalar(keys %$cfg) || die "no configuration\n";

	my $worker = sub {
	    my $upid = shift;

	    my $cmd = ['start'];
	    if ($param->{service}) {
		push @$cmd, $param->{service};
	    }

	    &$ceph_service_cmd(@$cmd);
	};

	return $rpcenv->fork_worker('srvstart', $param->{service} || 'ceph',
				    $authuser, $worker);
    }});

__PACKAGE__->register_method ({
    name => 'status',
    path => 'status',
    method => 'GET',
    description => "Get ceph status.",
    proxyto => 'node',
    protected => 1,
    parameters => {
    	additionalProperties => 0,
	properties => {
	    node => get_standard_option('pve-node'),
	},
    },
    returns => { type => 'object' },
    code => sub {
	my ($param) = @_;

	&$check_ceph_enabled();

	my $rados = PVE::RADOS->new();
	return $rados->mon_command({ prefix => 'status' });
    }});

__PACKAGE__->register_method ({
    name => 'lspools',
    path => 'pools',
    method => 'GET',
    description => "List all pools.",
    proxyto => 'node',
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
		pool => { type => 'integer' },
		pool_name => { type => 'string' },
		size => { type => 'integer' },
	    },
	},
	links => [ { rel => 'child', href => "{pool_name}" } ],
    },
    code => sub {
	my ($param) = @_;

	&$check_ceph_inited();

	my $rados = PVE::RADOS->new();
	my $res = $rados->mon_command({ prefix => 'osd dump' });

	my $data = [];
	foreach my $e (@{$res->{pools}}) {
	    my $d = {};
	    foreach my $attr (qw(pool pool_name size min_size pg_num crush_ruleset)) {
		$d->{$attr} = $e->{$attr} if defined($e->{$attr});
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
		default => 2,
		optional => 1,
		minimum => 1,
		maximum => 3,
	    },
	    min_size => {
		description => 'Minimum number of replicas per object',
		type => 'integer',
		default => 1,
		optional => 1,
		minimum => 1,
		maximum => 3,
	    },
	    pg_num => {
		description => "Number of placement groups.",
		type => 'integer',
		default => 64,
		optional => 1,
		minimum => 8,
		maximum => 32768,
	    },
	    crush_ruleset => {
		description => "The ruleset to use for mapping object placement in the cluster.",
		type => 'integer',
		minimum => 0,
		maximum => 32768,
		default => 0,
		optional => 1,
	    },
	},
    },
    returns => { type => 'null' },
    code => sub {
	my ($param) = @_;

	&$check_ceph_inited();

	die "not fully configured - missing '$pve_ckeyring_path'\n" 
	    if ! -f $pve_ckeyring_path;

	my $pg_num = $param->{pg_num} || 64;
	my $size = $param->{size} || 2;
	my $min_size = $param->{min_size} || 1;
	my $ruleset = $param->{crush_ruleset} || 0;
	my $rados = PVE::RADOS->new();

	$rados->mon_command({ 
	    prefix => "osd pool create",
	    pool => $param->{name},
	    pg_num => int($pg_num),
# this does not work for unknown reason
#	    properties => ["size=$size", "min_size=$min_size", "crush_ruleset=$ruleset"],
	});

	$rados->mon_command({ 
	    prefix => "osd pool set",
	    pool => $param->{name},
	    var => 'min_size',
	    val => $min_size
	});

	$rados->mon_command({ 
	    prefix => "osd pool set",
	    pool => $param->{name},
	    var => 'size',
	    val => $size,
	});

	if (defined($param->{crush_ruleset})) {
	    $rados->mon_command({ 
		prefix => "osd pool set",
		pool => $param->{name},
		var => 'crush_ruleset',
		val => $param->{crush_ruleset},
	    });
	}

	return undef;
    }});

__PACKAGE__->register_method ({
    name => 'destroypool',
    path => 'pools/{name}',
    method => 'DELETE',
    description => "Destroy pool",
    proxyto => 'node',
    protected => 1,
    parameters => {
    	additionalProperties => 0,
	properties => {
	    node => get_standard_option('pve-node'),
	    name => {
		description => "The name of the pool. It must be unique.",
		type => 'string',
	    },
	},
    },
    returns => { type => 'null' },
    code => sub {
	my ($param) = @_;

	&$check_ceph_inited();

	my $rados = PVE::RADOS->new();
	# fixme: '--yes-i-really-really-mean-it'
	$rados->mon_command({ 
	    prefix => "osd pool delete",
	    pool => $param->{name},
	    pool2 => $param->{name},
	    sure => '--yes-i-really-really-mean-it'});

	return undef;
    }});

__PACKAGE__->register_method ({
    name => 'listosd',
    path => 'osd',
    method => 'GET',
    description => "Get Ceph osd list/tree.",
    proxyto => 'node',
    protected => 1,
    parameters => {
    	additionalProperties => 0,
	properties => {
	    node => get_standard_option('pve-node'),
	},
    },
    returns => {
	type => "object",
    },
    code => sub {
	my ($param) = @_;

	&$check_ceph_inited();

	my $rados = PVE::RADOS->new();
	my $res = $rados->mon_command({ prefix => 'osd tree' });

        die "no tree nodes found\n" if !($res && $res->{nodes});

	my $nodes = {};
	my $newnodes = {};
	foreach my $e (@{$res->{nodes}}) {
	    $nodes->{$e->{id}} = $e;
	    
	    my $new = { 
		id => $e->{id}, 
		name => $e->{name}, 
		type => $e->{type}
	    };

	    foreach my $opt (qw(status crush_weight reweight)) {
		$new->{$opt} = $e->{$opt} if defined($e->{$opt});
	    }

	    $newnodes->{$e->{id}} = $new;
	}

	foreach my $e (@{$res->{nodes}}) {
	    my $new = $newnodes->{$e->{id}};
	    if ($e->{children} && scalar(@{$e->{children}})) {
		$new->{children} = [];
		$new->{leaf} = 0;
		foreach my $cid (@{$e->{children}}) {
		    $nodes->{$cid}->{parent} = $e->{id};
		    if ($nodes->{$cid}->{type} eq 'osd' &&
			$e->{type} eq 'host') {
			$newnodes->{$cid}->{host} = $e->{name};
		    }
		    push @{$new->{children}}, $newnodes->{$cid};
		}
	    } else {
		$new->{leaf} = ($e->{id} >= 0) ? 1 : 0;
	    }
	}

	my $rootnode;
	foreach my $e (@{$res->{nodes}}) {
	    if (!$nodes->{$e->{id}}->{parent}) {
		$rootnode = $newnodes->{$e->{id}};
		last;
	    }
	}

	die "no root node\n" if !$rootnode;

	my $data = { root => $rootnode };

	return $data;
    }});

__PACKAGE__->register_method ({
    name => 'createosd',
    path => 'osd',
    method => 'POST',
    description => "Create OSD",
    proxyto => 'node',
    protected => 1,
    parameters => {
    	additionalProperties => 0,
	properties => {
	    node => get_standard_option('pve-node'),
	    dev => {
		description => "Block device name.",
		type => 'string',
	    },
	    journal_dev => {
		description => "Block device name for journal.",
		optional => 1,
		type => 'string',
	    },
	    fstype => {
		description => "File system type.",
		type => 'string',
		enum => ['xfs', 'ext4', 'btrfs'],
		default => 'xfs',
		optional => 1,
	    },
	},
    },
    returns => { type => 'string' },
    code => sub {
	my ($param) = @_;

	my $rpcenv = PVE::RPCEnvironment::get();

	my $authuser = $rpcenv->get_user();

	&$check_ceph_inited();

	&$setup_pve_symlinks();

	my $journal_dev;

	if ($param->{journal_dev} && ($param->{journal_dev} ne $param->{dev})) {
	    -b  $param->{journal_dev} || die "no such block device '$param->{journal_dev}'\n";
	    $journal_dev = $param->{journal_dev};
	}

	-b  $param->{dev} || die "no such block device '$param->{dev}'\n";

	my $disklist = list_disks();

	my $devname = $param->{dev};
	$devname =~ s|/dev/||;
       
	my $diskinfo = $disklist->{$devname};
	die "unable to get device info for '$devname'\n"
	    if !$diskinfo;

	die "device '$param->{dev}' is in use\n" 
	    if $diskinfo->{used};

	my $rados = PVE::RADOS->new();
	my $monstat = $rados->mon_command({ prefix => 'mon_status' });
	die "unable to get fsid\n" if !$monstat->{monmap} || !$monstat->{monmap}->{fsid};
	my $fsid = $monstat->{monmap}->{fsid};

	if (! -f $ceph_bootstrap_osd_keyring) {
	    my $bindata = $rados->mon_command({ prefix => 'auth get client.bootstrap-osd', format => 'plain' });
	    PVE::Tools::file_set_contents($ceph_bootstrap_osd_keyring, $bindata);
	};

	my $worker = sub {
	    my $upid = shift;

	    my $fstype = $param->{fstype} || 'xfs';

	    print "create OSD on $param->{dev} ($fstype)\n";

	    my $cmd = ['ceph-disk', 'prepare', '--zap-disk', '--fs-type', $fstype,
		       '--cluster', $ccname, '--cluster-uuid', $fsid ];

	    if ($journal_dev) {
		print "using device '$journal_dev' for journal\n";
		push @$cmd, '--journal-dev', $param->{dev}, $journal_dev;
	    } else {
		push @$cmd, $param->{dev};
	    }
	    
	    run_command($cmd);
	};

	return $rpcenv->fork_worker('cephcreateosd', $devname,  $authuser, $worker);
    }});

__PACKAGE__->register_method ({
    name => 'destroyosd',
    path => 'osd/{osdid}',
    method => 'DELETE',
    description => "Destroy OSD",
    proxyto => 'node',
    protected => 1,
    parameters => {
    	additionalProperties => 0,
	properties => {
	    node => get_standard_option('pve-node'),
	    osdid => {
		description => 'OSD ID',
		type => 'integer',
	    },
	    cleanup => {
		description => "If set, we remove partition table entries.",
		type => 'boolean',
		optional => 1,
		default => 0,
	    },
	},
    },
    returns => { type => 'string' },
    code => sub {
	my ($param) = @_;

	my $rpcenv = PVE::RPCEnvironment::get();

	my $authuser = $rpcenv->get_user();

	&$check_ceph_inited();

	my $osdid = $param->{osdid};

	# fixme: not 100% sure what we should do here
 
	my $rados = PVE::RADOS->new();
	my $stat = $rados->mon_command({ prefix => 'osd dump' });

	my $osdlist = $stat->{osds} || [];

	my $osdstat;
	foreach my $d (@$osdlist) {
	    if ($d->{osd} == $osdid) {
		$osdstat = $d;
		last;
	    }
	}
	die "no such OSD '$osdid'\n" if !$osdstat;

	die "osd is in use (in == 1)\n" if $osdstat->{in};
	#&$run_ceph_cmd(['osd', 'out', $osdid]);

	die "osd is still runnung (up == 1)\n" if $osdstat->{up};

	my $osdsection = "osd.$osdid";

	my $worker = sub {
	    my $upid = shift;

	    print "destroy OSD $osdsection\n";

	    eval { &$ceph_service_cmd('stop', $osdsection); };
	    warn $@ if $@;

	    print "Remove $osdsection from the CRUSH map\n";
	    $rados->mon_command({ prefix => "osd crush remove", name => $osdsection });

	    print "Remove the $osdsection authentication key.\n";
	    $rados->mon_command({ prefix => "auth del", entity => $osdsection });

	    print "Remove OSD $osdsection\n";
	    $rados->mon_command({ prefix => "osd rm", ids => "$osdid" });

	    # try to unmount from standard mount point
	    my $mountpoint = "/var/lib/ceph/osd/ceph-$osdid";

	    my $remove_partition = sub {
		my ($disklist, $part) = @_;

		return if !$part || (! -b $part );
		   
		foreach my $real_dev (keys %$disklist) {
		    my $diskinfo = $disklist->{$real_dev};
		    next if !$diskinfo->{gpt};
		    if ($part =~ m|^/dev/${real_dev}(\d+)$|) {
			my $partnum = $1;
			print "remove partition $part (disk '/dev/${real_dev}', partnum $partnum)\n";
			eval { run_command(['/sbin/sgdisk', '-d', $partnum, "/dev/${real_dev}"]); };
			warn $@ if $@;
			last;
		    }
		}
	    };

	    my $journal_part;
	    my $data_part;
	    
	    if ($param->{cleanup}) {
		my $jpath = "$mountpoint/journal";
		$journal_part = abs_path($jpath);

		if (my $fd = IO::File->new("/proc/mounts", "r")) {
		    while (defined(my $line = <$fd>)) {
			my ($dev, $path, $fstype) = split(/\s+/, $line);
			next if !($dev && $path && $fstype);
			next if $dev !~ m|^/dev/|;
			if ($path eq $mountpoint) {
			    $data_part = abs_path($dev);
			    last;
			}
		    }
		    close($fd);
		}
	    }

	    print "Unmount OSD $osdsection from  $mountpoint\n";
	    eval { run_command(['umount', $mountpoint]); };
	    if (my $err = $@) {
		warn $err;
	    } elsif ($param->{cleanup}) {
		my $disklist = list_disks();
		&$remove_partition($disklist, $journal_part);
		&$remove_partition($disklist, $data_part);
	    }
	};

	return $rpcenv->fork_worker('cephdestroyosd', $osdsection,  $authuser, $worker);
    }});

__PACKAGE__->register_method ({
    name => 'crush',
    path => 'crush',
    method => 'GET',
    description => "Get OSD crush map",
    proxyto => 'node',
    protected => 1,
    parameters => {
    	additionalProperties => 0,
	properties => {
	    node => get_standard_option('pve-node'),
	},
    },
    returns => { type => 'string' },
    code => sub {
	my ($param) = @_;

	&$check_ceph_inited();

	# this produces JSON (difficult to read for the user)
	# my $txt = &$run_ceph_cmd_text(['osd', 'crush', 'dump'], quiet => 1);

	my $txt = '';

	my $mapfile = "/var/tmp/ceph-crush.map.$$";
	my $mapdata = "/var/tmp/ceph-crush.txt.$$";

	my $rados = PVE::RADOS->new();
	
	eval {
	    my $bindata = $rados->mon_command({ prefix => 'osd getcrushmap', format => 'plain' });
	    PVE::Tools::file_set_contents($mapfile, $bindata);
	    run_command(['crushtool', '-d', $mapfile, '-o', $mapdata]);
	    $txt = PVE::Tools::file_get_contents($mapdata);
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

	my $rpcenv = PVE::RPCEnvironment::get();
	my $user = $rpcenv->get_user();
	my $node = $param->{node};

	my $logfile = "/var/log/ceph/ceph.log";
	my ($count, $lines) = PVE::Tools::dump_logfile($logfile, $param->{start}, $param->{limit});

	$rpcenv->set_result_attrib('total', $count);
	    
	return $lines; 
    }});


