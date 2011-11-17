package PVE::OpenVZ;

use strict;
use LockFile::Simple;
use File::stat qw();
use POSIX qw (LONG_MAX);
use IO::Dir;
use IO::File;
use PVE::Tools qw(extract_param);
use PVE::ProcFSTools;
use PVE::Cluster qw(cfs_register_file cfs_read_file);
use PVE::SafeSyslog;
use PVE::INotify;
use PVE::JSONSchema;
use Digest::SHA1;
use Encode;

use constant SCRIPT_EXT => qw (start stop mount umount);

my $cpuinfo = PVE::ProcFSTools::read_cpuinfo();
my $nodename = PVE::INotify::nodename();
my $global_vzconf = read_global_vz_config();
my $res_unlimited = LONG_MAX;

sub config_list {
    my $vmlist = PVE::Cluster::get_vmlist();
    my $res = {};
    return $res if !$vmlist || !$vmlist->{ids};
    my $ids = $vmlist->{ids};

    foreach my $vmid (keys %$ids) {
	next if !$vmid; # skip VE0
	my $d = $ids->{$vmid};
	next if !$d->{node} || $d->{node} ne $nodename;
	next if !$d->{type} || $d->{type} ne 'openvz';
	$res->{$vmid}->{type} = 'openvz';
    }
    return $res;
}

sub cfs_config_path {
    my ($vmid, $node) = @_;

    $node = $nodename if !$node;
    return "nodes/$node/openvz/$vmid.conf";
}

sub config_file {
    my ($vmid, $node) = @_;

    my $cfspath = cfs_config_path($vmid, $node);
    return "/etc/pve/$cfspath";
}

sub load_config {
    my ($vmid) = @_;

    my $cfspath = cfs_config_path($vmid);

    my $conf = PVE::Cluster::cfs_read_file($cfspath);
    die "container $vmid does not exists\n" if !defined($conf);

    return $conf;
}

sub check_mounted {
    my ($vmid) = @_;

    my $root = $global_vzconf->{rootdir};
    $root =~ s/\$VEID/$vmid/;

    return (-d "$root/etc" || -d "$root/proc");
}

sub get_privatedir {
    my ($conf, $vmid) = @_;

    my $private = $global_vzconf->{privatedir};
    if ($conf->{ve_private} && $conf->{ve_private}->{value}) {
	$private = $conf->{ve_private}->{value};
    }
    $private =~ s/\$VEID/$vmid/;

    return $private;
}

sub read_user_beancounters {
    my $ubc = {};
    if (my $fh = IO::File->new ("/proc/user_beancounters", "r")) {
	my $vmid;
	while (defined (my $line = <$fh>)) {
	    if ($line =~ m|\s*((\d+):\s*)?([a-z]+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)$|) {
		$vmid = $2 if defined($2);
		next if !defined($vmid);
		my ($name, $held, $maxheld, $bar, $lim, $failcnt) = (lc($3), $4, $5, $6, $7, $8);
		next if $name eq 'dummy';
		$ubc->{$vmid}->{failcntsum} += $failcnt;
		$ubc->{$vmid}->{$name} = {
		    held => $held,
		    maxheld => $maxheld,
		    bar => $bar,
		    lim => $lim,
		    failcnt => $failcnt,
		};
	    }
	}
	close($fh);
    }

    return $ubc;
}

sub read_container_network_usage {
    my ($vmid) = @_;

    my $recv = 0;
    my $trmt = 0;

    my $netparser = sub {
	my $line = shift;
	if ($line =~ m/^\s*(.*):\s*(\d+)\s+\d+\s+\d+\s+\d+\s+\d+\s+\d+\s+\d+\s+\d+\s+(\d+)\s+/) {
	    return if $1 eq 'lo';
	    $recv += $2;
	    $trmt += $3;
	}
    };

    # fixme: can we get that info directly (with vzctl exec)?
    my $cmd = ['/usr/sbin/vzctl', 'exec', $vmid, '/bin/cat', '/proc/net/dev'];
    eval { PVE::Tools::run_command($cmd, outfunc => $netparser); };
    my $err = $@;
    syslog('err', $err) if $err;

    return ($recv, $trmt);
};

sub read_container_blkio_stat {
    my ($vmid) = @_;

    my $read = 0;
    my $write = 0;

    my $filename = "/proc/vz/beancounter/$vmid/blkio.io_service_bytes";
    if (my $fh = IO::File->new ($filename, "r")) {
       
	while (defined (my $line = <$fh>)) {
	    if ($line =~ m/^\S+\s+Read\s+(\d+)$/) {
		$read += $1;
	    } elsif ($line =~ m/^\S+\s+Write\s+(\d+)$/) {
		$write += $1;
	    }
	}
    }

    return ($read, $write);
};

my $last_proc_vestat = {};

sub vmstatus {
    my ($opt_vmid) = @_;

    my $list = $opt_vmid ? { $opt_vmid => { type => 'openvz' }} : config_list();

    foreach my $vmid (keys %$list) {
	next if $opt_vmid && ($vmid ne $opt_vmid);

	my $d = $list->{$vmid};
	$d->{status} = 'stopped';

	my $cfspath = cfs_config_path($vmid);
	if (my $conf = PVE::Cluster::cfs_read_file($cfspath)) {
	    $d->{name} = $conf->{hostname}->{value} || "CT$vmid";
	    $d->{name} =~ s/[\s]//g;

	    $d->{cpus} = $conf->{cpus}->{value} || 1;

	    $d->{disk} = 0;
	    $d->{maxdisk} = int($conf->{diskspace}->{bar} * 1024);

	    $d->{mem} = 0;
	    $d->{maxmem} = int((($conf->{physpages}->{lim} + $conf->{swappages}->{lim})* 4096));
	    $d->{swap} = 0;
	    $d->{maxswap} = int((($conf->{swappages}->{lim})* 4096));

	    $d->{nproc} = 0;
	    $d->{failcnt} = 0;

	    $d->{uptime} = 0;
	    $d->{cpu} = 0;
	    $d->{relcpu} = 0;

	    $d->{netout} = 0;
	    $d->{netin} = 0;

	    $d->{diskread} = 0;
	    $d->{diskwrite} = 0;

	    if (my $ip = $conf->{ip_address}->{value}) {
		$ip =~ s/,;/ /g;
		$d->{ip} = (split(/\s+/, $ip))[0];
	    } else {
		$d->{ip} = '-';
	    }
	} else {
	    delete $list->{$vmid};
	}
    }

    if (my $fh = IO::File->new ("/proc/mounts", "r")) {
	while (defined (my $line = <$fh>)) {
	    if ($line =~ m|/private/(\d+)\s+/var/lib/vz/root/\d+\s|) {
		$list->{$1}->{status} = 'mounted' if defined($list->{$1});
	    }
	}
	close($fh);
    }

    my $ubchash = read_user_beancounters();
    foreach my $vmid (keys %$ubchash) {
	my $d = $list->{$vmid};
	my $ubc = $ubchash->{$vmid};
	if ($d && defined($d->{status}) && $ubc) {
	    $d->{failcnt} = $ubc->{failcntsum};
	    $d->{mem} = int($ubc->{privvmpages}->{held} * 4096);
	    my $phy = int($ubc->{physpages}->{held} * 4096);
	    $d->{swap} = $phy > $d->{maxmem} ? $phy - $d->{maxmem} : 0;
	    $d->{nproc} = $ubc->{numproc}->{held};
	}
    }

    if (my $fh = IO::File->new ("/proc/vz/vzquota", "r")) {
	while (defined (my $line = <$fh>)) {
	    if ($line =~ m|^(\d+):\s+\S+/private/\d+$|) {
		my $vmid = $1;
		my $d = $list->{$vmid};
		if ($d && defined($d->{status})) {
		    $line = <$fh>;
		    if ($line =~ m|^\s*1k-blocks\s+(\d+)\s+(\d+)\s|) {
			$d->{disk} = int ($1 * 1024);
			$d->{maxdisk} = int ($2 * 1024);
		    }
		}
	    }
	}
	close($fh);
    }

    my $cpus = $cpuinfo->{cpus} || 1;
    # Note: OpenVZ does not use POSIX::_SC_CLK_TCK
    my $hz = 1000;

    # see http://wiki.openvz.org/Vestat
    if (my $fh = new IO::File ("/proc/vz/vestat", "r")) {
	while (defined (my $line = <$fh>)) {
	    if ($line =~ m/^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+/) {
		my $vmid = $1;
		my $user = $2;
		my $nice = $3;
		my $system = $4;
		my $ut = $5;
		my $sum = $8*$cpus; # uptime in jiffies * cpus = available jiffies
		my $used = $9; # used time in jiffies

		my $uptime = int ($ut / $hz);

		my $d = $list->{$vmid};
		next if !($d && defined($d->{status}));

		$d->{status} = 'running';
		$d->{uptime} = $uptime;

		if (!defined ($last_proc_vestat->{$vmid}) ||
		    ($last_proc_vestat->{$vmid}->{sum} > $sum)) {
		    $last_proc_vestat->{$vmid} = { used => 0, sum => 0, cpu => 0, relcpu => 0};
		}

		my $diff = $sum - $last_proc_vestat->{$vmid}->{sum};

		if ($diff > 1000) { # don't update too often
		    my $useddiff = $used - $last_proc_vestat->{$vmid}->{used};
		    my $cpu = int ($useddiff*100/$diff);
		    $last_proc_vestat->{$vmid}->{sum} = $sum;
		    $last_proc_vestat->{$vmid}->{used} = $used;
		    $last_proc_vestat->{$vmid}->{cpu} = $d->{cpu} = $cpu;

		    my $relcpu = $cpu;
		    $last_proc_vestat->{$vmid}->{relcpu} = $d->{relcpu} = $relcpu;

		} else {
		    $d->{cpu} = $last_proc_vestat->{$vmid}->{cpu};
		    $d->{relcpu} = $last_proc_vestat->{$vmid}->{relcpu};
		}
	    }
	}
	close($fh);
    }

    foreach my $vmid (keys %$list) {
	my $d = $list->{$vmid};
	next if !$d || !$d->{status} || $d->{status} ne 'running';
	($d->{netin}, $d->{netout}) = read_container_network_usage($vmid);
	($d->{diskread}, $d->{diskwrite}) = read_container_blkio_stat($vmid); 
    }

    return $list;
}

my $confdesc = {
    onboot => {
	optional => 1,
	type => 'boolean',
	description => "Specifies whether a VM will be started during system bootup.",
	default => 0,
    },
    cpus => {
	optional => 1,
	type => 'integer',
	description => "The number of CPUs for this container.",
	minimum => 1,
	default => 1,
    },
    cpuunits => {
	optional => 1,
	type => 'integer',
	description => "CPU weight for a VM. Argument is used in the kernel fair scheduler. The larger the number is, the more CPU time this VM gets. Number is relative to weights of all the other running VMs.\n\nNOTE: You can disable fair-scheduler configuration by setting this to 0.",
	minimum => 0,
	maximum => 500000,
	default => 1000,
    },
    memory => {
	optional => 1,
	type => 'integer',
	description => "Amount of RAM for the VM in MB.",
	minimum => 16,
	default => 512,
    },
    swap => {
	optional => 1,
	type => 'integer',
	description => "Amount of SWAP for the VM in MB.",
	minimum => 16,
	default => 512,
    },
    disk => {
	optional => 1,
	type => 'number',
	description => "Amount of disk space for the VM in GB. A zero indicates no limits.",
	minimum => 0,
	default => 2,
    },
    quotatime => {
	optional => 1,
	type => 'integer',
	description => "Set quota grace period (seconds).",
	minimum => 0,
	default => 0,
    },
    quotaugidlimit => {
	optional => 1,
	type => 'integer',
	description => "Set maximum number of user/group IDs in a container for which disk quota inside the container will be accounted. If this value is set to 0, user and group quotas inside the container will not.",
	minimum => 0,
	default => 0,
    },
    hostname => {
	optional => 1,
	description => "Set a host name for the container.",
	type => 'string',
	maxLength => 255,
    },
    description => {
	optional => 1,
	type => 'string',
	description => "Container description. Only used on the configuration web interface.",
    },
    searchdomain => {
	optional => 1,
	type => 'string',
	description => "Sets DNS search domains for a container. Create will automatically use the setting from the host if you neither set searchdomain or nameserver.",
    },
    nameserver => {
	optional => 1,
	type => 'string',
	description => "Sets DNS server IP address for a container. Create will automatically use the setting from the host if you neither set searchdomain or nameserver.",
    },
    ip_address => {
	optional => 1,
	type => 'string',
	description => "Specifies the address the container will be assigned.",
    },
    netif => {
	optional => 1,
	type => 'string', format => 'pve-openvz-netif',
	description => "Specifies network interfaces for the container.",
    },
};

# add JSON properties for create and set function
sub json_config_properties {
    my $prop = shift;

    foreach my $opt (keys %$confdesc) {
	$prop->{$opt} = $confdesc->{$opt};
    }

    return $prop;
}

# read global vz.conf
sub read_global_vz_config {

    my $res = {
	rootdir => '/var/lib/vz/root/$VEID', # note '$VEID' is a place holder
	privatedir => '/var/lib/vz/private/$VEID', # note '$VEID' is a place holder
	dumpdir => '/var/lib/vz/dump',
	lockdir => '/var/lib/vz/lock',
    };
    
    my $filename = "/etc/vz/vz.conf";

    return $res if ! -f $filename;

    my $data = PVE::Tools::file_get_contents($filename);

    if ($data =~ m/^\s*VE_PRIVATE=(.*)$/m) {
	my $dir = $1;
	$dir =~ s/^\"(.*)\"/$1/;
	if ($dir !~ m/\$VEID/) {
	    warn "VE_PRIVATE does not contain '\$VEID' ('$dir')\n";
	} else {
	    $res->{privatedir} = $dir;
	}
    }
    if ($data =~ m/^\s*VE_ROOT=(.*)$/m) {
	my $dir = $1;
	$dir =~ s/^\"(.*)\"/$1/;
	if ($dir !~ m/\$VEID/) {
	    warn "VE_ROOT does not contain '\$VEID' ('$dir')\n";
	} else {
	    $res->{rootdir} = $dir;
	}
    }
    if ($data =~ m/^\s*DUMPDIR=(.*)$/m) {
	my $dir = $1;
	$dir =~ s/^\"(.*)\"/$1/;
	$dir =~ s|/\$VEID$||;
	$res->{dumpdir} = $dir;
    }
    if ($data =~ m/^\s*LOCKDIR=(.*)$/m) {
	my $dir = $1;
	$dir =~ s/^\"(.*)\"/$1/;
	$res->{lockdir} = $dir;
    }

    return $res;
};

sub parse_netif {
    my ($data, $vmid) = @_;

    my $res = {};
    return $res if !$data;

    my $host_ifnames = {};

    my $find_next_hostif_name = sub {
	for (my $i = 0; $i < 100; $i++) {
	    my $name = "veth${vmid}.$i";
	    if (!$host_ifnames->{$name}) {
		$host_ifnames->{$name} = 1;
		return $name;
	    }
	}

	die "unable to find free host_ifname"; # should not happen
    };

    foreach my $iface (split (/;/, $data)) {
	my $d = {};
	foreach my $pv (split (/,/, $iface)) {
	    if ($pv =~ m/^(ifname|mac|bridge|host_ifname|host_mac)=(.+)$/) {
		$d->{$1} = $2;
		if ($1 eq 'host_ifname') {
		    $host_ifnames->{$2} = $1;
		}
	    }
	}
	if ($d->{ifname}) {
	    $d->{mac} = PVE::Tools::random_ether_addr() if !$d->{mac};
	    $d->{host_mac} = PVE::Tools::random_ether_addr() if !$d->{host_mac};
	    $d->{raw} = print_netif($d);
	    $res->{$d->{ifname}} = $d;
	} else {
	    return undef;
	}
    }

    foreach my $iface (keys %$res) {
	my $d = $res->{$iface};
	if ($vmid && !$d->{host_ifname}) {
	    $d->{host_ifname} = &$find_next_hostif_name($iface);
	}
    }

    return $res;
}

sub print_netif {
    my $net = shift;

    my $res = "ifname=$net->{ifname}";
    $res .= ",mac=$net->{mac}" if $net->{mac};
    $res .= ",host_ifname=$net->{host_ifname}" if $net->{host_ifname};
    $res .= ",host_mac=$net->{host_mac}" if $net->{host_mac};
    $res .= ",bridge=$net->{bridge}" if $net->{bridge};

    return $res;
}

PVE::JSONSchema::register_format('pve-openvz-netif', \&verify_netif);
sub verify_netif {
    my ($value, $noerr) = @_;

    return $value if parse_netif($value);

    return undef if $noerr;

    die "unable to parse --netif value";
}

sub parse_res_num_ignore {
    my ($key, $text) = @_;

    if ($text =~ m/^(\d+|unlimited)(:.*)?$/) {
	return { bar => $1 eq 'unlimited' ? $res_unlimited : $1 };
    }

    return undef;
}

sub parse_res_num_num {
    my ($key, $text) = @_;

    if ($text =~ m/^(\d+|unlimited)(:(\d+|unlimited))?$/) {
	my $res = { bar => $1 eq 'unlimited' ? $res_unlimited : $1 };
	if (defined($3)) {
	    $res->{lim} = $3 eq 'unlimited' ? $res_unlimited : $3;
	} else {
	    $res->{lim} = $res->{bar};
	}
	return $res;
    }

    return undef;
}

sub parse_res_bar_limit {
    my ($text, $base) = @_;

    return $res_unlimited if $text eq 'unlimited';

    if ($text =~ m/^(\d+)([TGMKP])?$/i) {
	my $val = $1;
	my $mult = lc($2);
	if ($mult eq 'k') {
	    $val = $val * 1024;
	} elsif ($mult eq 'm') {
	    $val = $val * 1024 * 1024;
	} elsif ($mult eq 'g') {
	    $val = $val * 1024 * 1024 * 1024;
	} elsif ($mult eq 't') {
	    $val = $val * 1024 * 1024 * 1024 * 1024;
	} elsif ($mult eq 'p') {
	    $val = $val * 4096;
	} else {
	    return $val;
	}
	return int($val/$base);
    }

    return undef;
}

sub parse_res_bytes_bytes {
    my ($key, $text) = @_;

    my @a = split(/:/, $text);
    $a[1] = $a[0] if !defined($a[1]);
    
    my $bar = parse_res_bar_limit($a[0], 1);
    my $lim = parse_res_bar_limit($a[1], 1);

    if (defined($bar) && defined($lim)) {
	return { bar => $bar, lim => $lim };
    }

    return undef;
}

sub parse_res_block_block {
    my ($key, $text) = @_;

    my @a = split(/:/, $text);
    $a[1] = $a[0] if !defined($a[1]);
    
    my $bar = parse_res_bar_limit($a[0], 1024);
    my $lim = parse_res_bar_limit($a[1], 1024);

    if (defined($bar) && defined($lim)) {
	return { bar => $bar, lim => $lim };
    }

    return undef;
}

sub parse_res_pages_pages {
    my ($key, $text) = @_;

    my @a = split(/:/, $text);
    $a[1] = $a[0] if !defined($a[1]);
    
    my $bar = parse_res_bar_limit($a[0], 4096);
    my $lim = parse_res_bar_limit($a[1], 4096);

    if (defined($bar) && defined($lim)) {
	return { bar => $bar, lim => $lim };
    }

    return undef;
}

sub parse_res_pages_unlimited {
    my ($key, $text) = @_;

    my @a = split(/:/, $text);
    
    my $bar = parse_res_bar_limit($a[0], 4096);
 
    if (defined($bar)) {
	return { bar => $bar, lim => $res_unlimited };
    }

    return undef;
}

sub parse_res_pages_ignore {
    my ($key, $text) = @_;

    my @a = split(/:/, $text);
    
    my $bar = parse_res_bar_limit($a[0], 4096);
 
    if (defined($bar)) {
	return { bar => $bar };
    }

    return undef;
}

sub parse_res_ignore_pages {
    my ($key, $text) = @_;

    my @a = split(/:/, $text);
    $a[1] = $a[0] if !defined($a[1]);
    
    my $lim = parse_res_bar_limit($a[1] , 4096);
 
    if (defined($lim)) {
	return { bar => 0, lim => $lim };
    }

    return undef;
}

sub parse_boolean {
    my ($key, $text) = @_;

    return { value => 1 } if $text =~ m/^(yes|true|on|1)$/i;
    return { value => 0 } if $text =~ m/^(no|false|off|0)$/i;

    return undef;
};

sub parse_integer {
    my ($key, $text) = @_;

    if ($text =~ m/^(\d+)$/) {
	return { value => int($1) };
    }

    return undef;
};

my $ovz_ressources = {
    numproc => \&parse_res_num_ignore,
    numtcpsock => \&parse_res_num_ignore,
    numothersock => \&parse_res_num_ignore,
    numfile => \&parse_res_num_ignore,    
    numflock => \&parse_res_num_num,
    numpty => \&parse_res_num_ignore,
    numsiginfo => \&parse_res_num_ignore,
    numiptent => \&parse_res_num_ignore,

    vmguarpages => \&parse_res_pages_unlimited,
    oomguarpages => \&parse_res_pages_unlimited,
    lockedpages => \&parse_res_pages_ignore,
    privvmpages => \&parse_res_pages_pages,
    shmpages => \&parse_res_pages_ignore,
    physpages => \&parse_res_pages_pages,
    swappages => \&parse_res_ignore_pages,

    kmemsize => \&parse_res_bytes_bytes,
    tcpsndbuf => \&parse_res_bytes_bytes,
    tcprcvbuf => \&parse_res_bytes_bytes,
    othersockbuf => \&parse_res_bytes_bytes,
    dgramrcvbuf => \&parse_res_bytes_bytes,
    dcachesize => \&parse_res_bytes_bytes,

    diskquota => \&parse_boolean,
    diskspace => \&parse_res_block_block,
    diskinodes => \&parse_res_num_num,
    quotatime => \&parse_integer,
    quotaugidlimit => \&parse_integer,

    cpuunits => \&parse_integer,
    cpulimit => \&parse_integer,
    cpus => \&parse_integer,
    cpumask => 'string',
    meminfo => 'string',
    iptables => 'string',

    ip_address => 'string',
    netif => 'string',
    hostname => 'string',
    nameserver => 'string',
    searchdomain => 'string',

    name => 'string',
    description => 'string',
    onboot => \&parse_boolean,
    initlog => \&parse_boolean,
    bootorder => \&parse_integer,
    ostemplate => 'string',
    ve_root => 'string',
    ve_private => 'string',
    disabled => \&parse_boolean,
    origin_sample => 'string',
    noatime => \&parse_boolean,
    capability => 'string',
    devnodes => 'string',
    devices => 'string',
    pci => 'string',
    features => 'string',
    ioprio => \&parse_integer,

};

sub parse_ovz_config {
    my ($filename, $raw) = @_;

    return undef if !defined($raw);

    my $data = {
	digest => Digest::SHA1::sha1_hex($raw),
    };

    $filename =~ m|/openvz/(\d+)\.conf$|
	|| die "got strange filename '$filename'";

    my $vmid = $1;

    while ($raw && $raw =~ s/^(.*?)(\n|$)//) {
	my $line = $1;

	next if $line =~ m/^\#/;
	next if $line =~ m/^\s*$/;

	if ($line =~ m/^\s*([A-Z][A-Z0-9_]*)\s*=\s*\"(.*)\"\s*$/i) {
	    my $name = lc($1);
	    my $text = $2;

	    my $parser = $ovz_ressources->{$name};
	    if (!$parser || !ref($parser)) {
		$data->{$name}->{value} = $text;
		next;
	    } else {
		if (my $res = &$parser($name, $text)) {
		    $data->{$name} = $res;
		    next;
		}
	    }
	}
	die "unable to parse config line: $line\n";
    }

    return $data;
}

cfs_register_file('/openvz/', \&parse_ovz_config);

sub format_res_value {
    my ($key, $value) = @_;

    return 'unlimited' if $value == $res_unlimited;

    return 0 if $value == 0;

    if ($key =~ m/pages$/) {
        my $bytes = $value * 4096;
	my $mb = int ($bytes / (1024 * 1024));
	return "${mb}M" if $mb * 1024 * 1024 == $bytes;
    } elsif ($key =~ m/space$/) {
        my $bytes = $value * 1024;
	my $gb = int ($bytes / (1024 * 1024 * 1024));
	return "${gb}G" if $gb * 1024 * 1024 * 1024 == $bytes;
	my $mb = int ($bytes / (1024 * 1024));
	return "${mb}M" if $mb * 1024 * 1024 == $bytes;
    } elsif ($key =~ m/size$/) {
        my $bytes = $value;
	my $mb = int ($bytes / (1024 * 1024));
	return "${mb}M" if $mb * 1024 * 1024 == $bytes;
    }

    return $value;
}

sub format_res_bar_lim {
    my ($key, $data) = @_;

    if (defined($data->{lim}) && ($data->{lim} ne $data->{bar})) {
	return format_res_value($key, $data->{bar}) . ":" . format_res_value($key, $data->{lim});     
    } else {
	return format_res_value($key, $data->{bar}); 
    }
}

sub create_config_line {
    my ($key, $data) = @_;

    my $text;

    if (defined($data->{value})) {
	if ($confdesc->{$key} && $confdesc->{$key}->{type} eq 'boolean') {
	    my $txt = $data->{value} ? 'yes' : 'no';
	    $text .= uc($key) . "=\"$txt\"\n";
	} else {
	    $text .= uc($key) . "=\"$data->{value}\"\n";
	}
    } elsif (defined($data->{bar})) {
	my $tmp = format_res_bar_lim($key, $data);
	$text .=  uc($key) . "=\"$tmp\"\n";     
    }
}

sub update_ovz_config {
    my ($vmid, $veconf, $param) = @_;

    my $changes = [];

    # test if barrier or limit changed
    my $push_bl_changes = sub {
	my ($name, $bar, $lim) = @_;

	my $old = format_res_bar_lim($name, $veconf->{$name});
	my $new = format_res_bar_lim($name, { bar => $bar, lim => $lim });
	if ($old ne $new) {
	    $veconf->{$name}->{bar} = $bar; 
	    $veconf->{$name}->{lim} = $lim;
	    push @$changes, "--$name", $new;
	}
    };

    my $mem = $veconf->{physpages}->{lim} ? 
	int (($veconf->{physpages}->{lim} * 4) / 1024) : 512;
    my $swap = $veconf->{swappages}->{lim} ?
	int (($veconf->{swappages}->{lim} * 4) / 1024) : 0;
 
    my $disk = ($veconf->{diskspace}->{bar} || $res_unlimited) / (1024*1024);
    my $cpuunits = $veconf->{cpuunits}->{value} || 1000;
    my $quotatime = $veconf->{quotatime}->{value} || 0;
    my $quotaugidlimit = $veconf->{quotaugidlimit}->{value} || 0;
    my $cpus = $veconf->{cpus}->{value} || 1;

    if ($param->{memory}) {
	$mem = $param->{memory};
    }

    if (defined ($param->{swap})) {
	$swap = $param->{swap};
    }

    if ($param->{disk}) {
	$disk = $param->{disk};
    }

    if ($param->{cpuunits}) {
	$cpuunits = $param->{cpuunits};
    }

    if (defined($param->{quotatime})) {
	$quotatime = $param->{quotatime};
    }

    if (defined($param->{quotaugidlimit})) {
	$quotaugidlimit = $param->{quotaugidlimit};
    }

    if ($param->{cpus}) {
	$cpus = $param->{cpus};
    }

    # memory related parameter 

    &$push_bl_changes('vmguarpages', 0, $res_unlimited);
    &$push_bl_changes('oomguarpages', 0, $res_unlimited);
    &$push_bl_changes('privvmpages', $res_unlimited, $res_unlimited);

    # lock half of $mem
    my $lockedpages = int($mem*1024/8);
    &$push_bl_changes('lockedpages', $lockedpages, undef);

    my $kmemsize = int($mem/2);
    &$push_bl_changes('kmemsize', int($kmemsize/1.1)*1024*1024, $kmemsize*1024*1024);

    my $dcachesize = int($mem/4);
    &$push_bl_changes('dcachesize', int($dcachesize/1.1)*1024*1024, $dcachesize*1024*1024);

    my $physpages = int($mem*1024/4);
    &$push_bl_changes('physpages', 0, $physpages);

    my $swappages = int($swap*1024/4);
    &$push_bl_changes('swappages', 0, $swappages);


    # disk quota parameters
    if (!$disk || ($disk * 1.1) >= ($res_unlimited / (1024 * 1024))) {
	&$push_bl_changes('diskspace', $res_unlimited, $res_unlimited);
	&$push_bl_changes('diskinodes', $res_unlimited, $res_unlimited);
    } else {
	my $diskspace = int ($disk * 1024 * 1024);
	my $diskspace_lim = int ($diskspace * 1.1);
	&$push_bl_changes('diskspace', $diskspace, $diskspace_lim);
	my $diskinodes = int ($disk * 200000);
	my $diskinodes_lim = int ($disk * 220000);
	&$push_bl_changes('diskinodes', $diskinodes, $diskinodes_lim);
    }
    if ($veconf->{'quotatime'}->{value} != $quotatime) {
	$veconf->{'quotatime'}->{value} = $quotatime;
	push @$changes, '--quotatime', "$quotatime";
    }

    if ($veconf->{'quotaugidlimit'}->{value} != $quotaugidlimit) {
	$veconf->{'quotaugidlimit'}->{value} = $quotaugidlimit;
	push @$changes, '--quotaugidlimit', "$quotaugidlimit";
    }

    # cpu settings

    if ($veconf->{'cpuunits'}->{value} != $cpuunits) {
	$veconf->{'cpuunits'}->{value} = $cpuunits;
	push @$changes, '--cpuunits', "$cpuunits";
    }

    if ($veconf->{'cpus'}->{value} != $cpus) {
	$veconf->{'cpus'}->{value} = $cpus;
	push @$changes, '--cpus', "$cpus";
    }

    my $cond_set_boolean = sub {
	my ($name) = @_;

	return if !defined($param->{$name});

	my $newvalue = $param->{$name} ? 1 : 0;
	my $oldvalue = $veconf->{$name}->{value};
	if (!defined($oldvalue) || ($oldvalue ne $newvalue)) {
	    $veconf->{$name}->{value} = $newvalue;
	    push @$changes, "--$name", $newvalue ? 'yes' : 'no';
	}
    };

    my $cond_set_value = sub {
	my ($name, $newvalue) = @_;

	$newvalue = defined($newvalue) ? $newvalue : $param->{$name};
	return if !defined($newvalue);

	my $oldvalue = $veconf->{$name}->{value};
	if (!defined($oldvalue) || ($oldvalue ne $newvalue)) {
	    $veconf->{$name}->{value} = $newvalue;
	    push @$changes, "--$name", $newvalue;
	}
    };

    &$cond_set_boolean('onboot');
    
    &$cond_set_value('hostname');
 
    &$cond_set_value('searchdomain');

    if ($param->{'description'}) {
	&$cond_set_value('description', PVE::Tools::encode_text($param->{'description'}));
    }

    if (defined($param->{ip_address})) {
	my $iphash = {};
	if (defined($veconf->{'ip_address'}) && $veconf->{'ip_address'}->{value}) {
	    foreach my $ip (split (/\s+/, $veconf->{ip_address}->{value})) {
		$iphash->{$ip} = 1;
	    }
	}
	my $newhash = {};
	foreach my $ip (PVE::Tools::split_list($param->{'ip_address'})) {
	    next if $ip !~ m|^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}(/\d+)?$|;
	    $newhash->{$ip} = 1;
	    if (!$iphash->{$ip}) {
		push @$changes, '--ipadd', $ip;
		$iphash->{$ip} = 1; # only add once
	    }
	}
	foreach my $ip (keys %$iphash) {
	    if (!$newhash->{$ip}) {
		push @$changes, '--ipdel', $ip;
	    }
	}
	$veconf->{'ip_address'}->{value} = join(' ', keys %$iphash);
    }

    if (defined($param->{netif})) {
	my $ifaces = {};
	if (defined ($veconf->{netif}) && $veconf->{netif}->{value}) {
	    $ifaces = parse_netif($veconf->{netif}->{value}, $vmid);
	}
	my $newif = parse_netif($param->{netif}, $vmid);

	foreach my $ifname (sort keys %$ifaces) {
	    if (!$newif->{$ifname}) {
		push @$changes, '--netif_del', $ifname;
	    }
	}

	my $newvalue = '';
	foreach my $ifname (sort keys %$newif) {
	    $newvalue .= ';' if $newvalue;

	    $newvalue .= print_netif($newif->{$ifname});

	    my $ifadd = $ifname;
	    $ifadd .= $newif->{$ifname}->{mac} ? ",$newif->{$ifname}->{mac}" : ',';
	    $ifadd .= $newif->{$ifname}->{host_ifname} ? ",$newif->{$ifname}->{host_ifname}" : ',';
	    $ifadd .= $newif->{$ifname}->{host_mac} ? ",$newif->{$ifname}->{host_mac}" : ',';
	    $ifadd .= $newif->{$ifname}->{bridge} ? ",$newif->{$ifname}->{bridge}" : '';

	    if (!$ifaces->{$ifname} || ($ifaces->{$ifname}->{raw} ne $newif->{$ifname}->{raw})) {
		push @$changes, '--netif_add', $ifadd;
	    }
	}
	$veconf->{netif}->{value} = $newvalue;
    }

    if (defined($param->{'nameserver'})) {
	my $nshash = {};
	foreach my $ns (PVE::Tools::split_list($param->{'nameserver'})) {
	    if (!$nshash->{$ns}) {
		push @$changes, '--nameserver', $ns;
		$nshash->{$ns} = 1;
	    }
	}
	$veconf->{'nameserver'}->{value} = join(' ', keys %$nshash);
    }

    # foreach my $nv (@$changes) { print "CHANGE: $nv\n"; }

    return $changes;
}

sub generate_raw_config {
    my ($raw, $conf) = @_;

    my $text = '';

    my $found = {};

    while ($raw && $raw =~ s/^(.*?)(\n|$)//) {
	my $line = $1;

	if ($line =~ m/^\#/ || $line =~ m/^\s*$/) {
	    $text .= "$line\n";
	    next;
	}

	if ($line =~ m/^\s*([A-Z][A-Z0-9_]*)\s*=\s*\"(.*)\"\s*$/i) {
	    my $name = lc($1);
	    if ($conf->{$name}) {
		$found->{$name} = 1;
		if (my $line = create_config_line($name, $conf->{$name})) {
		    $text .= $line;
		}
	    }
	}
    }

    foreach my $key (keys %$conf) {
	next if $found->{$key};
	next if $key eq 'digest';
	if (my $line = create_config_line($key, $conf->{$key})) {
	    $text .= $line;
	}
    }

    return $text;
}

sub create_lock_manager {
    return LockFile::Simple->make(-format => '%f',
				  -autoclean => 1,
				  -max => 30, 
				  -delay => 2, 
				  -stale => 1,
				  -nfs => 0);
}

sub lock_container {
    my ($vmid, $code, @param) = @_;

    my $filename = $global_vzconf->{lockdir} . "/${vmid}.lck";
    my $lock;
    my $res;

    eval {

	my $lockmgr = create_lock_manager();

	$lock = $lockmgr->lock($filename) || die "can't lock container $vmid\n";

        $res = &$code(@param);

    };
    my $err = $@;

    $lock->release() if $lock;

    die $err if $err;

    return $res;
}

sub replacepw {
    my ($file, $epw) = @_;

    my $tmpfile = "$file.$$";

    eval  {
	open (SRC, "<$file") ||
	    die "unable to open file '$file' - $!";

	my $st = File::stat::stat(\*SRC) ||
	    die "unable to stat file - $!";

	open (DST, ">$tmpfile") ||
	    die "unable to open file '$tmpfile' - $!";

	# copy owner and permissions
	chmod $st->mode, \*DST;
	chown $st->uid, $st->gid, \*DST;
	
	while (defined (my $line = <SRC>)) {
	    $line =~ s/^root:[^:]*:/root:${epw}:/;
	    print DST $line;
	}
    };

    my $err = $@;

    close (SRC);
    close (DST);

    if ($err) {
	unlink $tmpfile;
    } else {
	rename $tmpfile, $file;
	unlink $tmpfile; # in case rename fails
    }	
}

sub set_rootpasswd {
    my ($privatedir, $opt_rootpasswd) = @_;

    my $pwfile = "$privatedir/etc/passwd";

    return if ! -f $pwfile;

    my $shadow = "$privatedir/etc/shadow";

    if ($opt_rootpasswd !~ m/^\$/) {
	my $time = substr (Digest::SHA1::sha1_base64 (time), 0, 8);
	$opt_rootpasswd = crypt(encode("utf8", $opt_rootpasswd), "\$1\$$time\$");
    };

    if (-f $shadow) {
	replacepw ($shadow, $opt_rootpasswd);
	replacepw ($pwfile, 'x');
    } else {
	replacepw ($pwfile, $opt_rootpasswd);
    }
}
