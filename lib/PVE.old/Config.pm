package PVE::Config;

use strict;
use IO::File;
use IO::Dir;
use PVE::AtomicFile;
use File::stat;
use File::Basename;
use PVE::Utils;
use Fcntl ':flock';
use PVE::SafeSyslog;
use Storable qw(dclone);            
use Getopt::Long;
use Digest::SHA1;
use Linux::Inotify2;
use PVE::QemuServer;
use PVE::Storage;
use PVE::AccessControl;

my $ccache;
my $ccachemap;
my $inotify;
my $inotify_pid = 0;
my $versions;

# to enable cached operation, you need to call 'inotify_init'
# inotify handles are a limited resource, so use with care (only
# enable the cache if you really need it)

# Note: please close the inotify handle after you fork

my $shadowfiles = {
    '/etc/network/interfaces' => '/etc/network/interfaces.new',
};


sub soap_host_port {
    return ('127.0.0.1', 83); 
}

my @zoneinfo;

sub zoneinfo {
    if (@zoneinfo) {
	return @zoneinfo;
    }
    
    my $line;

    open (TMP, "</usr/share/zoneinfo/zone.tab");

    while ($line = <TMP>) {
	chomp $line;
	if (!($line =~ m|^[A-Z][A-Z]\s+\S+\s+(\S+)/(\S+).*|)) {
	    next;
	}	    

	if ($1 && $2) {
	    push @zoneinfo, "$1/$2";
	}
    }

    close (TMP);

    @zoneinfo = sort (@zoneinfo);

    return @zoneinfo;
}

my $bond_modes = { 'balance-rr' => 0,
		   'active-backup' => 1,
		   'balance-xor' => 2,
		   'broadcast' => 3,
		   '802.3ad' => 4,
		   'balance-tlb' => 5,
		   'balance-alb' => 6,
	       };

sub get_bond_modes {
    return $bond_modes;
}

sub parse_netif {
    my $data = shift;

    my $res = {};
    foreach my $iface (split (/;/, $data)) {
	my $d = {};
	foreach my $pv (split (/,/, $iface)) {
	    if ($pv =~ m/^(ifname|mac|bridge|host_ifname|host_mac)=(.+)$/) {
		$d->{$1} = $2;
	    }
	}
	if ($d->{ifname}) {
	    $d->{raw} = $data;
	    $res->{$d->{ifname}} = $d;
	} else {
	    die "unable to parse --netif value";
	}
    }

    return $res;
}

sub read_aplinfo {
    my ($filename, $fh, $update) = @_;

    local $/ = "";

    my $list = {};

    while (my $rec = <$fh>) {
	chomp $rec;
	
	my $res = {};

	while ($rec) {

	    if ($rec =~ s/^Description:\s*([^\n]*)(\n\s+.*)*$//si) {
		$res->{headline} = $1;
		my $long = $2;
		$long =~ s/\n\s+/ /g;
		$long =~ s/^\s+//g;
		$long =~ s/\s+$//g;
		$res->{description} = $long;
	    } elsif ($rec =~ s/^Version:\s*(.*\S)\s*\n//i) {
		my $version = $1;
		if ($version =~ m/^(\d[a-zA-Z0-9\.\+\-\:\~]*)-(\d+)$/) {
		    $res->{version} = $version;
		} else {
		    my $msg = "unable to parse appliance record: version = '$version'";
		    $update ? die "$msg\n" : syslog ('err', $msg);
		}
	    } elsif ($rec =~ s/^Type:\s*(.*\S)\s*\n//i) {
		my $type = $1;
		if ($type =~ m/^(openvz)$/) {
		    $res->{type} = $type;
		} else {
		    my $msg = "unable to parse appliance record: unknown type '$type'";
		    $update ? die "$msg\n" : syslog ('err', $msg);
		}
	    } elsif ($rec =~ s/^([^:]+):\s*(.*\S)\s*\n//) {
		$res->{lc $1} = $2;
	    } else {
		my $msg = "unable to parse appliance record: $rec";
		$update ? die "$msg\n" : syslog ('err', $msg);		
		$res = {};
		last;
	    }
	}

	if ($res->{'package'} eq 'pve-web-news' && $res->{description}) {
	    $list->{'all'}->{$res->{'package'}} = $res;	    
	    next;
	}

	$res->{section} = 'unknown' if !$res->{section};

	if ($res->{'package'} && $res->{type} && $res->{os} && $res->{version} &&
	    $res->{infopage}) {
	    my $template;
	    if ($res->{location}) {
		$template = $res->{location};
		$template =~ s|.*/([^/]+.tar.gz)|$1|;
	    } else {
		$template = "$res->{os}-$res->{package}_$res->{version}_i386.tar.gz";
		$template =~ s/$res->{os}-$res->{os}-/$res->{os}-/;
	    }
	    $res->{template} = $template;
	    $list->{$res->{section}}->{$template} = $res;
	    $list->{'all'}->{$template} = $res;
	} else {
	    my $msg = "found incomplete appliance records";
	    $update ? die "$msg\n" : syslog ('err', $msg);		
	}
    }
    
    return $list;
}

# we write /etc/host at startup - see pvesetup (we do not
# dynamically update this file).
# we use an host alias 'pvelocalhost' to mark the line we write/update.
sub update_etc_hosts {

    my $hostname = PVE::Config::read_file ("hostname");
    my $rconf = PVE::Config::read_file ('resolvconf');
    my $ifaces = PVE::Config::read_file ("interfaces");
    my $localip = $ifaces->{vmbr0}->{address} || $ifaces->{eth0}->{address};

    my $domain = $rconf->{search};

    my $filename = "/etc/hosts";
    my $fh = IO::File->new($filename, "r") ||
	die "unable to open file '$filename' - $! :ERROR";

    my $outfh = PVE::AtomicFile->open($filename, "w") ||
	die "unable to open file '$filename' for writing - $! :ERROR";

    eval {
	my $line;
	while (defined ($line = <$fh>)) {
	    chomp $line;
	    if ($line =~ m/^\s*127.0.0.1\s/) {
		print $outfh "$line\n";
		print $outfh "$localip $hostname.$domain $hostname pvelocalhost\n";
		next;
	    }

	    if ($line =~ m/^\s*(\d+\.\d+\.\d+\.\d+\s+.*\S)\s*/) {
		my $found = 0;
		foreach my $n (split (/\s+/, $1)) {
		    my $e = lc ($n);
		    if ($e eq lc ($hostname) ||
			$e eq lc ($localip) ||
			$e eq 'pvelocalhost') {
			$found = 1;
			last;
		    }
		}
		next if $found;
	    }

	    print $outfh "$line\n";
	}

	$fh->close();

	$outfh->close(1);
    };

    my $err = $@;

    die $err if $err;
}

sub get_qmconfig {
    my $vmid = shift;

    return read_file ("/etc/qemu-server/$vmid.conf");
}

sub get_veconfig {
    my $veid = shift;

    return read_file ("/etc/vz/conf/$veid.conf");
}

sub read_qmconfig {
    my ($filename, $fh) = @_;

    $filename =~ m|/(\d+)\.conf$| 
	|| die "got strange filename '$filename'";

    my $storecfg = read_file ("storagecfg");

    return PVE::QemuServer::parse_config ($filename, $fh, $storecfg);
}

sub read_vzconfig {
    my ($filename, $fh) = @_;

    $filename =~ m|/(\d+)\.conf$| 
	|| die "got strange filename '$filename'";

    my $data = {};
    while (defined (my $line = <$fh>)) {
	next if $line =~ m/^#/;
	next if $line =~ m/^\s*$/;

	if ($line =~ m/^\s*([A-Z][A-Z0-9_]*)\s*=\s*\"(.*)\"\s*$/i) {
	    my $name = lc ($1);
	    my $text = $2;

	    if ($text =~ m/^(\d+):(\d+)$/) {
		my $bar = $1;
		my $lim = $2;
		
		$data->{$name}->{bar} = $bar;
		$data->{$name}->{lim} = $lim;
	    } else {
		$data->{$name}->{value} = $text;
	    }
	} else {
	    die "unable to parse config line: $line\n";
	}
    }
        
    return $data;
}

sub read_rsapubkey {
    my ($filename, $fh) = @_;

    my $line;

    1 while (defined ($line = <$fh>) && ($line !~ m/^.*ssh-rsa\s/));

    my $rsapubkey = $line;

    $rsapubkey =~ s/^.*ssh-rsa\s+//i;
    $rsapubkey =~ s/\s+root\@\S+\s*$//i;
    $rsapubkey =~ s/\s+$//;

    die "strange key format - not base64 encoded" 
	if $rsapubkey !~ m/^[A-Za-z0-9\+\/]+={0,2}$/;

    die "unable to read '$filename'" if !$rsapubkey;

    return $rsapubkey;
}

sub read_pcounter {
    my ($filename, $fh) = @_;

    my $res = {};

    my $line;

    while (defined ($line = <$fh>)) {
	chomp $line;
	next if $line =~ m/^\s*$/;

	if ($line =~ m/^counter:(\S+):(\d+):$/) {
	    $res->{$1} = $2;
	} else {
	    syslog ('err', "warning: unable to parse file '$filename'");
	}
    }

    return $res;
}

sub write_pcounter {
    my ($filename, $fh, $data) = @_;

    foreach my $cn (keys %$data) {
	print $fh "counter:$cn:$data->{$cn}:\n";
    }

    return $data;
}

sub update_pcounter {
    my ($filename, $data, $counter) = @_;

    $data->{$counter}++; 

    return $data;
}

sub read_var_lib_vmops {
    my ($filename, $fh) = @_;

    my $line;

    my $res = {};
 
    while (defined ($line = <$fh>)) {
	chomp $line;

	my $upid_hash;

	if (($upid_hash = PVE::Utils::upid_decode ($line)) &&
	    $upid_hash->{type} eq 'vmops') {
	    my $cid = $upid_hash->{cid};
	    my $veid = $upid_hash->{veid};
	    $res->{"CID_$cid"}->{"VEID_$veid"} = $upid_hash;
	}
    }

    return $res;
}

sub write_var_lib_vmops {
    my ($filename, $fh, $data) = @_;

    foreach my $ckey (sort keys %$data) {
	next if $ckey !~ m/^CID_(\d+)$/;
	my $cid = $1;
	my $vzl = $data->{$ckey};

	foreach my $vekey (sort keys %$vzl) {
	    next if $vekey !~ m/^VEID_(\d+)$/;
	    my $veid = $1;
	
	    my $upid = PVE::Utils::upid_encode ($vzl->{$vekey});
	    print $fh "$upid\n";
	}
    }

    return $data;
}

sub update_var_lib_vmops {
    my ($filename, $vmops, $upid) = @_;

    if (my $upid_hash = PVE::Utils::upid_decode ($upid)) {
	my $cid = $upid_hash->{cid};
	my $veid = $upid_hash->{veid};
	$vmops->{"CID_$cid"}->{"VEID_$veid"} = $upid_hash;
    }   

    return $vmops;
}

sub read_var_lib_vzlist {
    my ($filename, $fh) = @_;

    my $line;

    my $res = {};
 
    my $cid;

    while (defined ($line = <$fh>)) {
	chomp $line;

	next if $line =~ m/^\#/;   # skip comments
	next if $line =~ m/^\s*$/; # skip empty lines

	if ($line =~ m/^CID:(\d+):(\d+):(\d+):\S*$/) {
	    $cid = $1;
	    $res->{"CID_$cid"}->{lasttime} = $2;
	    $res->{"CID_$cid"}->{version} = $3;
	    next;
	} 

	if (!defined ($cid)) {
	    warn "unable to parse line - undefined cluster ID: $line";
	}

	if ($line =~ m/^(\d+):([a-z]+):(\d+):(\S+):(\S+):(\S+):(\d+):(\d+):(\d+):(\d+):(\d+):(\d+):(\d+):$/) {
	    my $d = {};
	    $d->{type} = $2;
	    $d->{nproc} = $3;
	    $d->{status} = $4;
	    $d->{ip} = $5;
	    $d->{name} = $6;
	    $d->{mem} = $7;
	    $d->{maxmem} = $8;
	    $d->{disk} = $9;
	    $d->{maxdisk} = $10;
	    $d->{pctcpu} = $11;
	    $d->{uptime} = $12;
	    $d->{relcpu} = $13;
	    
	    $res->{"CID_$cid"}->{"VEID_$1"} = $d;
	} else {
	    warn "unable to parse line: $line";
	}
    }

    return $res;
}

sub write_var_lib_vzlist {
    my ($filename, $fh, $data) = @_;

    print $fh "# Cluster wide VZ status\n\n";

    foreach my $ckey (sort keys %$data) {
	next if $ckey !~ m/^CID_(\d+)$/;
	my $cid = $1;
	my $vzl = $data->{$ckey};

	print $fh "CID:$cid:$vzl->{lasttime}:$vzl->{version}:\n";

	foreach my $vekey (sort keys %$vzl) {
	    my $d = $vzl->{$vekey};
	    next if $vekey !~ m/^VEID_(\d+)$/;
	    my $veid = $1;

	    print $fh "$veid:$d->{type}:$d->{nproc}:$d->{status}:$d->{ip}:$d->{name}:" .
		"$d->{mem}:$d->{maxmem}:$d->{disk}:$d->{maxdisk}:$d->{pctcpu}:$d->{uptime}:$d->{relcpu}:\n";
	}

	print $fh "\n";
    }

    return $data;
}

sub update_var_lib_vzlist {
    my ($filename, $vzlist, $data, $cid) = @_;

    my $old = $vzlist->{"CID_$cid"};

    if ($old) {

	# only update if record is newer:
	# record is considered newer if either version or lastime is newer
	# (skip update when version is older and lastime ins older)
     
	if (($old->{version} > $data->{version}) && 
	    ($old->{lasttime} >= $data->{lasttime})) {
	    return;
	}
    }

    my $ckey = "CID_$cid";

    if (!$data->{qemu}) {
	# record does not contain info about qemu, so copy them
	my $vzl = $vzlist->{$ckey};
	foreach my $vekey (keys %$vzl) {
	    my $d = $vzl->{$vekey};
	    next if $vekey !~ m/^VEID_(\d+)$/;
	    next if $d->{type} ne 'qemu';
	    next if defined ($data->{$vekey}); # already defined ?
	    $data->{$vekey} = $d;
	}
    }

    if (!$data->{openvz}) {
	# record does not contain info about openvz, so copy them
	my $vzl = $vzlist->{$ckey};
	foreach my $vekey (keys %$vzl) {
	    my $d = $vzl->{$vekey};
	    next if $vekey !~ m/^VEID_(\d+)$/;
	    next if $d->{type} ne 'openvz';
	    next if defined ($data->{$vekey}); # already defined ?
	    $data->{$vekey} = $d;
	}
    }

    $vzlist->{$ckey} = $data;

    # remove non-existing cluster nodes
    my $ccfg = read_file ("clustercfg");
    PVE::Utils::foreach_cid ($vzlist, sub {
	my ($cid, undef, $ckey) = @_;
	if ($ccfg) {
	    delete $vzlist->{$ckey} if !defined ($ccfg->{$ckey});
	} else {
	    delete $vzlist->{$ckey} if $cid != 0;
	}
    });

    return $vzlist;
}


sub read_var_lib_syncstatus {
    my ($filename, $fh) = @_;

    my $line;

    my $res = {};
 
    while (defined ($line = <$fh>)) {
	chomp $line;

	next if $line =~ m/^\#/;   # skip comments
	next if $line =~ m/^\s*$/; # skip empty lines

	if ($line =~ m/^(\d+):(\d+):$/) {
	    $res->{$1}->{lastsync} = $2;
	}
    }

    return $res;
}

sub write_var_lib_syncstatus {
    my ($filename, $fh, $data) = @_;

    print $fh "# Cluster sync status (CID:TIME:)\n\n";

    foreach my $cid (keys %$data) {
	my $stime = $data->{$cid}->{lastsync};
	print $fh "$cid:$stime:\n";
    }

    return $data;
}

sub read_etc_hostname {
    my ($filename, $fd) = @_;

    my $hostname = <$fd>;

    chomp $hostname;

    return $hostname;
}

sub write_etc_hostname {
    my ($filename, $fh, $hostname) = @_;

    print $fh "$hostname\n";

    return $hostname;
}

sub read_root_dotforward {
    my ($filename, $fh) = @_;

    my $line;
    while (defined ($line = <$fh>)) {
	chomp $line;
	next if $line =~ m/^\s*$/;
	return $line;
    }

    return undef;
}

sub write_root_dotforward {
    my ($filename, $fh, $mailto) = @_;

    print $fh "$mailto\n";

    return $mailto;
}

sub read_etc_pve_cfg {
    my ($filename, $fh) = @_;

    my $line;

    my $res = {};

    while (defined ($line = <$fh>)) {
	chomp $line;
	next if $line =~ m/^\#/;   # skip comments
	next if $line =~ m/^\s*$/; # skip empty lines

	if ($line =~ m/^([^\s:]+):\s*(.*\S)\s*$/) {
	    $res->{lc($1)} = $2;
	}

    }

    return $res;
}

sub write_etc_pve_cfg {
    my ($filename, $fh, $data) = @_;

    return if !$data;

    foreach my $k (keys %$data) {
	print $fh "$k: $data->{$k}\n";
    }

    return $data;
}

sub read_etc_pve_storagecfg {
    my ($filename, $fh) = @_;

    return PVE::Storage::parse_config ($filename, $fh);
}

sub read_etc_pve_qemu_server_cfg {
    my ($filename, $fh) = @_;

    my $line;

    my $res = {};

    while (defined ($line = <$fh>)) {
	chomp $line;
	next if $line =~ m/^\#/;   # skip comments
	next if $line =~ m/^\s*$/; # skip empty lines

	if ($line =~ m/^([^\s:]+):\s*(.*\S)\s*$/) {
	    $res->{lc($1)} = $2;
	}

    }

    return $res;
}

sub write_etc_pve_qemu_server_cfg {
    my ($filename, $fh, $data) = @_;

    return if !$data;

    foreach my $k (keys %$data) {
	print $fh "$k: $data->{$k}\n";
    }

    return $data;
}

sub read_etc_timezone {
    my ($filename, $fd) = @_;

    my $timezone = <$fd>;

    chomp $timezone;

    return $timezone;
}

sub write_etc_timezone {
    my ($filename, $fh, $timezone) = @_;

    print $fh "$timezone\n";

    unlink ("/etc/localtime");
    symlink ("/usr/share/zoneinfo/$timezone", "/etc/localtime");

    return $timezone;
}

sub __dowhash_to_dow {
    my ($d, $num) = @_;

    my @da = ();
    push @da, $num ? 1 : 'mon' if $d->{mon};
    push @da, $num ? 2 : 'tue' if $d->{tue};
    push @da, $num ? 3 : 'wed' if $d->{wed};
    push @da, $num ? 4 : 'thu' if $d->{thu};
    push @da, $num ? 5 : 'fri' if $d->{fri};
    push @da, $num ? 6 : 'sat' if $d->{sat};
    push @da, $num ? 7 : 'sun' if $d->{sun};

    return join ',', @da;
}

sub update_etc_crond_vzdump {
    my ($filename, $jobs, $data) = @_;

    my $digest = $data->{digest};

    my $verify = 0;
    foreach my $jid (keys %$data) {
	next if $jid !~ m/^JOB\d+$/;
	$verify = 1 if defined ($jobs->{$jid});
	my $d = $data->{$jid};
	if (!$d) {
	    delete $jobs->{$jid};
	} else {
	    $jobs->{$jid} = $d;
	}
    }
    if ($verify && (!$digest || ($digest ne $jobs->{digest}))) {
	die "unable to update a modified file '$filename'\n";
    }

    return $jobs;
}

sub read_etc_crond_vzdump {
    my ($filename, $fh) = @_;

    my $line;

    my $jid = 1; # we start at 1
    my $ejid = 0;

    my $sha1 = Digest::SHA1->new;

    my $res = {};
 
    my $dowmap = {mon => 1, tue => 2, wed => 3, thu => 4,
		  fri => 5, sat => 6, sun => 7};
    my $rdowmap = { '1' => 'mon', '2' => 'tue', '3' => 'wed', '4' => 'thu',
		    '5' => 'fri', '6' => 'sat', '7' => 'sun', '0' => 'sun'};

    while (defined ($line = <$fh>)) {
        $sha1->add ($line); # compute digest
	chomp $line;
	next if $line =~ m/^\s*$/;
	next if $line =~ m/^\#/;
	next if $line =~ m/^PATH\s*=/; # we always overwrite path

	my $d;
	my $err;

	if ($line =~ m|^(\d+)\s+(\d+)\s+\*\s+\*\s+(\S+)\s+root\s+(/\S+/)?vzdump(\s+(.*))?$|) {

	    eval {
		$d->{minute} = $1;
		$d->{hour} = $2;
		my $dow = $3;
		my $param = $6;

		# convenient startime can be used to sort jobs
		$d->{starttime} = sprintf ("%02d:%02d", $d->{hour}, $d->{minute}); 

		$dow = '1,2,3,4,5,6,7' if $dow eq '*';

		foreach my $day (split (/,/, $dow)) {
		    if ($day =~ m/^(mon|tue|wed|thu|fri|sat|sun)-(mon|tue|wed|thu|fri|sat|sun)$/i) {
			for (my $i = $dowmap->{lc($1)}; $i <= $dowmap->{lc($2)}; $i++) {
			    my $r = $rdowmap->{$i};
			    $d->{$r} = 1;	
			}

		    } elsif ($day =~ m/^(mon|tue|wed|thu|fri|sat|sun|[0-7])$/i) {
			$day = $rdowmap->{$day} if $day =~ m/\d/;
			$d->{lc($day)} = 1;
		    } else {
			die "unable to parse day of week '$dow' in '$filename'\n";
			$err = 1;
		    }
		}

		my $opt_all;
		my $opt_exclude_path;
		my $opt_compress = 0;
		my $opt_dumpdir;
		my $opt_storage;
		my $opt_mailto;
		my $opt_stop;
		my $opt_suspend;
		my $opt_snap;
		my $opt_node;
		my $opt_quiet;

		local @ARGV = split /\s+/, $param;
		if (!GetOptions ('all' => \$opt_all,
				 'compress' => \$opt_compress,
				 'mailto=s@' => \$opt_mailto,
				 'stop' =>\$opt_stop,
				 'suspend' =>\$opt_suspend,
				 'snapshot' =>\$opt_snap,
				 'quiet' =>\$opt_quiet,
				 'node=i' =>\$opt_node,
				 'storage=s' =>\$opt_storage,
				 'dumpdir=s' => \$opt_dumpdir)) {

		    die "unable to parse vzdump options in '$filename'\n";
		} else {
		    if ($opt_snap) {
			$d->{mode} = 'snapshot';
		    } elsif ($opt_suspend) {
			$d->{mode} = 'suspend';
		    } elsif ($opt_stop) {
			$d->{mode} = 'stop';
		    }

		    $d->{compress} = $opt_compress;
		    $d->{dumpdir} = $opt_dumpdir;
		    $d->{storage} = $opt_storage;
		    $d->{includeall} = $opt_all;
		    $d->{mailto} = $opt_mailto ? join (' ', @$opt_mailto) : '';
		    $d->{node} = $opt_node || 0;

		    my $vmlist = '';
		    foreach my $vmid (@ARGV) {
			if ($vmid =~ m/^\d+$/) {
			    $vmlist .= $vmlist ? " $vmid" : $vmid;
			} else {
			    die "unable to parse vzdump options in '$filename'\n";
			}
		    
		    }
	    
		    $d->{vmlist} = $vmlist; 
		}

		$d->{param} = $param;

		$d->{dow} = __dowhash_to_dow ($d);

		$res->{"JOB$jid"} = $d;
	    };

	    my $err = $@;

   
	    if ($err) {
		syslog ('err', "warning: $err");

		$res->{"EJOB$ejid"} = { line => $line };
		$ejid++;

	    } else {
		$jid++;
	    }
	} elsif ($line =~ m|^\S+\s+(\S+)\s+\S+\s+\S+\s+\S+\s+\S+\s+(\S.*)$|) {
	    syslog ('err', "warning: malformed line in '$filename'");
	    $res->{"EJOB$ejid"} = { line => $line };
	    $ejid++;
	} else {
	    syslog ('err', "ignoring malformed line in '$filename'");
	}
    }

    $res->{digest} = $sha1->hexdigest;

    return $res;
}

sub write_etc_crond_vzdump {
    my ($filename, $fh, $data) = @_;

    print $fh "# Atomatically generated file - do not edit\n\n";

    print $fh "PATH=\"/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin\"\n\n";

    my @jids;
    
    foreach my $jid (keys %$data) {
	next if $jid !~ m/^JOB\d+$/;
	my $d = $data->{$jid};
	next if !$d;
	push @jids, $jid;
	$d->{starttime} = sprintf ("%02d:%02d", $d->{hour}, $d->{minute}); # used to sort

	my $dow;
	if ($d->{mon} && $d->{tue} && $d->{wed} && $d->{thu} &&
	    $d->{fri} && $d->{sat} && $d->{sun}) {
	    $dow = '*';
	} else {
	    $dow = __dowhash_to_dow ($d, 1);
	}

	$dow = '*' if !$dow;

	$d->{dow} = $dow;

	my $param = '--quiet';
	$param .= " --node $d->{node}" if $d->{node};
	$param .= " --$d->{mode}"	if $d->{mode};
	$param .= " --compress" if $d->{compress};
	$param .= " --dumpdir $d->{dumpdir}" if $d->{dumpdir};
	$param .= " --storage $d->{storage}" if $d->{storage};

	if (my $mailto = $d->{mailto}) {
	    $mailto =~ s/[,;]/ /g;
	    foreach my $ma (split (/\s+/, $mailto)) {
		$param .= " --mailto $ma";
	    }
	}

	$param .= " --all" if $d->{includeall};
	$param .= " $d->{vmlist}" if $d->{vmlist};

	$d->{param} = $param;
    }

    my $found = 0;
    foreach my $jid (sort { ($data->{$a}->{node} <=> $data->{$b}->{node}) ||
			    ($data->{$a}->{starttime} cmp $data->{$b}->{starttime}) ||
			    ($data->{$a}->{dow} cmp $data->{$b}->{dow}) ||
			    ($data->{$a}->{param} cmp $data->{$b}->{param})} @jids) {

	my $d = $data->{$jid};

	printf $fh "$d->{minute} $d->{hour} * * %-11s root vzdump $d->{param}\n", $d->{dow};
	$found = 1;
    }

    print $fh "\n" if $found;

    $found = 0;
    foreach my $jid (keys %$data) {
	next if $jid !~ m/^EJOB\d+$/;
	my $d = $data->{$jid};
	next if !$d || !$d->{line};
	print $fh "$d->{line}\n";
	$found = 1;
    }

    print $fh "\n" if $found;

    return $data;
}

sub read_etc_network_interfaces {
    my ($filename, $fh) = @_;

    my $ifaces = {};

    my $line;

    my $fd2;

    if ($fd2 = IO::File->new ("/proc/net/dev", "r")) {
	while (defined ($line = <$fd2>)) {
	    chomp ($line);
	    if ($line =~ m/^\s*(eth[0-9]):.*/) {
		$ifaces->{$1}->{exists} = 1;
	    }
	}
	close ($fd2);
    }

    # always add the vmbr0 bridge device
    $ifaces->{vmbr0}->{exists} = 1;

    if ($fd2 = IO::File->new ("/proc/net/if_inet6", "r")) {
	while (defined ($line = <$fd2>)) {
	    chomp ($line);
	    if ($line =~ m/^[a-f0-9]{32}\s+[a-f0-9]{2}\s+[a-f0-9]{2}\s+[a-f0-9]{2}\s+[a-f0-9]{2}\s+(eth\d+|vmbr\d+|bond\d+)$/) {
		$ifaces->{$1}->{active} = 1;
	    }
	}
	close ($fd2);
    }

    my $gateway = 0;

    while (defined ($line = <$fh>)) {
	chomp ($line);
	next if $line =~ m/^#/;
 
	if ($line =~ m/^auto\s+(.*)$/) {
	    my @aa = split (/\s+/, $1);

	    foreach my $a (@aa) {
		$ifaces->{$a}->{autostart} = 1;
	    }

	} elsif ($line =~ m/^iface\s+(\S+)\s+inet\s+(\S+)\s*$/) {
	    my $i = $1;
	    $ifaces->{$i}->{type} = $2;
	    while (defined ($line = <$fh>) && ($line =~ m/^\s+((\S+)\s+(.+))$/)) {
		my $option = $1;
		my ($id, $value) = ($2, $3);
		if (($id eq 'address') || ($id eq 'netmask') || ($id eq 'broadcast')) {
		    $ifaces->{$i}->{$id} = $value;
		} elsif ($id eq 'gateway') {
		    $ifaces->{$i}->{$id} = $value;
		    $gateway = 1;
		} elsif ($id eq 'slaves') {
		    foreach my $p (split (/\s+/, $value)) {
			next if $p eq 'none';
			$ifaces->{$i}->{$id}->{$p} = 1;
		    }
		} elsif ($id eq 'bridge_ports') {
		    foreach my $p (split (/\s+/, $value)) {
			next if $p eq 'none';
			$ifaces->{$i}->{$id}->{$p} = 1;
		    }
		} elsif ($id eq 'bridge_stp') {
		    if ($value =~ m/^\s*(on|yes)\s*$/i) {
			$ifaces->{$i}->{$id} = 'on';
		    } else {
			$ifaces->{$i}->{$id} = 'off';
		    }
		} elsif ($id eq 'bridge_fd') {
		    $ifaces->{$i}->{$id} = $value;
		} elsif ($id eq 'bond_miimon') {
		    $ifaces->{$i}->{$id} = $value;
		} elsif ($id eq 'bond_mode') {
		    # always use names
		    foreach my $bm (keys %$bond_modes) {
			my $id = $bond_modes->{$bm};
			if ($id eq $value) {
			    $value = $bm;
			    last;
			}
		    }
		    $ifaces->{$i}->{$id} = $value;
		} else {
		    push @{$ifaces->{$i}->{options}}, $option;
		}
	    }
	}
    }

    if (!$gateway) {
	$ifaces->{vmbr0}->{gateway} = '';
    }

    if (!$ifaces->{lo}) {
	$ifaces->{lo}->{type} = 'loopback';
	$ifaces->{lo}->{autostart} = 1;
    }

    foreach my $iface (keys %$ifaces) {
	if ($iface =~ m/^bond\d+$/) {

	} elsif ($iface =~ m/^vmbr\d+$/) {
	    if (!defined ($ifaces->{$iface}->{bridge_fd})) {
		$ifaces->{$iface}->{bridge_fd} = 0;
	    }
	    if (!defined ($ifaces->{$iface}->{bridge_stp})) {
		$ifaces->{$iface}->{bridge_stp} = 'off';
	    }
	} elsif ($iface =~ m/^(\S+):\d+$/) {
	    if (defined ($ifaces->{$1})) {
		$ifaces->{$iface}->{exists} = $ifaces->{$1}->{exists};
	    } else {
		$ifaces->{$1}->{exists} = 0;
		$ifaces->{$iface}->{exists} = 0;
	    }
	}

	$ifaces->{$iface}->{type} = 'manual' if !$ifaces->{$iface}->{type};
    }

    return $ifaces;
}

sub __print_interface {
    my ($fh, $ifaces, $iface) = @_;

    return if !$ifaces->{$iface}->{type};

    if ($ifaces->{$iface}->{autostart}) {
	print $fh "auto $iface\n";
    }
    print $fh "iface $iface inet $ifaces->{$iface}->{type}\n";
    print $fh "\taddress  $ifaces->{$iface}->{address}\n" if $ifaces->{$iface}->{address};
    print $fh "\tnetmask  $ifaces->{$iface}->{netmask}\n" if $ifaces->{$iface}->{netmask};
    print $fh "\tgateway  $ifaces->{$iface}->{gateway}\n" if $ifaces->{$iface}->{gateway};
    print $fh "\tbroadcast  $ifaces->{$iface}->{broadcast}\n" if $ifaces->{$iface}->{broadcast};

    if ($ifaces->{$iface}->{bridge_ports} || ($iface =~ m/^vmbr\d+$/)) {
	my $ports;
	if ($ifaces->{$iface}->{bridge_ports}) {
	    $ports = join (' ', sort keys %{$ifaces->{$iface}->{bridge_ports}});
	}
	$ports = 'none' if !$ports;
	print $fh "\tbridge_ports $ports\n";
    }

    if ($ifaces->{$iface}->{bridge_stp} || ($iface =~ m/^vmbr\d+$/)) {
	my $v = $ifaces->{$iface}->{bridge_stp};
	$v = defined ($v) ? $v : 'off';
	print $fh "\tbridge_stp $v\n";
    }

    if (defined ($ifaces->{$iface}->{bridge_fd}) || ($iface =~ m/^vmbr\d+$/)) {
	my $v = $ifaces->{$iface}->{bridge_fd};
	$v = defined ($v) ? $v : 0;
	print $fh "\tbridge_fd $v\n";
    }

    if ($ifaces->{$iface}->{slaves} || ($iface =~ m/^bond\d+$/)) {
	my $slaves;
	if ($ifaces->{$iface}->{slaves}) {
	    $slaves = join (' ', sort keys %{$ifaces->{$iface}->{slaves}});
	}
	$slaves = 'none' if !$slaves;
	print $fh "\tslaves $slaves\n";
    }

    if (defined ($ifaces->{$iface}->{'bond_miimon'}) || ($iface =~ m/^bond\d+$/)) {
	my $v = $ifaces->{$iface}->{'bond_miimon'};
	$v = defined ($v) ? $v : 100;
	print $fh "\tbond_miimon $v\n";
    }

    if (defined ($ifaces->{$iface}->{'bond_mode'}) || ($iface =~ m/^bond\d+$/)) {
	my $v = $ifaces->{$iface}->{'bond_mode'};
	$v = defined ($v) ? $v : 'balance-rr';
	print $fh "\tbond_mode $v\n";
    }

    foreach my $option (@{$ifaces->{$iface}->{options}}) {
	print $fh "\t$option\n";
    }

    print $fh "\n";
}

sub write_etc_network_interfaces {
    my ($filename, $fh, $ifaces) = @_;

    print $fh "# network interface settings\n";

    foreach my $iface (keys %$ifaces) { 
	delete ($ifaces->{$iface}->{printed}); 
    }

    foreach my $t (('lo', 'eth', '')) {
	foreach my $iface (sort keys %$ifaces) {
	    next if $ifaces->{$iface}->{printed};
	    next if $iface !~ m/^$t/;
	    $ifaces->{$iface}->{printed} = 1;
	    __print_interface ($fh, $ifaces, $iface);
	}
    }
   
    return $ifaces;
}

sub read_etc_resolv_conf {
    my ($filename, $fh) = @_;

    my $res = {};

    while (my $line = <$fh>) {
	chomp $line;
	if ($line =~ m/^search\s+(\S+)\s*/) {
	    $res->{search} = $1;
	} elsif ($line =~ m/^nameserver\s+(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\s*/) {
	    push @{$res->{nameservers}}, $1;
	}
    }

    return $res;
}

sub write_etc_resolv_conf {
    my ($filename, $fh, $resolv) = @_;

    print $fh "search $resolv->{search}\n";

    my $written = {};
    my $nslist = [];

    foreach my $ns (@{$resolv->{nameservers}}) {
	if ($ns ne '0.0.0.0' && !$written->{$ns}) {
	    $written->{$ns} = 1;
	    print $fh "nameserver $ns\n";
	    push @$nslist, $ns;
	}
    }

    $resolv->{nameservers} = $nslist;
    return $resolv;
}

sub ccache_default_writer {
    my ($filename, $data) = @_;

    die "undefined config writer for '$filename' :ERROR";
}

sub ccache_default_parser {
    my ($filename, $srcfd) = @_;

    die "undefined config reader for '$filename' :ERROR";
}

sub ccache_compute_diff {
    my ($filename, $shadow) = @_;

    my $diff = '';

    open (TMP, "diff -b -N -u '$filename' '$shadow'|");
	
    while (my $line = <TMP>) {
	$diff .= $line;
    }

    close (TMP);

    $diff = undef if !$diff;

    return $diff;
}

sub write_file {
    my ($filename, $data, $full) = @_;

    $filename = $ccachemap->{$filename} if defined ($ccachemap->{$filename});

    die "file '$filename' not added :ERROR" if !defined ($ccache->{$filename});

    my $writer = $ccache->{$filename}->{writer};

    my $realname = $filename;

    my $shadow;
    if ($shadow = $shadowfiles->{$filename}) {
	$realname = $shadow;
    }

    my $fh = PVE::AtomicFile->open($realname, "w") ||
	die "unable to open file '$realname' for writing - $! :ERROR";

    my $res;

    eval {
	$res = &$writer ($filename, $fh, $data);
    };

    $ccache->{$filename}->{version} = undef;

    my $err = $@;
    $fh->detach() if $err;
    $fh->close(1);

    die $err if $err;

    my $diff;
    if ($shadow && $full) {
	$diff = ccache_compute_diff ($filename, $shadow);
    }

    if ($full) {
	return { data => $res, changes => $diff };
    }

    return $res;
}

sub update_file {
    my ($filename, $data, @args) = @_;

    $filename = $ccachemap->{$filename} if defined ($ccachemap->{$filename});

    my $update = $ccache->{$filename}->{update};

    die "unable to update/merge data" if !$update;

    my $lkfn = "$filename.lock";

    if (!open (FLCK, ">>$lkfn")) {
	die "unable to open lock file '$lkfn' - $?";
    }

    if (!flock (FLCK, LOCK_EX)) {
	close (FLCK);
	die "unable to aquire lock for file '$lkfn' - $?";
    }

    my $newdata;

    eval {

	my $olddata = read_file ($filename);

	if ($data) {
	    my $res = &$update ($filename, $olddata, $data, @args);
	    if (defined ($res)) {
		$newdata = write_file ($filename, $res);
	    } else {
		$newdata = $olddata;
	    }
	} else {
	    $newdata = $olddata;
	}
    };

    my $err = $@;

    close (FLCK);

    die $err if $err;

    return $newdata;
}

sub discard_changes {
    my ($filename, $full) = @_;

    $filename = $ccachemap->{$filename} if defined ($ccachemap->{$filename});

    die "file '$filename' not added :ERROR" if !defined ($ccache->{$filename});

    if (my $copy = $shadowfiles->{$filename}) {
	unlink $copy;
    }

    return read_file ($filename, $full);
}

sub read_file {
    my ($filename, $full) = @_;

    my $parser;

    if ($filename =~ m|^/etc/qemu-server/\d+\.conf$|) {
	$parser = \&read_qmconfig;
    } elsif ($filename =~ m|^/etc/vz/conf/\d+\.conf$|) {
	$parser = \&read_vzconfig;
    } else {
	$filename = $ccachemap->{$filename} if defined ($ccachemap->{$filename});

	die "file '$filename' not added :ERROR" if !defined ($ccache->{$filename});

	$parser = $ccache->{$filename}->{parser};
    }

    my $fd;
    my $shadow;

    poll() if $inotify; # read new inotify events

    $versions->{$filename} = 0 if !defined ($versions->{$filename});

    my $cver = $versions->{$filename};

    if (my $copy = $shadowfiles->{$filename}) {
	if ($fd = IO::File->new ($copy, "r")) {
	    $shadow = $copy;
	} else {
	    $fd = IO::File->new ($filename, "r");
	}
    } else {
	$fd = IO::File->new ($filename, "r");
    }

    my $acp = $ccache->{$filename}->{always_call_parser};

    if (!$fd) {
	$ccache->{$filename}->{version} = undef;
	$ccache->{$filename}->{data} = undef; 
	$ccache->{$filename}->{diff} = undef;
	return undef if !$acp;
    }

    my $noclone = $ccache->{$filename}->{noclone};

    # file unchanged?
    if (!$ccache->{$filename}->{nocache} &&
	$inotify && $versions->{$filename} &&
	defined ($ccache->{$filename}->{data}) &&
	defined ($ccache->{$filename}->{version}) &&
	($ccache->{$filename}->{readonce} ||
	 ($ccache->{$filename}->{version} == $versions->{$filename}))) {

	my $ret;
	if (!$noclone && ref ($ccache->{$filename}->{data})) {
	    $ret->{data} = dclone ($ccache->{$filename}->{data});
	} else {
	    $ret->{data} = $ccache->{$filename}->{data};
	}
	$ret->{changes} = $ccache->{$filename}->{diff};
	
	return $full ? $ret : $ret->{data};
    }

    my $diff;

    if ($shadow) {
	$diff = ccache_compute_diff ($filename, $shadow);
    }

    my $res = &$parser ($filename, $fd);

    if (!$ccache->{$filename}->{nocache}) {
	$ccache->{$filename}->{version} = $cver;
    }

    # we cache data with references, so we always need to
    # dclone this data. Else the original data may get
    # modified.
    $ccache->{$filename}->{data} = $res;

    # also store diff
    $ccache->{$filename}->{diff} = $diff;

    my $ret;
    if (!$noclone && ref ($ccache->{$filename}->{data})) {
	$ret->{data} = dclone ($ccache->{$filename}->{data});
    } else {
	$ret->{data} = $ccache->{$filename}->{data};
    }
    $ret->{changes} = $ccache->{$filename}->{diff};

    return $full ? $ret : $ret->{data};
}    

sub add_file {
    my ($id, $filename, $parser, $writer, $update, %options) = @_;

    die "file '$filename' already added :ERROR" if defined ($ccache->{$filename});
    die "ID '$id' already used :ERROR" if defined ($ccachemap->{$id});

    $ccachemap->{$id} = $filename;
    $ccache->{$filename}->{id} = $id;

    $ccache->{$filename}->{parser} = $parser || \&ccache_default_parser;
    $ccache->{$filename}->{writer} = $writer || \&ccache_default_writer;
    $ccache->{$filename}->{update} = $update;

    foreach my $opt (keys %options) {
	my $v = $options{$opt};
	if ($opt eq 'readonce') {
	    $ccache->{$filename}->{$opt} = $v;
	} elsif ($opt eq 'nocache') {
	    $ccache->{$filename}->{$opt} = $v;
	} elsif ($opt eq 'noclone') {
	    # noclone flag for large read-only data chunks like aplinfo
	    $ccache->{$filename}->{$opt} = $v;
	} elsif ($opt eq 'always_call_parser') {
	    # when set, we call parser even when the file does not exists.
	    # this allows the parser to return some default
	    $ccache->{$filename}->{$opt} = $v;
	} else {
	    die "internal error - unsupported option '$opt'";
	}
    }


}

sub poll {
    return if !$inotify;

    if ($inotify_pid != $$) {
	syslog ('err', "got inotify poll request in wrong process - disabling inotify");
	$inotify = undef;
    } else {
	1 while $inotify && $inotify->poll;
    }
}

sub flushcache {
    foreach my $filename (keys %$ccache) {
	$ccache->{$filename}->{version} = undef;
	$ccache->{$filename}->{data} = undef;
	$ccache->{$filename}->{diff} = undef;
    }
}

sub inotify_close {
    $inotify = undef;
}

sub inotify_init {

    die "only one inotify instance allowed" if $inotify;

    $inotify =  Linux::Inotify2->new()
	|| die "Unable to create new inotify object: $!";

    $inotify->blocking (0);

    $versions = {};

    my $dirhash = {};
    foreach my $fn (keys %$ccache) {
	my $dir = dirname ($fn);
	my $base = basename ($fn);

	$dirhash->{$dir}->{$base} = $fn;

	if (my $sf = $shadowfiles->{$fn}) {
	    $base = basename ($sf);
	    $dir = dirname ($sf);
	    $dirhash->{$dir}->{$base} = $fn; # change version of original file!
	}
    }

    # also get versions of qemu and openvz config files
    $dirhash->{"/etc/qemu-server"}->{_regex} = '\d+\.conf';
    $dirhash->{"/etc/vz/conf"}->{_regex} = '\d+\.conf';

    $inotify_pid = $$;

    foreach my $dir (keys %$dirhash) {

	my $evlist = IN_MODIFY|IN_ATTRIB|IN_MOVED_FROM|IN_MOVED_TO|IN_DELETE|IN_CREATE;
	$inotify->watch ($dir, $evlist, sub {
	    my $e = shift;
	    my $name = $e->name;

	    if ($inotify_pid != $$) {
		syslog ('err', "got inotify event in wrong process");
	    }

	    if ($e->IN_ISDIR || !$name) {
		return;
	    }

	    if ($e->IN_Q_OVERFLOW) {
		syslog ('info', "got inotify overflow - flushing cache");
		flushcache();
		return;
	    }

	    if ($e->IN_UNMOUNT) {
		syslog ('err', "got 'unmount' event on '$name' - disabling inotify");
		$inotify = undef;
	    }
	    if ($e->IN_IGNORED) { 
		syslog ('err', "got 'ignored' event on '$name' - disabling inotify");
		$inotify = undef;
	    }

	    my $re = $dirhash->{$dir}->{_regex};
	    if ($re && ($name =~ m|^$re$|)) {

		my $fn = "$dir/$name";
		$versions->{$fn}++;
		#print "VERSION:$fn:$versions->{$fn}\n";

	    } elsif (my $fn = $dirhash->{$dir}->{$name}) {

		$versions->{$fn}++;
		#print "VERSION:$fn:$versions->{$fn}\n";
	    }
	});
    }

    foreach my $dir (keys %$dirhash) {
	foreach my $name (keys %{$dirhash->{$dir}}) {
	    if ($name eq '_regex') {
		my $re = $dirhash->{$dir}->{_regex};
		if (my $fd = IO::Dir->new ($dir)) {
		    while (defined(my $de = $fd->read)) { 
			if ($de =~ m/^$re$/) {
			    my $fn = "$dir/$de";
			    $versions->{$fn}++; # init with version
			    #print "init:$fn:$versions->{$fn}\n";
			}
		    }
		}
	    } else {
		my $fn = $dirhash->{$dir}->{$name};
		$versions->{$fn}++; # init with version
		#print "init:$fn:$versions->{$fn}\n";
	    }
	}
    }

}

add_file ('hostname', "/etc/hostname",  
	  \&read_etc_hostname, 
	  \&write_etc_hostname);

add_file ('syncstatus', "/var/lib/pve-manager/syncstatus",  
	  \&read_var_lib_syncstatus, 
	  \&write_var_lib_syncstatus);

add_file ('vzlist', "/var/lib/pve-manager/vzlist",  
	  \&read_var_lib_vzlist, 
	  \&write_var_lib_vzlist,
	  \&update_var_lib_vzlist);

add_file ('vmops', "/var/lib/pve-manager/vmops",  
	  \&read_var_lib_vmops, 
	  \&write_var_lib_vmops,
	  \&update_var_lib_vmops);

add_file ('interfaces', "/etc/network/interfaces",
	  \&read_etc_network_interfaces,
	  \&write_etc_network_interfaces);

add_file ('resolvconf', "/etc/resolv.conf", 
	  \&read_etc_resolv_conf, 
	  \&write_etc_resolv_conf);

add_file ('timezone', "/etc/timezone", 
	  \&read_etc_timezone, 
	  \&write_etc_timezone);

add_file ('pvecfg', "/etc/pve/pve.cfg", 
	  \&read_etc_pve_cfg, 
	  \&write_etc_pve_cfg);

add_file ('storagecfg', "/etc/pve/storage.cfg", 
	  \&read_etc_pve_storagecfg, undef, undef,
	  always_call_parser => 1); 

add_file ('rootrsapubkey', "/root/.ssh/id_rsa.pub", 
	  \&read_rsapubkey);

add_file ('hostrsapubkey', "/etc/ssh/ssh_host_rsa_key.pub", 
	  \&read_rsapubkey);

add_file ('clustercfg', "/etc/pve/cluster.cfg", 
	  \&PVE::Storage::read_cluster_config);

add_file ('newclustercfg', "/etc/pve/master/cluster.cfg", 
	  \&PVE::Storage::read_cluster_config);

add_file ('qemuservercfg', "/etc/pve/qemu-server.cfg", 
	  \&read_etc_pve_qemu_server_cfg, 
	  \&write_etc_pve_qemu_server_cfg);

add_file ('vzdump', "/etc/cron.d/vzdump", 
	  \&read_etc_crond_vzdump, 
	  \&write_etc_crond_vzdump,
	  \&update_etc_crond_vzdump);

add_file ('aplinfo', "/var/lib/pve-manager/apl-available", 
	  \&read_aplinfo, undef, undef, 
	  noclone => 1);

add_file ('dotforward', "/root/.forward", 
	  \&read_root_dotforward,
	  \&write_root_dotforward);
 
add_file ('usercfg', "/etc/pve/user.cfg", 
	  \&PVE::AccessControl::parse_config);

# persistent counter implementation
add_file ('pcounter', "/var/lib/pve-manager/pcounter", 
	  \&read_pcounter, 
	  \&write_pcounter,
	  \&update_pcounter, 
	  nocache => 1);

1;
