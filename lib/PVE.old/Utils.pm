package PVE::Utils;

use strict;
use POSIX qw (:sys_wait_h strftime);
use PVE::pvecfg;
use IPC::Open3;
use IO::File;
use IO::Select;
use PVE::SafeSyslog;
use Authen::PAM qw(:constants);
use Time::HiRes qw (gettimeofday);
use Digest::SHA1;
use Encode;

my $clock_ticks = POSIX::sysconf(&POSIX::_SC_CLK_TCK);

# access control

my $accmode = {
    root     => [[ '/', 'w' ]],
    audit    => [[ '/', 'r' ]],
};

my $accmode_cnode = {
    root    => [[ '/server/' , 'w' ],
               [ '/logs/',  'w' ],
               [ '/system/options.htm', 'r' ],
               [ '/system/', 'w' ],
               [ '/', 'r' ],
               ],
    audit    => [[ '/', 'r' ]],
};

sub get_access_mode {
    my ($username, $group, $uri, $role) = @_;
    
    my $alist;
    if ($role eq 'N') {
	$alist = $accmode_cnode->{$group};
    } else {
	$alist = $accmode->{$group};
    }
    return undef if !$alist;

    foreach my $am (@$alist) {
	my ($d, $m) = @$am;
	return $m if $uri =~ m/^$d/;
    }

    return undef;
}

# authentication tickets

sub load_auth_secret {
    my $secret = (split (/\s/, `md5sum /etc/pve/pve-root-ca.key`))[0];

    die "unable to load authentication secret\n" if !$secret;

    return $secret;
}

sub create_auth_ticket {
    my ($secret, $username, $group) = @_;

    my $timestamp = time();
    my $ticket = $username . '::' . $group . '::' . $timestamp . '::' . 
	Digest::SHA1::sha1_hex($username, $group, $timestamp, $secret);

    return $ticket;
}

sub verify_username {
    my $username = shift;

    # we only allow a limited set of characters (colon is not allowed,
    # because we store usernames in colon separated lists)!
    return $username if $username =~ m/^[A-Za-z0-9\.\-_]+(\@[A-Za-z0-9\.\-_]+)?$/;

    return undef;
}

sub verify_ticket {
    my ($secret, $ticket) = @_;

    my $cookie_timeout = 2400; # seconds

    my ($username, $group, $time, $mac) = split /::/, $ticket;

    return undef if !verify_username($username);

    my $age = time() - $time;

    if (($age > -300) && ($age < $cookie_timeout) && 
	(Digest::SHA1::sha1_hex($username, $group, $time, $secret) eq $mac)) {
	return wantarray ? ($username, $group, $age) : $username;
    }

    return undef;
}

sub verify_web_ticket {
    my ($secret, $ticket) = @_;

    my $cookie_timeout = 2400; # seconds

    my ($username, $group, $time, $mac, $webmac) = split /::/, $ticket;

    return undef if !verify_username($username);

    my $age = time() - $time;

    if (($age > -300) && ($age < $cookie_timeout) && 
	(Digest::SHA1::sha1_hex($username, $group, $time, $mac, $secret) eq $webmac)) {
	return wantarray ? ($username, $group, $age) : $username;
    }

    return undef;
}

# password should be utf8 encoded
sub pam_is_valid_user {
    my ($username, $password) = @_;

    # user (www-data) need to be able to read /etc/passwd /etc/shadow

    my $pamh = new Authen::PAM ('common-auth', $username, sub {
	my @res;
	while(@_) {
	    my $msg_type = shift;
	    my $msg = shift;
	    push @res, (0, $password);
	}
	push @res, 0;
	return @res;
    });

    if (!ref ($pamh)) {
	my $err = $pamh->pam_strerror($pamh);
	die "Error during PAM init: $err";
    }

    my $res;

    if (($res = $pamh->pam_authenticate(0)) != PAM_SUCCESS) {
	my $err = $pamh->pam_strerror($res);
	die "PAM auth failed: $err\n";
    }

    if (($res = $pamh->pam_acct_mgmt (0)) != PAM_SUCCESS) {
	my $err = $pamh->pam_strerror($res);
	die "PAM auth failed: $err\n";
    }

    $pamh = 0; # call destructor

    return 1;
}

sub is_valid_user {
    my ($username, $password) = @_;

    if (!verify_username ($username)) {
	syslog ('info', "auth failed: invalid characters in username '$username'");
	return undef;	
    }

    my $valid = 0;

    eval {
	$valid = pam_is_valid_user ($username, $password);
    };
    my $err = $@;

    if ($err) {
	syslog ('info', $err);
	return undef;
    }

    return undef if !$valid;

    my ($name, $passwd, $uid, $gid) = getpwnam ($username);
    my $groupname = getgrgid($gid) || 'nogroup';

    # fixme: what groups are allowed?
    if ($groupname ne 'root') {
	syslog ('info', "auth failed: group '$groupname' is not in the list of allowed groups");
	return undef;
    }

    return $groupname;
}

# UPID helper
# WARN: $res->{filename} must not depend on PID, because we 
# use it before we know the PID

sub upid_decode {
    my $upid = shift;

    my $res;

    # "UPID:$pid:$start:$type:$data"
    if ($upid =~ m/^UPID:(\d+)(-(\d+))?:(\d+):([^:\s]+):(.*)$/) {
	$res->{pid} = $1;
	$res->{pstart} = $3 || 0;
	$res->{starttime} = $4;
	$res->{type} = $5;
	$res->{data} = $6;

	if ($res->{type} eq 'vmops') {
	    if ($res->{data} =~ m/^([^:\s]+):(\d+):(\d+):(\S+)$/) {
		$res->{command} = $1;
		$res->{cid} = $2;
		$res->{veid} = $3;
		$res->{user} = $4;

		$res->{filename} = "/tmp/vmops-$res->{veid}.out";
	    } else {
		return undef;
	    }
	} elsif ($res->{type} eq 'apldownload') {
	    if ($res->{data} =~ m/^([^:\s]+):(.+)$/) {
		$res->{user} = $1;
		$res->{apl} = $2;
		$res->{filename} = "/tmp/apldownload-$res->{user}.out";
	    } else {
		return undef;
	    }		
	}
    }

    return $res;
}

sub upid_encode {
    my $uip_hash = shift;

    my $d = $uip_hash; # shortcut

    return "UPID:$d->{pid}-$d->{pstart}:$d->{starttime}:$d->{type}:$d->{data}";
}


# save $SIG{CHLD} handler implementation.
# simply set $SIG{CHLD} = &PVE::Utils::worker_reaper;
# and register forked processes with PVE::Utils::register_worker(pid)
# Note: using $SIG{CHLD} = 'IGNORE' or $SIG{CHLD} = sub { wait (); } or ...
# has serious side effects, because perls built in system() and open()
# functions can't get the correct exit status of a child. So we cant use 
# that (also see perlipc)

my $WORKER_PIDS;

sub worker_reaper {
    local $!; local $?;    
    foreach my $pid (keys %$WORKER_PIDS) {
        my $waitpid = waitpid ($pid, WNOHANG);
        if (defined($waitpid) && ($waitpid == $pid)) {
            delete ($WORKER_PIDS->{$pid});
	}
    }
}

sub register_worker {
    my $pid = shift;

    return if !$pid;

    # do not register if already finished
    my $waitpid = waitpid ($pid, WNOHANG);
    if (defined($waitpid) && ($waitpid == $pid)) {
	delete ($WORKER_PIDS->{$pid});
	return;
    }

    $WORKER_PIDS->{$pid} = 1;
}

sub trim {
    my $s = shift;

    return $s if !$s;

    $s =~ s/^\s*//;
    $s =~ s/\s*$//;

    return $s;
}

sub foreach_vmrec {
    my ($vmhash, $func) = @_;

    foreach my $ckey (keys %$vmhash) {
	next if $ckey !~ m/^CID_(\d+)$/;
	my $cid = $1;
	if (my $vmlist = $vmhash->{$ckey}) {
	    foreach my $vmkey (sort keys %$vmlist) {
		next if $vmkey !~ m/^VEID_(\d+)$/;
		my $vmid = $1;
		my $d = $vmlist->{$vmkey};
		&$func ($cid, $vmid, $d, $ckey, $vmkey);
	    }
	}
    }
}

sub foreach_cid {
    my ($vmhash, $func) = @_;

    foreach my $ckey (keys %$vmhash) {
	next if $ckey !~ m/^CID_(\d+)$/;
	my $cid = $1;
	if (my $vmlist = $vmhash->{$ckey}) {
	    &$func ($cid, $vmlist, $ckey);
	}
    }
}

sub foreach_veid {
    my ($vmlist, $func) = @_;

    foreach my $vmkey (keys %$vmlist) {
	next if $vmkey !~ m/^VEID_(\d+)$/;
	my $veid = $1;
	if (my $d = $vmlist->{$vmkey}) {
	    &$func ($veid, $d, $vmkey);
	}
    }
}

sub foreach_veid_sorted {
    my ($vmlist, $func) = @_;

    my @vma = ();
    foreach my $vmkey (keys %$vmlist) {
	next if $vmkey !~ m/^VEID_(\d+)$/;
	push @vma, $1;
    }

    foreach my $vmid (sort @vma) {
	my $vmkey = "VEID_$vmid";
	if (my $d = $vmlist->{$vmkey}) {
	    &$func ($vmid, $d, $vmkey);
	}
    }
}

sub read_proc_uptime {
    my $ticks = shift;

    my $uptime;
    my $fh = IO::File->new ("/proc/uptime", "r");
    if (defined ($fh)) {
	my $line = <$fh>;
	$fh->close;

	if ($line =~ m|^(\d+\.\d+)\s+(\d+\.\d+)\s*$|) {
	    if ($ticks) {
		return (int($1*100), int($2*100));
	    } else {
		return (int($1), int($2));
	    }
	}
    }

    return (0, 0);
}

sub read_proc_starttime {
    my $pid = shift;

    my $statstr;
    my $fh = IO::File->new ("/proc/$pid/stat", "r");
    if (defined ($fh)) {
	$statstr = <$fh>;
	$fh->close;
    }

    if ($statstr =~ m/^$pid \(.*\) \S (-?\d+) -?\d+ -?\d+ -?\d+ -?\d+ \d+ \d+ \d+ \d+ \d+ (\d+) (\d+) (-?\d+) (-?\d+) -?\d+ -?\d+ -?\d+ 0 (\d+) (\d+) (-?\d+) \d+ \d+ \d+ \d+ \d+ \d+ \d+ \d+ \d+ \d+ \d+ \d+ \d+ -?\d+ -?\d+ \d+ \d+ \d+/) {
	my $ppid = $1;
	my $starttime = $6;

	return $starttime;
    }

    return 0;
}

sub check_process {
    my ($pid, $pstart) = @_;

    my $st = read_proc_starttime ($pid);

    return 0 if !$st;

    return $st == $pstart; 
}

my $last_proc_stat;

sub read_proc_stat {
    my $uptime;

    my $res = { user => 0, nice => 0, system => 0, idle => 0 , sum => 0};

    my $cpucount = 0;

    if (my $fh = IO::File->new ("/proc/stat", "r")) {
	while (defined (my $line = <$fh>)) {
	    if ($line =~ m|^cpu\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s|) {
		$res->{user} = $1;
		$res->{nice} = $2;
		$res->{system} = $3;
		$res->{idle} = $4;
		$res->{used} = $1+$2+$3;
		$res->{iowait} = $5;
	    } elsif ($line =~ m|^cpu\d+\s|) {
		$cpucount++;
	    }
	}
	$fh->close;
    }

    $cpucount = 1 if !$cpucount;

    my $ctime = gettimeofday; # floating point time in seconds

    $res->{ctime} = $ctime;
    $res->{cpu} = 0;
    $res->{wait} = 0;

    $last_proc_stat = $res if !$last_proc_stat;

    my $diff = ($ctime - $last_proc_stat->{ctime}) * $clock_ticks * $cpucount;

    if ($diff > 1000) { # don't update too often
	my $useddiff =  $res->{used} - $last_proc_stat->{used};
	$useddiff = $diff if $useddiff > $diff;
	$res->{cpu} = $useddiff/$diff;
	my $waitdiff =  $res->{iowait} - $last_proc_stat->{iowait};
	$waitdiff = $diff if $waitdiff > $diff;
	$res->{wait} = $waitdiff/$diff;
	$last_proc_stat = $res;
    } else {
	$res->{cpu} = $last_proc_stat->{cpu};
	$res->{wait} = $last_proc_stat->{wait};
    }

    return $res;
}

sub get_uptime {

    my $res = { uptime => 0, idle => 0, avg1 => 0, avg5 => 0, avg15 => 0 };

    my $fh = IO::File->new ('/proc/loadavg', "r");
    my $line = <$fh>;
    $fh->close;

    if ($line =~ m|^(\d+\.\d+)\s+(\d+\.\d+)\s+(\d+\.\d+)\s+\d+/\d+\s+\d+\s*$|) {
	$res->{avg1} = $1;
	$res->{avg5} = $2;
	$res->{avg15} = $3;
    }

    ($res->{uptime}, $res->{idle}) = read_proc_uptime();

    my $ut = $res->{uptime};
    my $days = int ($ut / 86400);
    $ut -= $days*86400;
    my $hours = int ($ut / 3600);
    $ut -= $hours*3600;
    my $mins = $ut /60;

    my $utstr = strftime ("%H:%M:%S up ", localtime);
    if ($days) {
	my $ds = $days > 1 ? 'days' : 'day';
	$res->{uptimestrshort} = sprintf "%d $ds %02d:%02d", $days, $hours, $mins;
    } else {
	$res->{uptimestrshort} = sprintf "%02d:%02d", $hours, $mins;
    }
   
    $utstr .= "$res->{uptimestrshort}, ";
    $utstr .= "load average: $res->{avg1}, $res->{avg5}, $res->{avg15}";
    $res->{uptimestr} = $utstr;

    return $res;
}


# memory usage of current process
sub get_mem_usage {

    my $res = { size => 0, resident => 0, shared => 0 };

    my $ps = 4096;

    open (MEMINFO, "</proc/$$/statm");
    my $line = <MEMINFO>;
    close (MEMINFO);

    if ($line =~ m/^(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+/) {
	$res->{size} = $1*$ps;
	$res->{resident} = $2*$ps;
	$res->{shared} = $3*$ps;
    }

    return $res;
}

sub get_memory_info {

    my $res = {
	memtotal => 0,
	memfree => 0,
	memused => 0,
	swaptotal => 0,
	swapfree => 0,
	swapused => 0,
    };

    open (MEMINFO, "/proc/meminfo");

    while (my $line = <MEMINFO>) {
	if ($line =~ m/^(\S+):\s+(\d+)\s*kB/i) {
	    $res->{lc ($1)} = $2;
	} 
    }

    close (MEMINFO);

    $res->{memused} = $res->{memtotal} - $res->{memfree};
    $res->{swapused} = $res->{swaptotal} - $res->{swapfree};

    $res->{mbmemtotal} = int ($res->{memtotal}/1024);
    $res->{mbmemfree} = int (($res->{memfree} + $res->{buffers} + $res->{cached})/1024);
    $res->{mbmemused} = $res->{mbmemtotal} - $res->{mbmemfree};

    $res->{mbswaptotal} = int ($res->{swaptotal}/1024);
    $res->{mbswapfree} = int ($res->{swapfree}/1024);
    $res->{mbswapused} = $res->{mbswaptotal} - $res->{mbswapfree};

    return $res;
}

sub get_hd_info {
    my ($dir) = @_;

    $dir = '/' if !$dir;

    my $hd = `df -P '$dir'`;

    # simfs ... openvz
    # vzfs  ... virtuozzo

    my ($rootfs, $hdo_total, $hdo_used, $hdo_avail) = $hd =~
	m/^(simfs|vzfs|\/dev\/\S+)\s+(\d+)\s+(\d+)\s+(\d+)\s+\d+%\s.*$/mg;

    my $real_hd_used = int ($hdo_used/1024);
    my $real_hd_total = int ($hdo_total/1024);

    # available memory =  total memory - reserved memory
    my $real_hd_avail = int (($hdo_used+$hdo_avail)/1024);

    return { total => $real_hd_total, 
	     avail => $real_hd_avail, 
	     used => $real_hd_used, 
	     free => $real_hd_avail - $real_hd_used 
	     };
}

my $cpuinfo;

# cycles_per_jiffy = frequency_of_your_cpu/jiffies_per_second
# jiffies_per_second = 1000

# frequency_of_your_cpu can be read from /proc/cpuinfo, as:
# cpu MHz : <frequency_of_your_cpu>

sub get_cpu_info {
    my $fn = '/proc/cpuinfo';

    return $cpuinfo if $cpuinfo;

    open (CPUINFO, "<$fn");

    my $res;

    $res->{model} = 'unknown';
    $res->{mhz} = 0;
    $res->{cpus} = 0;
    $res->{cpu_cycles_per_jiffy} = 0; # just to be not 0

    #$cpu_total = 0;

    my $count = 0;
    while (my $line = <CPUINFO>) {
	if ($line =~ m/^processor\s*:\s*\d+\s*$/i) {
	    $count++;
	} elsif ($line =~ m/^model\s+name\s*:\s*(.*)\s*$/i) {
	    $res->{model} = $1 if $res->{model} eq 'unknown';
	} elsif ($line =~ m/^cpu\s+MHz\s*:\s*(\d+\.\d+)\s*$/i) {
	    #$cpu_total += $1;
	    $res->{mhz} = $1 if !$res->{mhz};
	    $res->{cpu_cycles_per_jiffy} += $1 * 1000;
	} elsif ($line =~ m/^flags\s*:.*(vmx|svm)/) {
	    $res->{hvm} = 1; # Hardware Virtual Machine (Intel VT / AMD-V)
	}
    }

    $res->{cpus} = $count;

    close (CPUINFO);

    $res->{kversion} = `uname -srv`;

    $res->{proxversion} = PVE::pvecfg::package() . "/" .
	PVE::pvecfg::version() . "/" .
	PVE::pvecfg::repoid();
    
    $cpuinfo = $res;

    return $res;
}

sub get_bridges {

    my $res = [];

    my $line;
    my $fd2;

    if ($fd2 = IO::File->new ("/proc/net/dev", "r")) {
	while (defined ($line = <$fd2>)) {
	    chomp ($line);
	    if ($line =~ m/^\s*(vmbr([0-9]{1,3})):.*/) {
		my ($name, $num) = ($1, $2);
		push @$res, $name if int($num) eq $num; # no leading zero
	    }
	}
	close ($fd2);
    }

    return $res;
}

sub run_command {
    my ($cmd, $input, $timeout) = @_;

    my $reader = IO::File->new();
    my $writer = IO::File->new();
    my $error  = IO::File->new();

    my $cmdstr = join (' ', @$cmd);

    my $orig_pid = $$;

    my $pid;
    eval {
	$pid = open3 ($writer, $reader, $error, @$cmd) || die $!;
    };

    my $err = $@;

    # catch exec errors
    if ($orig_pid != $$) {
	syslog ('err', "ERROR: $err");
	POSIX::_exit (1); 
	kill ('KILL', $$); 
    }

    die $err if $err;

    print $writer $input if defined $input;
    close $writer;

    my $select = new IO::Select;
    $select->add ($reader);
    $select->add ($error);

    my ($ostream, $estream) = ('', '');

    while ($select->count) {
	my @handles = $select->can_read ($timeout);

	if (defined ($timeout) && (scalar (@handles) == 0)) {
	    kill (9, $pid);
	    waitpid ($pid, 0);
	    die "command '$cmdstr' failed: timeout";
	}

	foreach my $h (@handles) {
	    my $buf = '';
	    my $count = sysread ($h, $buf, 4096);
	    if (!defined ($count)) {
		my $err = $!;
		kill (9, $pid);
		waitpid ($pid, 0);
		die "command '$cmdstr' failed: $err";
	    }
	    $select->remove ($h) if !$count;
	    if ($h eq $reader) {
		$ostream .= $buf;
	    } elsif ($h eq $error) {
		$ostream .= $buf;
		$estream .= $buf;
	    }
	}
    }

    my $rv = waitpid ($pid, 0);
    my $ec = ($? >> 8);

    if ($ec) {  
	if ($estream) {
	    die "command '$cmdstr' failed with exit code $ec:\n$estream";
	} 
	die "command '$cmdstr' failed with exit code $ec";
    }

    return $ostream;
}

sub _encrypt_pw {
    my ($pw) = @_;

    my $time = substr (Digest::SHA1::sha1_base64 (time), 0, 8);
    return crypt (encode("utf8", $pw), "\$1\$$time\$");
}

sub modify_user {
    my ($username, $group, $pw, $comment, $rawpw) = @_;

    my $cmd = ['/usr/sbin/usermod'];

    push @$cmd, '-c', $comment if defined ($comment);

    if ($pw) {
	my $epw = $rawpw ? $pw :_encrypt_pw ($pw);
	push @$cmd, '-p', $epw;
    }

    push @$cmd, '-g', $group if $group && $username ne 'root';

    return if scalar (@$cmd) == 1 ; # no flags given

    push @$cmd, $username;

    run_command ($cmd);
}

sub kvmkeymaps {
    return {
	'dk'     => ['Danish', 'da', 'qwerty/dk-latin1.kmap.gz', 'dk', 'nodeadkeys'],
	'de'     => ['German', 'de', 'qwertz/de-latin1-nodeadkeys.kmap.gz', 'de', 'nodeadkeys' ],
	'de-ch'  => ['Swiss-German', 'de-ch', 'qwertz/sg-latin1.kmap.gz',  'ch', 'de_nodeadkeys' ], 
	'en-gb'  => ['United Kingdom', 'en-gb', 'qwerty/uk.kmap.gz' , 'gb', 'intl' ],
	'en-us'  => ['U.S. English', 'en-us', 'qwerty/us-latin1.kmap.gz',  'us', 'intl' ],
	'es'     => ['Spanish', 'es', 'qwerty/es.kmap.gz', 'es', 'nodeadkeys'],
	#'et'     => [], # Ethopia or Estonia ??
	'fi'     => ['Finnish', 'fi', 'qwerty/fi-latin1.kmap.gz', 'fi', 'nodeadkeys'],
	#'fo'     => ['Faroe Islands', 'fo', ???, 'fo', 'nodeadkeys'],
	'fr'     => ['French', 'fr', 'azerty/fr-latin1.kmap.gz', 'fr', 'nodeadkeys'],
	'fr-be'  => ['Belgium-French', 'fr-be', 'azerty/be2-latin1.kmap.gz', 'be', 'nodeadkeys'],
	'fr-ca'  => ['Canada-French', 'fr-ca', 'qwerty/cf.kmap.gz', 'ca', 'fr-legacy'],
	'fr-ch'  => ['Swiss-French', 'fr-ch', 'qwertz/fr_CH-latin1.kmap.gz', 'ch', 'fr_nodeadkeys'],
	#'hr'     => ['Croatia', 'hr', 'qwertz/croat.kmap.gz', 'hr', ??], # latin2?
	'hu'     => ['Hungarian', 'hu', 'qwertz/hu.kmap.gz', 'hu', undef],
	'is'     => ['Icelandic', 'is', 'qwerty/is-latin1.kmap.gz', 'is', 'nodeadkeys'],
	'it'     => ['Italian', 'it', 'qwerty/it2.kmap.gz', 'it', 'nodeadkeys'],
	'jp'     => ['Japanese', 'ja', 'qwerty/jp106.kmap.gz', 'jp', undef],
	'lt'     => ['Lithuanian', 'lt', 'qwerty/lt.kmap.gz', 'lt', 'std'],
	#'lv'     => ['Latvian', 'lv', 'qwerty/lv-latin4.kmap.gz', 'lv', ??], # latin4 or latin7?
	'mk'     => ['Macedonian', 'mk', 'qwerty/mk.kmap.gz', 'mk', 'nodeadkeys'],
	'nl'     => ['Dutch', 'nl', 'qwerty/nl.kmap.gz', 'nl', undef],
	#'nl-be'  => ['Belgium-Dutch', 'nl-be', ?, ?, ?],
	'no'   => ['Norwegian', 'no', 'qwerty/no-latin1.kmap.gz', 'no', 'nodeadkeys'], 
	'pl'     => ['Polish', 'pl', 'qwerty/pl.kmap.gz', 'pl', undef],
	'pt'     => ['Portuguese', 'pt', 'qwerty/pt-latin1.kmap.gz', 'pt', 'nodeadkeys'],
	'pt-br'  => ['Brazil-Portuguese', 'pt-br', 'qwerty/br-latin1.kmap.gz', 'br', 'nodeadkeys'],
	#'ru'     => ['Russian', 'ru', 'qwerty/ru.kmap.gz', 'ru', undef], # dont know?
	'si'     => ['Slovenian', 'sl', 'qwertz/slovene.kmap.gz', 'si', undef],
	#'sv'     => [], Swedish ?
	#'th'     => [],
	#'tr'     => [],
    };
}

sub debmirrors {

    return {
	'at' => 'ftp.at.debian.org',
	'au' => 'ftp.au.debian.org',
	'be' => 'ftp.be.debian.org',
	'bg' => 'ftp.bg.debian.org',
	'br' => 'ftp.br.debian.org',
	'ca' => 'ftp.ca.debian.org',
	'ch' => 'ftp.ch.debian.org',
	'cl' => 'ftp.cl.debian.org',
	'cz' => 'ftp.cz.debian.org',
	'de' => 'ftp.de.debian.org',
	'dk' => 'ftp.dk.debian.org',
	'ee' => 'ftp.ee.debian.org',
	'es' => 'ftp.es.debian.org',
	'fi' => 'ftp.fi.debian.org',
	'fr' => 'ftp.fr.debian.org',
	'gr' => 'ftp.gr.debian.org',
	'hk' => 'ftp.hk.debian.org',
	'hr' => 'ftp.hr.debian.org',
	'hu' => 'ftp.hu.debian.org',
	'ie' => 'ftp.ie.debian.org',
	'is' => 'ftp.is.debian.org',
	'it' => 'ftp.it.debian.org',
	'jp' => 'ftp.jp.debian.org',
	'kr' => 'ftp.kr.debian.org',
	'mx' => 'ftp.mx.debian.org',
	'nl' => 'ftp.nl.debian.org',
	'no' => 'ftp.no.debian.org',
	'nz' => 'ftp.nz.debian.org',
	'pl' => 'ftp.pl.debian.org',
	'pt' => 'ftp.pt.debian.org',
	'ro' => 'ftp.ro.debian.org',
	'ru' => 'ftp.ru.debian.org',
	'se' => 'ftp.se.debian.org',
	'si' => 'ftp.si.debian.org',
	'sk' => 'ftp.sk.debian.org',
	'tr' => 'ftp.tr.debian.org',
	'tw' => 'ftp.tw.debian.org',
	'gb' => 'ftp.uk.debian.org',
	'us' => 'ftp.us.debian.org',
    };
}

sub shellquote {
    my $str = shift;

    return "''" if !defined ($str) || ($str eq '');
    
    die "unable to quote string containing null (\\000) bytes"
	if $str =~ m/\x00/;

    # from String::ShellQuote
    if ($str =~ m|[^\w!%+,\-./:@^]|) {

	# ' -> '\''
	$str =~ s/'/'\\''/g;

	$str = "'$str'";
	$str =~ s/^''//;
	$str =~ s/''$//;
    }

    return $str;
}

sub service_cmd {
    my ($service, $cmd) = @_;

    my $initd_cmd;

    ($cmd eq 'start' || $cmd eq 'stop' || $cmd eq 'restart' 
     || $cmd eq 'reload' || $cmd eq 'awaken') ||
     die "unknown service command '$cmd': ERROR";
	
    if ($service eq 'postfix') {
	$initd_cmd = '/etc/init.d/postfix';
    } elsif ($service eq 'pvemirror') {
	$initd_cmd = '/etc/init.d/pvemirror';
    } elsif ($service eq 'pvetunnel') {
	$initd_cmd = '/etc/init.d/pvetunnel';
    } elsif ($service eq 'pvedaemon') {
	$initd_cmd = '/etc/init.d/pvedaemon';
    } elsif  ($service eq 'apache') {
	if ($cmd eq 'restart') {    
	    $initd_cmd = '/usr/sbin/apache2ctl';
	    $cmd = 'graceful';
	} else {
	    die "invalid service cmd 'apache $cmd': ERROR";
	}
    } elsif  ($service eq 'network') {
	if ($cmd eq 'restart') {
	    return system ('(sleep 1; /etc/init.d/networking restart; /etc/init.d/postfix restart; /usr/sbin/apache2ctl graceful)&');
	} 
	die "invalid service cmd 'network $cmd': ERROR";
    } elsif  ($service eq 'ntpd') {
	# debian start/stop scripts does not work for us
	if ($cmd eq 'stop') {
	    system ('/etc/init.d/ntp stop');
	    #system ('/usr/bin/killall /usr/sbin/ntpd'); 
	} elsif ($cmd eq 'start') {
	    system ('/etc/init.d/ntp start');
	    system ('/sbin/hwclock --systohc');
	} elsif ($cmd eq 'restart') {
	    system ('/etc/init.d/ntp restart');
	    system ('/sbin/hwclock --systohc');
	    # restart cron/syslog to get right schedules and log time/dates
	    system ('/etc/init.d/sysklogd restart');
	    system ('/etc/init.d/cron restart');
	}
	return 0;
    } elsif  ($service eq 'syslog') {
	$initd_cmd = '/etc/init.d/sysklogd';
    } elsif  ($service eq 'cron') {
	$initd_cmd = '/etc/init.d/cron';
    } elsif  ($service eq 'sshd') {
	$initd_cmd = '/etc/init.d/ssh';
    } else {
	die "unknown service '$service': ERROR";
    }    

    my $servicecmd = "$initd_cmd $cmd";

    my $res = run_command ([$initd_cmd, $cmd]);

    return $res;
}

sub service_state { 
    my ($service) = @_;

    my $pid_file;

    if ($service eq 'postfix') {
	$pid_file = '/var/spool/postfix/pid/master.pid';
    } elsif  ($service eq 'apache') {
	$pid_file = '/var/run/apache2.pid';
    } elsif  ($service eq 'bind') {
	$pid_file = '/var/run/bind/run/named.pid';
    } elsif  ($service eq 'pvemirror') {
	$pid_file = '/var/run/pvemirror.pid';
    } elsif  ($service eq 'pvetunnel') {
	$pid_file = '/var/run/pvetunnel.pid';
    } elsif  ($service eq 'pvedaemon') {
	$pid_file = '/var/run/pvedaemon.pid';
    } elsif  ($service eq 'ntpd') {
	$pid_file = '/var/run/ntpd.pid';
    } elsif  ($service eq 'sshd') {
	$pid_file = '/var/run/sshd.pid';
    } else {
	die "unknown service '$service': ERROR";
    }    

    my $pid;
    if (my $fh = IO::File->new ($pid_file, "r")) {
	my $line = <$fh>;
	chomp $line;
	    
	if ($line  && ($line =~ m/^\s*(\d+)\s*$/)) {
	    $pid = $1;
	}
    }

    return 'running' if ($pid && kill (0, $pid));

    return 'stopped';
};

sub service_wait_stopped {
    my ($timeout, @services) = @_;
    
    my $starttime = time();

    while (1) {
	my $wait = 0;
 
	foreach my $s (@services) {
	    if (service_state ($s) eq 'running') {

		if ((time() - $starttime) > $timeout) {
		    die "unable to stop services (got timeout)\n";
		}

		service_cmd ($s, 'stop');
		$wait = 1;
	    }
	}

	if ($wait) {
	    sleep (1);
	} else {
	    last;
	}
    }
}

sub check_vm_settings {
    my ($settings) = @_;

    if (defined ($settings->{mem})) {

	my $max = 65536;
	my $min = 64;

	if ($settings->{mem} < $min) {
	    die __("Memory needs to be at least $min MB") . "\n";
	}
	if ($settings->{mem} > $max) {
	    die __("Memory needs to be less than $max MB") . "\n";
	}
    }

    if (defined ($settings->{swap})) {

	my $max = 65536;
	
	if ($settings->{swap} > $max) {
	    die __("Swap needs to be less than $max MB") . "\n";
	}
    }

    if (defined ($settings->{cpuunits}) && 
	($settings->{cpuunits} < 8 || $settings->{cpuunits} > 500000)) {
	die "parameter cpuunits out of range\n";
    }

    if (defined ($settings->{cpus}) && 
	($settings->{cpus} < 1 || $settings->{cpus} > 16)) {
	die "parameter cpus out of range\n";
    }
} 

1;

