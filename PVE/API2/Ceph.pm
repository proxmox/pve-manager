package PVE::API2::Ceph;

use strict;
use warnings;
use File::Basename;
use File::Path;
use POSIX qw (LONG_MAX);

use PVE::SafeSyslog;
use PVE::Tools qw(extract_param run_command);
use PVE::Exception qw(raise raise_param_exc);
use PVE::INotify;
use PVE::Cluster qw(cfs_lock_file cfs_read_file cfs_write_file);
use PVE::AccessControl;
use PVE::Storage;
use PVE::RESTHandler;
use PVE::RPCEnvironment;
use PVE::JSONSchema qw(get_standard_option);
use JSON;

use base qw(PVE::RESTHandler);

use Data::Dumper; # fixme: remove

my $ccname = 'ceph'; # ceph cluster name
my $ceph_cfgdir = "/etc/ceph";
my $pve_ceph_cfgpath = "/etc/pve/$ccname.conf";
my $ceph_cfgpath = "$ceph_cfgdir/$ccname.conf";
my $pve_mon_key_path = "/etc/pve/priv/$ccname.mon.keyring";
my $ceph_mon_key_path = "$ceph_cfgdir/$ccname.mon.keyring";
my $pve_ckeyring_path = "/etc/pve/priv/$ccname.keyring";
my $ceph_ckeyring_path = "$ceph_cfgdir/$ccname.client.admin.keyring";

my $ceph_bootstrap_osd_keyring = "/var/lib/ceph/bootstrap-osd/$ccname.keyring";
my $ceph_bootstrap_mds_keyring = "/var/lib/ceph/bootstrap-mds/$ccname.keyring";

my $ceph_bin = "/usr/bin/ceph";

sub purge_all_ceph_files {
    # fixme: this is very dangerous - should we really support this function?

    unlink $ceph_cfgpath;
    unlink $ceph_mon_key_path;
    unlink $ceph_ckeyring_path;

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

my $force_symlink = sub {
    my ($old, $new) = @_;

    return if (-l $new) && (readlink($new) eq $old);
	
    unlink $new;
    symlink($old, $new) ||
	die "unable to create symlink '$new' - $!\n";
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

my $run_ceph_cmd = sub {
    my ($cmd, %params) = @_;

    my $timeout = 3;

    my $oldalarm;
    eval {
	local $SIG{ALRM} = sub { die "timeout\n" };
	$oldalarm = alarm($timeout); 
	# Note: --connect-timeout does not work with current version
	# '--connect-timeout', $timeout,

	run_command(['ceph', '-c', $ceph_cfgpath, @$cmd], %params);
	alarm(0);
    };
    my $err = $@;

    alarm($oldalarm) if $oldalarm;

    die $err if $err;
};

my $run_ceph_cmd_json = sub {
    my ($cmd, %opts) = @_;

    my $json = '';

    my $quiet = delete $opts{quiet};

    my $parser = sub {
	my $line = shift;
	$json .= $line;
    };

    my $errfunc = sub {
	my $line = shift;
	print "$line\n" if !$quiet;
    };

    &$run_ceph_cmd([@$cmd, '--format', 'json'], 
		   outfunc => $parser, errfunc => $errfunc);

    my $res = decode_json($json);

    return $res;
};

sub ceph_mon_status {
    my ($quiet) = @_;
 
    return &$run_ceph_cmd_json(['mon_status'], quiet => $quiet);

}

my $ceph_osd_status = sub {
    my ($quiet) = @_;

    return &$run_ceph_cmd_json(['osd', 'dump'], quiet => $quiet);
};

my $write_ceph_config = sub {
    my ($cfg) = @_;

    my $out = '';
    foreach my $section (keys %$cfg) {
	$out .= "[$section]\n";
	foreach my $key (sort keys %{$cfg->{$section}}) {
	    $out .= "\t $key = $cfg->{$section}->{$key}\n";
	}
	$out .= "\n";
    }

    PVE::Tools::file_set_contents($pve_ceph_cfgpath, $out);
};

my $setup_pve_symlinks = sub {
    # fail if we find a real file instead of a link
    if (-f $ceph_cfgpath) {
	my $lnk = readlink($ceph_cfgpath);
	die "file '$ceph_cfgpath' already exists\n"
	    if !$lnk || $lnk ne $pve_ceph_cfgpath;
    }

    # now assume we are allowed to setup/overwrite content 
    &$force_symlink($pve_ceph_cfgpath, $ceph_cfgpath);
    &$force_symlink($pve_mon_key_path, $ceph_mon_key_path);
    &$force_symlink($pve_ckeyring_path, $ceph_ckeyring_path);
};

my $ceph_service_cmd = sub {
    run_command(['service', 'ceph', '-c', $ceph_cfgpath, @_]);
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
	    { name => 'createmon' },
	    { name => 'destroymon' },
	    { name => 'createosd' },
	    { name => 'destroyosd' },
	    { name => 'stop' },
	    { name => 'start' },
	    { name => 'status' },
	];

	return $result;
    }});

__PACKAGE__->register_method ({
    name => 'init',
    path => 'init',
    method => 'POST',
    description => "Create initial ceph configuration.",
    proxyto => 'node',
    protected => 1,
    parameters => {
    	additionalProperties => 0,
	properties => {
	    node => get_standard_option('pve-node'),
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
		default => 9,
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

	-f $pve_ceph_cfgpath &&
	    die "configuration file '$pve_ceph_cfgpath' already exists.\n";

	my $pg_bits = $param->{pg_bits} || 9;
	my $size = $param->{size} || 2;

	my $global = {
	    'auth supported' => 'cephx',
	    'auth cluster required' => 'cephx',
	    'auth service required' => 'cephx',
	    'auth client required' => 'cephx',
	    'filestore xattr use omap' => 'true',
	    'osd journal size' => '1024',
	    'osd pool default size' => $size,
	    'osd pool default min size' => 1,
	    'osd pg bits' => $pg_bits,
	    'osd pgp bits' => $pg_bits,
	};

	# this does not work for default pools 
	#'osd pool default pg num' => $pg_num,
	#'osd pool default pgp num' => $pg_num, 

	&$write_ceph_config({global => $global});

	&$setup_pve_symlinks();

	return undef;
    }});

__PACKAGE__->register_method ({
    name => 'createmon',
    path => 'createmon',
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
    returns => { type => 'null' },
    code => sub {
	my ($param) = @_;

	&$check_ceph_inited();

	&$setup_pve_symlinks();

	if (! -f $pve_ckeyring_path) {
	    run_command("ceph-authtool $pve_ckeyring_path --create-keyring " .
			"--gen-key -n client.admin");
	}

	if (! -f $pve_mon_key_path) {
	    run_command("cp $pve_ckeyring_path $pve_mon_key_path.tmp");
	    run_command("ceph-authtool $pve_mon_key_path.tmp -n client.admin --set-uid=0 " .
			"--cap mds 'allow *' " .
			"--cap osd 'allow *' " .
			"--cap mon 'allow *'");
	    run_command("ceph-authtool $pve_mon_key_path.tmp --gen-key -n mon. --cap mon 'allow *'");
	    run_command("mv $pve_mon_key_path.tmp $pve_mon_key_path");
	}


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
	my $monaddr = PVE::Cluster::remote_node_ip($param->{node}) . ":6789";
	my $monname = $param->{node};

	die "monitor '$monsection' already exists\n" if $cfg->{$monsection};
	die "monitor address '$monaddr' already in use by '$monaddrhash->{$monaddr}'\n" 
	    if $monaddrhash->{$monaddr};


	my $mondir =  "/var/lib/ceph/mon/$ccname-$monid";
	-d $mondir && die "monitor filesystem '$mondir' already exist\n";
 
	my $monmap = "/tmp/monmap";
	
	eval {
	    mkdir $mondir;

	    if ($moncount > 0) {
		my $monstat = ceph_mon_status(); # online test
		&$run_ceph_cmd(['mon', 'getmap', '-o', $monmap]);
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

	return undef;

    }});

__PACKAGE__->register_method ({
    name => 'destroymon',
    path => 'destroymon',
    method => 'POST',
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
    returns => { type => 'null' },
    code => sub {
	my ($param) = @_;

	&$check_ceph_inited();

	my $cfg = &$parse_ceph_config($pve_ceph_cfgpath);
       
	my $monid = $param->{monid};
	my $monsection = "mon.$monid";	

	my $monstat = ceph_mon_status();
	my $monlist = $monstat->{monmap}->{mons};

	die "no such monitor id '$monid'\n" 
	    if !defined($cfg->{$monsection});


	my $mondir =  "/var/lib/ceph/mon/$ccname-$monid";
	-d $mondir || die "monitor filesystem '$mondir' does not exist on this node\n";

	die "can't remove last monitor\n" if scalar(@$monlist) <= 1;

	&$run_ceph_cmd(['mon', 'remove', $monid]);

	eval { &$ceph_service_cmd('stop', $monsection); };
	warn $@ if $@;

	delete $cfg->{$monsection};
	&$write_ceph_config($cfg);
	File::Path::remove_tree($mondir);

	return undef;
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
	},
    },
    returns => { type => 'null' },
    code => sub {
	my ($param) = @_;

	&$check_ceph_inited();

	my $cfg = &$parse_ceph_config($pve_ceph_cfgpath);
	scalar(keys %$cfg) || die "no configuration\n";

	&$ceph_service_cmd('stop');

	return undef;
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
	},
    },
    returns => { type => 'null' },
    code => sub {
	my ($param) = @_;

	&$check_ceph_inited();

	my $cfg = &$parse_ceph_config($pve_ceph_cfgpath);
	scalar(keys %$cfg) || die "no configuration\n";

	&$ceph_service_cmd('start');

	return undef;
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

	return &$run_ceph_cmd_json(['status'], quiet => 1);
    }});

__PACKAGE__->register_method ({
    name => 'createosd',
    path => 'createosd',
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
	    }
	},
    },
    returns => { type => 'null' },
    code => sub {
	my ($param) = @_;

	&$check_ceph_inited();

	die "not fully configured - missing '$pve_ckeyring_path'\n" 
	    if ! -f $pve_ckeyring_path;

	&$setup_pve_symlinks();

	print "create OSD on $param->{dev}\n";

	-b  $param->{dev} || die "no such block device '$param->{dev}'\n";

	my $monstat = ceph_mon_status(1);
	die "unable to get fsid\n" if !$monstat->{monmap} || !$monstat->{monmap}->{fsid};
	my $fsid = $monstat->{monmap}->{fsid};

	if (! -f $ceph_bootstrap_osd_keyring) {
	    &$run_ceph_cmd(['auth', 'get', 'client.bootstrap-osd', '-o', $ceph_bootstrap_osd_keyring]);
	};

	run_command(['ceph-disk', 'prepare', '--zap-disk', '--fs-type', 'xfs',
		     '--cluster', $ccname, '--cluster-uuid', $fsid,
		     '--', $param->{dev}]);

	return undef;
    }});

__PACKAGE__->register_method ({
    name => 'destroyosd',
    path => 'destroyosd',
    method => 'POST',
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
	},
    },
    returns => { type => 'null' },
    code => sub {
	my ($param) = @_;

	&$check_ceph_inited();

	my $osdid = $param->{osdid};

	print "destroy OSD $param->{osdid}\n";

	# fixme: not sure what we should do here
 
	my $stat = &$ceph_osd_status();

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

	eval { &$ceph_service_cmd('stop', $osdsection); };
	warn $@ if $@;

	print "Remove $osdsection from the CRUSH map\n";
	&$run_ceph_cmd(['osd', 'crush', 'remove', $osdid]);

	print "Remove the $osdsection authentication key.\n";
	&$run_ceph_cmd(['auth', 'del', $osdsection]);

	print "Remove OSD $osdsection\n";
	&$run_ceph_cmd(['osd', 'rm', $osdid]);

	return undef;
    }});
