package PVE::APLInfo;

use strict;
use warnings;
use IO::File;
use PVE::SafeSyslog;
use PVE::Tools;
use LWP::UserAgent;
use POSIX qw(strftime);
use PVE::pvecfg;

my $logfile = "/var/log/pveam.log";
my $aplinfodir = "/var/lib/pve-manager/apl-info";

sub logmsg {
    my ($logfd, $msg) = @_;

    chomp $msg;

    my $tstr = strftime ("%F %H:%M:%S", localtime);

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
	my $trustedkeyring = "/usr/share/doc/pve-manager/trustedkeys.gpg";
	my $cmd = "/usr/bin/gpgv -q --keyring $trustedkeyring $sigfn $tmp";

	eval {
	    my $logfunc = sub {
		my $line = shift;
		logmsg($logfd, "signature verification: $line");
	    };

	    PVE::Tools::run_command($cmd,
				    outfunc => $logfunc,
				    errfunc => $logfunc);
	};
	die "unable to verify signature - $@\n" if $@;

	# test syntax
	eval { 
	    read_aplinfo($tmp, {}, $aplurl, 1);
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

    my $ua = LWP::UserAgent->new;
    my $version = PVE::pvecfg::version();
    $ua->agent("PVE/$version");

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

