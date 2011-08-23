package PVE::Cluster;

use strict;
use Socket;
use IO::File;
use PVE::Config;
use PVE::Utils;
use PVE::I18N;
use PVE::SafeSyslog;
use Time::HiRes qw (gettimeofday);

my $hostrsapubkey;
my $rootrsapubkey;

# x509 certificate utils

my $basedir = "/etc/pve";
my $pveca_key_fn = "$basedir/priv/pve-root-ca.key";
my $pveca_srl_fn = "$basedir/priv/pve-root-ca.srl";
my $pveca_cert_fn = "$basedir/pve-root-ca.pem";
my $pvessl_key_fn = "$basedir/local/pve-ssl.key";
my $pvessl_cert_fn = "$basedir/local/pve-ssl.pem";

sub gen_local_dirs {
    my ($nodename) = @_;

    (-l "$basedir/local" ) || die "pve configuration filesystem not mounted\n";

    my $dir = "$basedir/nodes/$nodename";
    if (! -d $dir) {
	mkdir($dir) || die "unable to create directory '$dir' - $!\n";
    }
    $dir = "$dir/priv";
    if (! -d $dir) {
	mkdir($dir) || die "unable to create directory '$dir' - $!\n";
    }
}

sub gen_pveca_key {
    
    return if -f $pveca_key_fn;

    eval {
	PVE::Utils::run_command (['openssl', 'genrsa', '-out', $pveca_key_fn, '1024']);
    };

    die "unable to generate pve ca key:\n$@" if $@;
}

sub gen_pveca_cert {
    
    if (-f $pveca_key_fn && -f $pveca_cert_fn) {
	return 0;
    }

    gen_pveca_key();

    # we try to generate an unique 'subject' to avoid browser problems
    # (reused serial numbers, ..)
    my $nid = (split (/\s/, `md5sum '$pveca_key_fn'`))[0] || time();

    eval {
	PVE::Utils::run_command (['openssl', 'req', '-batch', '-days', '3650', '-new',
				  '-x509', '-nodes', '-key', 
				  $pveca_key_fn, '-out', $pveca_cert_fn, '-subj', 
				  "/CN=Proxmox Virtual Environment/OU=$nid/O=PVE Cluster Manager CA/"]);
    };

    die "generating pve root certificate failed:\n$@" if $@;

    return 1;
}

sub gen_pve_ssl_key {
    
    return if -f $pvessl_key_fn;

    eval {
	PVE::Utils::run_command (['openssl', 'genrsa', '-out', $pvessl_key_fn, '1024']);
    };
     
    die "unable to generate pve ssl key:\n$@" if $@;
}

sub update_serial {
    my ($serial) = @_;

    PVE::Tools::file_set_contents($pveca_srl_fn, $serial);
}

sub gen_pve_ssl_cert {
    my ($force, $nodename) = @_;

    return if !$force && -f $pvessl_cert_fn;

    my $names = "IP:127.0.0.1,DNS:localhost";

    my $rc = PVE::Config::read_file ('resolvconf');

    my $packed_ip = gethostbyname($nodename);
    if (defined $packed_ip) {
        my $ip = inet_ntoa($packed_ip);
	$names .= ",IP:" . $ip;
    }

    my $fqdn = $nodename;

    $names .= ",DNS:" . $nodename;

    if ($rc && $rc->{search}) {
	$fqdn = $nodename . "." . $rc->{search};
	$names .= ",DNS:$fqdn";
    }


    my $sslconf = <<__EOD;
RANDFILE = /root/.rnd
extensions = v3_req
 
[ req ]
default_bits = 1024
distinguished_name = req_distinguished_name
req_extensions = v3_req
prompt = no
string_mask = nombstr

[ req_distinguished_name ]
organizationalUnitName = PVE Cluster Node
organizationName = Proxmox Virtual Environment
commonName = $fqdn

[ v3_req ]
basicConstraints = CA:FALSE
nsCertType = server
keyUsage = nonRepudiation, digitalSignature, keyEncipherment
subjectAltName = $names
__EOD

    my $cfgfn = "/tmp/pvesslconf-$$.tmp";
    my $fh = IO::File->new ($cfgfn, "w");
    print $fh $sslconf;
    close ($fh);

    my $reqfn = "/tmp/pvecertreq-$$.tmp";
    unlink $reqfn;

    eval {
	PVE::Utils::run_command (['openssl', 'req', '-batch', '-new', '-config', $cfgfn,
				  '-key', $pvessl_key_fn, '-out', $reqfn]);
    };

    if (my $err = $@) {
	unlink $reqfn;
	unlink $cfgfn;
	die "unable to generate pve certificate request:\n$err";
    }

    update_serial ("0000000000000000") if ! -f $pveca_srl_fn;

    eval {
	PVE::Utils::run_command (['openssl', 'x509', '-req', '-in', $reqfn, '-days', '3650', 
				  '-out', $pvessl_cert_fn, '-CAkey', $pveca_key_fn,
				  '-CA', $pveca_cert_fn, '-CAserial', $pveca_srl_fn, 
				  '-extfile', $cfgfn]);
    };

    if (my $err = $@) {
	unlink $reqfn;
	unlink $cfgfn;
	die "unable to generate pve ssl certificate:\n$err";
    }

    unlink $cfgfn;
    unlink $reqfn;
}

sub clusterinfo {
    my ($filename) = @_;

    $filename = "/etc/pve/cluster.cfg" if !$filename;

    my $ifaces = PVE::Config::read_file ("interfaces");
    my $hostname = PVE::Config::read_file ("hostname");
    my $ccfg = PVE::Config::read_file ($filename);

    my $localip = $ifaces->{vmbr0}->{address} || $ifaces->{eth0}->{address};

    my $cinfo;

    if ($ccfg) {
	$cinfo = $ccfg;
	$cinfo->{exists} = 1;
    }

    $cinfo->{local} = {
	role => '-',
	cid => 0,
	ip => $localip,
	name => $hostname,
    };

    my $found = 0;
    foreach my $ni (@{$cinfo->{nodes}}) {
	if ($ni->{ip} eq $localip || $ni->{name} eq $hostname) {
	    $cinfo->{local} = $ni;
	    $found = 1;
	    last;
	}
    }

    if (!$found) {
	push @{$cinfo->{nodes}}, $cinfo->{local};
	$cinfo->{"CID_0"} = $cinfo->{local};
    }
 
    # fixme: assign fixed ports instead?
    # fixme: $ni->{configport} = 50000 + $ni->{cid};
    my $ind = 0;
    foreach my $ni (sort {$a->{cid} <=> $b->{cid}} @{$cinfo->{nodes}}) {
	if ($ni->{cid} == $cinfo->{local}->{cid}) {
	    $ni->{configport} = 83;
	} else {
	    $ni->{configport} = 50000 + $ind;
	    $ind++;
	}
    }

    return $cinfo;
}

sub save_clusterinfo {
    my ($cinfo) = @_;

    my $filename = "/etc/pve/cluster.cfg";

    my $fh = PVE::AtomicFile->open($filename, "w");

    eval {

	return if !$cinfo->{nodes} || scalar (@{$cinfo->{nodes}}) == 0;

	printf ($fh "maxcid $cinfo->{maxcid}\n\n");

	foreach my $ni (@{$cinfo->{nodes}}) {
	    
	    my $cid = $ni->{cid};
	    die "missing cluster id\n" if !$cid;
	    die "missing ip address for node '$cid'\n" if !$ni->{ip};
	    die "missing name for node '$cid'\n" if !$ni->{name};
	    die "missing host RSA key for node '$cid'\n" if !$ni->{hostrsapubkey};
	    die "missing user RSA key for node '$cid'\n" if !$ni->{rootrsapubkey};
	    
	    if ($ni->{role} eq 'M') {
		printf ($fh "master $ni->{cid} {\n");
		printf ($fh " IP: $ni->{ip}\n");
		printf ($fh " NAME: $ni->{name}\n");
		printf ($fh " HOSTRSAPUBKEY: $ni->{hostrsapubkey}\n");
		printf ($fh " ROOTRSAPUBKEY: $ni->{rootrsapubkey}\n");
		printf ($fh "}\n\n");
	    } elsif ($ni->{role} eq 'N') {
		printf ($fh "node $ni->{cid} {\n");
		printf ($fh " IP: $ni->{ip}\n");
		printf ($fh " NAME: $ni->{name}\n");
		printf ($fh " HOSTRSAPUBKEY: $ni->{hostrsapubkey}\n");
		printf ($fh " ROOTRSAPUBKEY: $ni->{rootrsapubkey}\n");
		printf ($fh "}\n\n");
	    }
	}
    };

    my $err = $@;
    $fh->detach() if $err;
    $fh->close(1);

    die $err if $err;
}

sub rewrite_keys {
    my ($cinfo) = @_;

    mkdir '/root/.ssh/';

    # rewrite authorized hosts files

    my $filename = '/root/.ssh/authorized_keys';
    my $fh;
    my $changes;

    eval {

	$fh = PVE::AtomicFile->open ($filename, "w");

	my $done = {};

	eval {
	    if (open (ORG, "$filename")) {
		while (my $line = <ORG>) {
		    if ($line =~ m/^\s*ssh-rsa\s+(\S+)\s+root\@(\S+)\s*$/) {
			my ($key, $ip) = ($1, $2);
			my $new;

			foreach my $ni (@{$cinfo->{nodes}}) {
			    $new = $ni if $ni->{ip} eq $ip;
			}

			if ($new) {
			    if (!$done->{$ip}) {
				$changes = 1 if $key ne $new->{rootrsapubkey};
				printf ($fh "ssh-rsa %s root\@%s\n", $new->{rootrsapubkey}, $new->{ip});
				$done->{$ip} = 1;
			    }
			} else {
			    print $fh $line; # copy line to new file
			}
		    } else {
			print $fh $line; # copy line to new file
		    }
		}
		close (ORG);
	    }
	};

	foreach my $ni (@{$cinfo->{nodes}}) {
	    if (!$done->{$ni->{ip}}) {
		$changes = 1;
		printf ($fh "ssh-rsa %s root\@%s\n", $ni->{rootrsapubkey}, $ni->{ip});
		$done->{$ni->{ip}} = 1;
	    }
	}
    };

    $fh->close() if $fh;

    chmod (0600, $filename);

    # rewrite known hosts files

    $filename = '/root/.ssh/known_hosts';

    eval {
	
	$fh = PVE::AtomicFile->open($filename, "w");

	my $done = {};

	eval {
	    if (open (ORG, "$filename")) {
		while (my $line = <ORG>) {
		    if ($line =~ m/^\s*(\S+)\s+ssh-rsa\s+(\S+)\s*$/) {
			my ($ip, $key) = ($1, $2);
			my $new;

			foreach my $ni (@{$cinfo->{nodes}}) {
			    $new = $ni if $ni->{ip} eq $ip;
			}

			if ($new) {
			    if (!$done->{$ip}) {
				$changes = 1 if $key ne $new->{hostrsapubkey};
				printf ($fh "%s ssh-rsa %s\n", $new->{ip}, $new->{hostrsapubkey});
				$done->{$ip} = 1;
			    }
			} else {
			    print $fh $line; # copy line to new file
			}
		    } else {
			print $fh $line; # copy line to new file
		    }
		}
		close (ORG);
	    }
	};

	foreach my $ni (@{$cinfo->{nodes}}) {
	    if (!$done->{$ni->{ip}}) {
		$changes = 1;
		printf ($fh "%s ssh-rsa %s\n", $ni->{ip}, $ni->{hostrsapubkey});
		$done->{$ni->{ip}} = 1;
	    }
	}
    };

    $fh->close() if $fh;
 
    return $changes;
}

sub cluster_sync_mastercfg {
    my ($cinfo, $syncip, $noreload) = @_;

    my $lip = $cinfo->{local}->{ip};
    my $lname = $cinfo->{local}->{name};

    my $cmpccfg;
    my $cmppvecfg;
    my $cmpqemucfg;
    my $cmpvzdump;
    my $cmpstoragecfg;

    my $storagecfg_old = PVE::Config::read_file ('storagecfg');

    if ($syncip ne $lip) {

	mkdir '/etc/pve/master';
	unlink </etc/pve/master/*>;

	my $cmd = ['rsync', '--rsh=ssh -l root -o BatchMode=yes', '-lpgoq', 
		   "$syncip:/etc/pve/* /etc/cron.d/vzdump", '/etc/pve/master/',
		   '--exclude', '*~' ];

	eval {
	    my $out = PVE::Utils::run_command ($cmd);
	};

	my $err = $@;

	if ($err) {
	    my $cmdtxt = join (' ', @$cmd);
	    die "syncing master configuration from '$syncip' failed ($cmdtxt) : $err\n";
	}
	
	# verify that the remote host is cluster master

	my $newcinfo = clusterinfo ('/etc/pve/master/cluster.cfg');
	
	if (!$newcinfo->{master} || ($newcinfo->{master}->{ip} ne $syncip)) {
	    die "host '$syncip' is not cluster master\n";
	}

	if ($newcinfo->{local}->{role} ne 'N') {
	    syslog ('info', "local host is no longer part of cluster '$syncip'");
	    rename '/etc/pve/master/cluster.cfg', '/etc/pve/cluster.cfg';
	    die "local host is no node of cluster '$syncip' " .
		"(role = $newcinfo->{local}->{role})\n";
	}

	# we are part of the cluster

	$cmpccfg = (system ("cmp -s /etc/pve/master/cluster.cfg /etc/pve/cluster.cfg") != 0)
	    if -f '/etc/pve/master/cluster.cfg';

	rename '/etc/pve/master/cluster.cfg', '/etc/pve/cluster.cfg' if $cmpccfg;

	# check for storage changes

	if (-f '/etc/pve/master/storage.cfg') {
	    $cmpstoragecfg = (system ("cmp -s /etc/pve/master/storage.cfg /etc/pve/storage.cfg") != 0);
	    rename '/etc/pve/master/storage.cfg', '/etc/pve/storage.cfg' if $cmpstoragecfg;
	} else {
	    unlink '/etc/pve/storage.cfg';
	}

	# check for vzdump crontab changes

	$cmpvzdump = (system ("cmp -s /etc/pve/master/vzdump /etc/cron.d/vzdump") != 0)
	    if -f '/etc/pve/master/vzdump';

	# check for CA cerificate change
	if ((-f '/etc/pve/master/pve-root-ca.pem') && (-f '/etc/pve/master/pve-root-ca.key') &&
	    (system ("cmp -s /etc/pve/master/pve-root-ca.pem /etc/pve/pve-root-ca.pem") != 0)) {
	    rename '/etc/pve/master/pve-root-ca.pem', '/etc/pve/pve-root-ca.pem';
	    rename '/etc/pve/master/pve-root-ca.key', '/etc/pve/pve-root-ca.key';
	    my $serial = sprintf ("%04X000000000000", $newcinfo->{local}->{cid});
	    update_serial ($serial);
	    eval {
		# make sure we have a private key
		gen_pve_ssl_key();
		# force key rewrite
		gen_pve_ssl_cert (1, $newcinfo);
	    };
	    my $err = $@;
	    if ($err) {
		syslog ('err', "pve key generation failed - try 'pcecert' manually");
	    }
	} 

	$cmppvecfg = (system ("cmp -s /etc/pve/master/pve.cfg /etc/pve/pve.cfg") != 0)
	    if -f '/etc/pve/master/pve.cfg';

	rename '/etc/pve/master/pve.cfg', '/etc/pve/pve.cfg' if $cmppvecfg;

	$cmpqemucfg = (system ("cmp -s /etc/pve/master/qemu-server.cfg /etc/pve/qemu-server.cfg") != 0)
	    if -f '/etc/pve/master/qemu-server.cfg';

	rename '/etc/pve/master/qemu-server.cfg', '/etc/pve/qemu-server.cfg' if $cmpqemucfg;

	#fixme: store/remove additional files

    }

    if ($cmpccfg ||  # cluster info changed 
	($syncip eq $lip)) { # or forced sync withe proxca -s

	if ($cmpccfg) {
	    syslog ('info', "detected changed cluster config");
	}

	$cinfo = clusterinfo ();

	my $changes = rewrite_keys ($cinfo);

	if ($changes) {
	    PVE::Utils::service_cmd ('sshd', 'reload');
	}

	PVE::Utils::service_cmd ('pvetunnel', 'reload') if !$noreload;	
    }

    if ($cmppvecfg) { # pve.cfg settings changed

	# fixme: implement me

    }

    if ($cmpqemucfg) { # qemu-server.cfg settings changed
	# nothing to do
    }

    if ($cmpvzdump) {
	syslog ('info', "installing new vzdump crontab");
	rename '/etc/pve/master/vzdump', '/etc/cron.d/vzdump';
    }

    if ($cmpstoragecfg) {
	my $storagecfg_new = PVE::Config::read_file ('storagecfg');

	foreach my $sid (PVE::Storage::storage_ids ($storagecfg_old)) {
	    my $ocfg = PVE::Storage::storage_config ($storagecfg_old, $sid);
	    if (my $ncfg = PVE::Storage::storage_config ($storagecfg_new, $sid, 1)) {
		if (!$ocfg->{disable} && $ncfg->{disable}) {
		    syslog ('info', "deactivate storage '$sid'");
		    eval { PVE::Storage::deactivate_storage ($storagecfg_new, $sid); };
		    syslog ('err', $@) if $@;
		}
	    } else {
		if (!$ocfg->{disable}) {
		    syslog ('info', "deactivate removed storage '$sid'");
		    eval { PVE::Storage::deactivate_storage ($storagecfg_old, $sid); };
		    syslog ('err', $@) if $@;   
		}
	    }
	}
    }
}

sub vzlist_update {
    my ($cid, $ticket) = @_;
    
    my $cinfo = clusterinfo ();

    my $vzlist;

    my $cvzl;

    my $conn = PVE::ConfigClient::connect ($ticket);

    my $ni;
    if (($ni = $cinfo->{"CID_$cid"})) {
	my $rcon = PVE::ConfigClient::connect ($ticket, $cinfo, $cid);
	$vzlist = $rcon->vzlist()->result;
    }

    if ($vzlist) {
	$cvzl = $conn->cluster_vzlist($cid, $vzlist)->result;
    }

    return $cvzl;
}

sub load_vmconfig {
    my ($cinfo, $cid, $veid, $type, $ticket) = @_;

    my $remcon = PVE::ConfigClient::connect ($ticket, $cinfo, $cid);
    my $vminfo = $remcon->vmconfig ($veid, $type)->result;
    
    if (!$vminfo) {
	die "unable to get configuration data for VEID '$veid'";
    }

    $vminfo->{ni} = $cinfo->{"CID_$cid"};

    return $vminfo;
}

sub sync_templates {
    my ($cinfo) = @_;

    if ($cinfo->{master} && ($cinfo->{master}->{cid} !=  $cinfo->{local}->{cid})) {

	my $remip = $cinfo->{master}->{ip};

	my $cmd = ['rsync', '--rsh=ssh -l root -o BatchMode=yes', '-aq', 
		   '--delete', '--bwlimit=10240',
		   "$remip:/var/lib/vz/template", "/var/lib/vz" ];

	eval { PVE::Utils::run_command ($cmd); };

	my $err = $@;

	if ($err) {
	    my $cmdtxt = join (' ', @$cmd);
	    die "syncing template from master '$remip' failed ($cmdtxt) : $err\n";
	}
    }
}

sub get_nextid {
    my ($vzlist, $vmops) = @_; 

    my $veexist = {};
    
    PVE::Utils::foreach_vmrec ($vzlist, sub {
	my ($cid, $vmid) = @_;
	$veexist->{$1} = 1;
    });

    PVE::Utils::foreach_vmrec ($vmops, sub {
	my ($cid, $vmid, $d) = @_;
	next if $d->{command} ne 'create';
	$veexist->{$1} = 1;
    });

    my $nextveid;
    for (my $i = 101; $i < 10000; $i++) {
	if (!$veexist->{$i}) {
	    $nextveid = $i;
	    last;
	}
    }

    return $nextveid;
}

1;
