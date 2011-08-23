package PVE::APLInfo;

use strict;
use IO::File;
use PVE::SafeSyslog;
use PVE::I18N;
use LWP::UserAgent;
use PVE::Config;
use POSIX qw(strftime);

my $logfile = "/var/log/pveam.log";

# Default list of GPG keys allowed to sign aplinfo
#
#pub   1024D/5CAC72FE 2004-06-24
#      Key fingerprint = 9ABD 7E02 AD24 3AD3 C2FB  BCCC B0C1 CC22 5CAC 72FE
#uid                  Proxmox Support Team <support@proxmox.com>

my $valid_keys = {
    '9ABD7E02AD243AD3C2FBBCCCB0C1CC225CAC72FE' => 1, # fingerprint support@proxmox.com
    '25CAC72FE' => 1,                                # keyid support@proxmox.com
};

sub import_gpg_keys {

    my $keyfile = '/usr/share/doc/pve-manager/support@proxmox.com.pubkey';

    return system ("/usr/bin/gpg --batch --no-tty --status-fd=1 -q " .
		   "--logger-fd=1 --import $keyfile >>$logfile");
}

sub logmsg {
    my ($logfd, $msg) = @_;

    chomp $msg;

    my $tstr = strftime ("%b %d %H:%M:%S", localtime);

    foreach my $line (split (/\n/, $msg)) {
	print $logfd "$tstr $line\n";
    }
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

sub update {
    my ($proxy) = @_;

    my $aplurl = "http://download.proxmox.com/appliances";
    my $aplsrcurl = "$aplurl/aplinfo.dat.gz";
    my $aplsigurl = "$aplurl/aplinfo.dat.asc";

    my $size;
    if (($size = (-s $logfile) || 0) > (1024*50)) {
	system ("mv $logfile $logfile.0");
    }
    my $logfd = IO::File->new (">>$logfile");
    logmsg ($logfd, "starting update");

    import_gpg_keys();

    my $tmp = "/tmp/pveam.tmp.$$";
    my $tmpgz = "$tmp.gz";
    my $sigfn = "$tmp.asc";

    # this code works for ftp and http
    # always use passive ftp
    local $ENV{FTP_PASSIVE} = 1;
    my $ua = LWP::UserAgent->new;
    $ua->agent("PVE/1.0");

    if ($proxy) {
	$ua->proxy(['http'], $proxy);
    } else {
	$ua->env_proxy;
    }

    eval {
	if (url_get ($ua, $aplsigurl, $sigfn, $logfd) != 0) {
	    die "update failed - no signature\n";
	}

	if (url_get ($ua, $aplsrcurl, $tmpgz, $logfd) != 0) {
	    die "update failed - no data\n";
	}
 
	if (system ("zcat -f $tmpgz >$tmp 2>/dev/null") != 0) {
	    die "update failed: unable to unpack '$tmpgz'\n";
	} 

	# verify signature

	my $cmd = "/usr/bin/gpg --verify --batch --no-tty --status-fd=1 -q " .
	    "--logger-fd=1 $sigfn $tmp";

	open (CMD, "$cmd|") ||
	    die "unable to execute '$cmd': $!\n";

	my $line;
	my $signer = '';
	while (defined ($line = <CMD>)) {
	    chomp $line;
	    logmsg ($logfd, $line);

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

	close (CMD);

	die "unable to verify signature\n" if !$signer;

	logmsg ($logfd, "signature valid: $signer");

	# test syntax
	eval { 
	    my $fh = IO::File->new ("<$tmp") ||
		die "unable to open file '$tmp' - $!\n";
	    PVE::Config::read_aplinfo ($tmp, $fh, 1);
	    close ($fh);
	};
	die "update failed: $@" if $@;

	if (system ("mv $tmp /var/lib/pve-manager/apl-available 2>/dev/null") != 0) { 
	    die "update failed: unable to store data\n";
	}

	logmsg ($logfd, "update sucessful");
    };

    my $err = $@;

    unlink $tmp;
    unlink $tmpgz;
    unlink $sigfn;

    if ($err) {
	logmsg ($logfd, $err);
	close ($logfd);

	return 0;
    } 

    close ($logfd);

    return 1;
}

sub load_data {

    my $filename = "/var/lib/pve-manager/apl-available";

    if (! -f $filename) {
	system ("cp /usr/share/doc/pve-manager/aplinfo.dat /var/lib/pve-manager/apl-available");
    }

    return PVE::Config::read_file ('aplinfo');
}

sub display_name {
    my ($template) = @_;

    my $templates = load_data ();

    return $template if !$templates;

    my $d =  $templates->{'all'}->{$template};

    $template =~ s/\.tar\.gz$//;
    $template =~ s/_i386$//;

    return $template if !$d;

    return "$d->{package}_$d->{version}";
}

sub pkginfo {
    my ($template) = @_;

    my $templates = load_data ();

    return undef if !$templates;

    my $d =  $templates->{'all'}->{$template};

    return $d;
}

sub webnews {
    my ($lang) = @_;

    my $templates = load_data ();

    my $html = '';

    $html .= __("<b>Welcome</b> to the Proxmox Virtual Environment!");
    $html .= "<br><br>";
    $html .= __("For more information please visit our homepage at");
    $html .= " <a href='http://www.proxmox.com' target='_blank'>www.proxmox.com</a>.";

    return $html if !$templates;

    # my $d = $templates->{'all'}->{"pve-web-news-$lang"} ||
    my $d = $templates->{all}->{'pve-web-news'};

    return $html if !$d;

    return $d->{description};
}

1;

