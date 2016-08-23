package PVE::APLInfo;

use strict;
use IO::File;
use PVE::SafeSyslog;
use PVE::Tools;
use LWP::UserAgent;
use POSIX qw(strftime);

my $logfile = "/var/log/pveam.log";
my $aplinfodir = "/var/lib/pve-manager/apl-info";

# Default list of GPG keys allowed to sign aplinfo
#
#pub   1024D/5CAC72FE 2004-06-24
#      Key fingerprint = 9ABD 7E02 AD24 3AD3 C2FB  BCCC B0C1 CC22 5CAC 72FE
#uid                  Proxmox Support Team <support@proxmox.com>
#pub   2048R/A16EB94D 2008-08-15 [expires: 2023-08-12]
#      Key fingerprint = 694C FF26 795A 29BA E07B  4EB5 85C2 5E95 A16E B94D
#uid                  Turnkey Linux Release Key <release@turnkeylinux.com>

my $valid_keys = {
    '9ABD7E02AD243AD3C2FBBCCCB0C1CC225CAC72FE' => 1, # fingerprint support@proxmox.com
    '25CAC72FE' => 1,                                # keyid support@proxmox.com
    '694CFF26795A29BAE07B4EB585C25E95A16EB94D' => 1, # fingerprint release@turnkeylinux.com
    'A16EB94D' => 1,                                 # keyid release@turnkeylinux.com
};

sub import_gpg_keys {

    my @keyfiles = ('support@proxmox.com.pubkey', 'release@turnkeylinux.com.pubkey');

    foreach my $key (@keyfiles) {
	my $fn = "/usr/share/doc/pve-manager/$key";
	system ("/usr/bin/gpg --batch --no-tty --status-fd=1 -q " .
		"--logger-fd=1 --import $fn >>$logfile");
    }
}

sub logmsg {
    my ($logfd, $msg) = @_;

    chomp $msg;

    my $tstr = strftime ("%b %d %H:%M:%S", localtime);

    foreach my $line (split (/\n/, $msg)) {
	print $logfd "$tstr $line\n";
    }
}

sub read_aplinfo_from_fh {
    my ($fh, $list, $source, $update) = @_;

    local $/ = "";

    while (my $rec = <$fh>) {
	chomp $rec;
	
	my $res = {};

	while ($rec) {

	    if ($rec =~ s/^Description:\s*([^\n]*)(\n\s+.*)*$//si) {
		$res->{headline} = $1;
		my $long = $2 || '';
		$long =~ s/\n\s+/ /g;
		$long =~ s/^\s+//g;
		$long =~ s/\s+$//g;
		$res->{description} = $long;
	    } elsif ($rec =~ s/^Version:\s*(.*\S)\s*\n//i) {
		my $version = $1;
		if ($version =~ m/^(\d[a-zA-Z0-9\.\+\-\:\~]*)(-(\d+))?$/) {
		    $res->{version} = $version;
		} else {
		    my $msg = "unable to parse appliance record: version = '$version'\n";
		    $update ? die $msg : warn $msg;
		}
	    } elsif ($rec =~ s/^Type:\s*(.*\S)\s*\n//i) {
		my $type = $1;
		if ($type =~ m/^(openvz|lxc)$/) {
		    $res->{type} = $type;
		} else {
		    my $msg = "unable to parse appliance record: unknown type '$type'\n";
		    $update ? die $msg : warn $msg;
		}
	    } elsif ($rec =~ s/^([^:]+):\s*(.*\S)\s*\n//) {
		$res->{lc $1} = $2;
	    } else {
		my $msg = "unable to parse appliance record: $rec\n";
		$update ? die $msg : warn $msg;		
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
		$template =~ s|.*/([^/]+.tar.[gx]z)$|$1|;
		if ($res->{location} !~ m|^([a-zA-Z]+)\://|) {
		    # relative localtion (no http:// prefix)
		    $res->{location} = "$source/$res->{location}";
		}
	    } else {
		my $arch = $res->{architecture} || 'i386';
		$template = "$res->{os}-$res->{package}_$res->{version}_$arch.tar.gz";
		$template =~ s/$res->{os}-$res->{os}-/$res->{os}-/;
		$res->{location} = "$source/$res->{section}/$template";
	    }
	    $res->{source} = $source;
	    $res->{template} = $template;
	    $list->{$res->{section}}->{$template} = $res;
	    $list->{'all'}->{$template} = $res;
	} else {
	    my $msg = "found incomplete appliance records\n";
	    $update ? die $msg : warn $msg;		
	}
    }
}

sub read_aplinfo {
    my ($filename, $list, $source, $update) = @_;

    my $fh = IO::File->new("<$filename") ||
	die "unable to open file '$filename' - $!\n";

    eval { read_aplinfo_from_fh($fh, $list, $source, $update); };
    my $err = $@;

    close($fh);

    die $err if $err;
    
    return $list;
}

sub url_get {
    my ($ua, $url, $file, $logfh) = @_;

    my $req = HTTP::Request->new(GET => $url);

    logmsg ($logfh, "start download $url");
    my $res = $ua->request($req, $file);

    if ($res->is_success) {
	logmsg ($logfh, "download finished: " . $res->status_line);
	return 0;
    }

    logmsg ($logfh, "download failed: " . $res->status_line);

    return 1;
}

sub download_aplinfo {
    my ($ua, $aplurl, $host, $logfd) = @_;

    my $aplsrcurl = "$aplurl/aplinfo.dat.gz";
    my $aplsigurl = "$aplurl/aplinfo.dat.asc";

    my $tmp = "$aplinfodir/pveam-${host}.tmp.$$";
    my $tmpgz = "$tmp.gz";
    my $sigfn = "$tmp.asc";

    eval {

	if (url_get($ua, $aplsigurl, $sigfn, $logfd) != 0) {
	    die "update failed - no signature file '$sigfn'\n";
	}

	if (url_get($ua, $aplsrcurl, $tmpgz, $logfd) != 0) {
	    die "update failed - no data file '$aplsrcurl'\n";
	}
 
       eval {
           PVE::Tools::run_command(["gunzip", "-f", $tmpgz]);
       };
       die "update failed: unable to unpack '$tmpgz'\n" if $@;

	# verify signature

	my $cmd = "/usr/bin/gpg --verify --trust-model always --batch --no-tty --status-fd=1 -q " .
	    "--logger-fd=1 $sigfn $tmp";

	open(CMD, "$cmd|") ||
	    die "unable to execute '$cmd': $!\n";

	my $line;
	my $signer = '';
	while (defined($line = <CMD>)) {
	    chomp $line;
	    logmsg($logfd, $line);

	    # code borrowed from SA
	    next if $line !~ /^\Q[GNUPG:]\E (?:VALID|GOOD)SIG (\S{8,40})/;
	    my $key = $1;  

	    # we want either a keyid (8) or a fingerprint (40)
	    if (length $key > 8 && length $key < 40) {
		substr($key, 8) = '';
	    }
	    # use the longest match we can find
	    $signer = $key if (length $key > length $signer) && $valid_keys->{$key};
	}

	close(CMD);

	die "unable to verify signature\n" if !$signer;

	logmsg($logfd, "signature valid: $signer");

	# test syntax
	eval { 
	    my $fh = IO::File->new("<$tmp") ||
		die "unable to open file '$tmp' - $!\n";
	    read_aplinfo($tmp, {}, $aplurl, 1);
	    close($fh);
	};
	die "update failed: $@" if $@;

	if (!rename($tmp, "$aplinfodir/$host")) {
	    die "update failed: unable to store data\n";
	}

	logmsg($logfd, "update sucessful");
    };

    my $err = $@;

    unlink $tmp;
    unlink $tmpgz;
    unlink $sigfn;

    die $err if $err;
}

sub get_apl_sources {
 
    my $urls = [];
    push @$urls, "http://download.proxmox.com/images";
    push @$urls, "https://releases.turnkeylinux.org/pve";

    return $urls;
}

sub update {
    my ($proxy) = @_;

    my $size;
    if (($size = (-s $logfile) || 0) > (1024*50)) {
	rename($logfile, "$logfile.0");
    }
    my $logfd = IO::File->new (">>$logfile");
    logmsg($logfd, "starting update");

    import_gpg_keys();

    my $ua = LWP::UserAgent->new;
    $ua->agent("PVE/1.0");

    if ($proxy) {
	$ua->proxy(['http', 'https'], $proxy);
    } else {
	$ua->env_proxy;
    }

    my $urls = get_apl_sources();

    mkdir $aplinfodir;

    my @dlerr = ();
    foreach my $aplurl (@$urls) {
	eval { 
	    my $uri = URI->new($aplurl);
	    my $host = $uri->host();
	    download_aplinfo($ua, $aplurl, $host, $logfd); 
	};
	if (my $err = $@) {
	    logmsg ($logfd, $err);
	    push @dlerr, $aplurl; 
	}
    } 

    close($logfd);

    return 0 if scalar(@dlerr);

    return 1;
}

sub load_data {

   my $urls = get_apl_sources();

    my $list = {};

    foreach my $aplurl (@$urls) {

	eval { 

	    my $uri = URI->new($aplurl);
	    my $host = $uri->host();
	    read_aplinfo("$aplinfodir/$host", $list, $aplurl);
	};
	warn $@ if $@;
    }

    return $list;
}

1;

