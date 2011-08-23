use PVE::SourceFilter;

package PVE::ConfigServer;

use strict;
use vars qw(@ISA);
use Carp;
use PVE::SafeSyslog;
use File::stat;
use IO::File;
use Fcntl qw(:flock);
use MIME::Base64;
use PVE::Cluster;
use PVE::Utils;
use PVE::Config;
use IO::Socket::INET;
use Digest::SHA1;
use PVE::QemuServer;
use PVE::APLInfo;
use IPC::Open2;
use PVE::OpenVZ;
use PVE::Qemu;
use PVE::Storage;

use base 'Exporter';
our @EXPORT = qw($pve_config_daemon);
our $pve_config_daemon;

my $get_userid = sub { # private method
    my ($class) = @_;

    if ($pve_config_daemon) {
	return $pve_config_daemon->{pve}->{username};
    } 
	
    die "internal error";
};

my $get_ticket = sub { # private method
    my ($class) = @_;

    if ($pve_config_daemon) {
	return $pve_config_daemon->{pve}->{ticket};
    }

    die "internal error";
};

sub alive { ##SOAP_EXPORT##
    my ($class) = @_;

    return 1;
}

sub update_ticket { ##SOAP_EXPORT##
    my ($class) = @_;

    # ticket is magically updated by the server before 
    # this function is called.
    my $ticket = $class->$get_ticket();

    return $ticket;
}

sub ping { ##SOAP_EXPORT##
    my ($class) = @_;

    my $userid = $class->$get_userid();

    my $cinfo = PVE::Cluster::clusterinfo ();

    my $status = { time => time (), insync => 1 };

    $status->{uptime} = PVE::Utils::get_uptime ();
    $status->{cpuinfo} = PVE::Utils::get_cpu_info ();
    $status->{meminfo} = PVE::Utils::get_memory_info ();   
    $status->{hdinfo}->{root} = PVE::Utils::get_hd_info ('/');   

    my $procstat = PVE::Utils::read_proc_stat();
    $status->{cpu} = $procstat->{cpu};
    $status->{wait} = $procstat->{wait};

    my $syncstatus = PVE::Config::read_file ("syncstatus");

    foreach my $ni (@{$cinfo->{nodes}}) {
	my $cid = $ni->{cid};
	next if $cinfo->{local}->{cid} == $cid; # skip local CID
	my $lastsync = defined ($syncstatus->{$cid}) ? 
	    $syncstatus->{$cid}->{lastsync} : 0;
	$status->{"lastsync_$cid"} = $lastsync;
	my $sdiff = time() - $lastsync;
	$sdiff = 0 if $sdiff < 0;
	$status->{insync} = 0 if ($sdiff > (60*3));
    }

    return $status;
}

sub vzlist { ##SOAP_EXPORT##
    my ($class) = @_;

    my $userid = $class->$get_userid();

    my $res = {};

    # openvz
    eval {
	$res = PVE::OpenVZ::vmlist();
    };

    my $err = $@;

    if ($err) {
	syslog ('err', "ERROR: $err");
    } else {
	$res->{openvz} = 1;
    }

    # qemu
    eval {

	my $qmlist = PVE::Qemu::vmlist();

	foreach my $vekey (keys %$qmlist) {
	    if (!$res->{$vekey}) {
		$res->{$vekey} = $qmlist->{$vekey};
	    } else {
		syslog ('err', "found duplicated ID '$vekey' - ignoring qemu instance\n");
	    }
	}
    };
    
    $err = $@;

    if ($err) {
	syslog ('err', "ERROR: $err");
    } else {
	$res->{qemu} = 1;
    }

    $res->{lasttime} = time();

    my $pc = PVE::Config::update_file ('pcounter', 'vzlist');
    $res->{version} = $pc->{vzlist};

    return $res;
}

sub vmlogview {  ##SOAP_EXPORT##
    my ($class, $cid, $veid, $service) = @_;

    my $userid = $class->$get_userid();

    my $filename = "/var/lib/vz/private/$veid/var/log/syslog";

    if ($service eq 'init') {
	$filename = "/var/lib/vz/private/$veid/var/log/init.log";
    } elsif ($service eq 'syslog') {
	# some systems (rh,centos) logs to messages instead
	my $msglog = "/var/lib/vz/private/$veid/var/log/messages";
	if ((! -f $filename) && (-f $msglog)) {
	    $filename = $msglog;
	}
    }

    my $lines = [];

    my $limit = 200;

    open (TMP, "tail -$limit $filename|");
    while (my $line = <TMP>) {
	chomp $line;
	push @$lines, $line;
    }
    close (TMP);

    return $lines;
}

sub vmconfig { ##SOAP_EXPORT##
    my ($class, $veid, $type) = @_;

    my $userid = $class->$get_userid();

    die "unknown virtualization type '$type'\n" if !($type eq 'openvz' || $type eq 'qemu');

    my $res;

    $res->{vzlist} = $class->vzlist();

    if (($type eq 'qemu') && !$res->{vzlist}->{qemu}) {
	die "unable to get qemu-server vm list - server not running?\n";
    }
    if (($type eq 'openvz') && !$res->{vzlist}->{openvz}) {
	die "unable to get openvz vm list?\n";
    }

    if (my $d = $res->{vzlist}->{"VEID_$veid"}) {
	die "virtualization type mismatch" if $type ne $d->{type};

	if ($d->{type} eq 'openvz') {
	    $res->{config} = PVE::Config::get_veconfig ($veid);
	} elsif ($d->{type} eq 'qemu') {
	    $res->{config} = PVE::Config::get_qmconfig  ($veid);
	} else {
	    die "internal error";
	} 
    } else {
	die "unable to get configuration data for VEID '$veid'";
    }

    return $res;
}

sub cluster_vzlist { ##SOAP_EXPORT##
    my ($class, $cid, $vzlist) = @_;

    my $userid = $class->$get_userid();

    my $newlist = PVE::Config::update_file ('vzlist', $vzlist, $cid);

    my $vmops = PVE::Config::read_file ("vmops");

    PVE::Utils::foreach_vmrec ($vmops, sub {
	my ($cid, $vmid, $d, $ckey, $vmkey) = @_;
	my $old = $newlist->{$ckey}->{$vmkey};

	# command still running ?
	my $pstart;
	if ($old && PVE::Utils::check_process ($d->{pid}, $d->{pstart})) {
 
	    $old->{status} = $d->{command};

	    if ($d->{command} eq 'migrate') {
		PVE::Utils::foreach_vmrec ($newlist, sub {
		    my ($ncid, $nvmid, $nd) = @_;
		    $nd->{status} = 'migrate' if ($nvmid eq $vmid);
		});
	    }
	}
    });

    return $newlist;
}

# start long running workers
# $data append to the returned uniquely identifier, which
# has the following format: "UPID:$pid-$pstart:$startime:$dtype:$data"
# STDIN is redirected to /dev/null
# STDOUT,STDERR are redirected to the filename returned by upid_decode
# that file is locked wit flock to make sure only one process 
# is writing it

my $fork_worker = sub { # private method
    my ($class, $dtype, $data, $function) = @_;

    my $cpid;

    $dtype = 'unknown' if !defined ($dtype);

    $data = '' if !defined ($data);

    my $starttime = time ();

    my @psync = POSIX::pipe();

    # detect filename with faked PID
    my $tmp = PVE::Utils::upid_decode ("UPID:0-0:0:$dtype:$data"); 
    my $filename = $tmp->{filename};

    my $lockfh;
    # lock output file
    if ($filename) {

	$lockfh = IO::File->new ($filename, O_WRONLY|O_CREAT) ||
	    die "unable to open output file - $!\n";

	my $wwwid = getpwnam('www-data');	    
	chown $wwwid,  $filename;

	if (!flock ($lockfh, LOCK_EX|LOCK_NB)) {
	    undef $lockfh; # close
	    die "unable to lock output file\n";
	}

	if (!truncate ($lockfh, 0)) {
	    die "unable to truncate output file - $!\n";
	}
    }

    if (($cpid = fork()) == 0) {

	$SIG{INT} = $SIG{QUIT} = $SIG{TERM} = sub { die "received interrupt\n"; };

	$SIG{CHLD} = $SIG{PIPE} = 'DEFAULT';

	# set sess/process group - we want to be able to kill the
	# whole process group
	POSIX::setsid(); 

	POSIX::close ($psync[0]);

	PVE::Config::inotify_close();

	# we close the socket 
	my $httpd = $pve_config_daemon->{_daemon};
	$httpd->close();

	# same algorythm as used inside SA

	# STDIN = /dev/null
	my $fd = fileno (STDIN);
	close STDIN;
	POSIX::close(0) if $fd != 0;

	if (!open (STDIN, "</dev/null")) {
	    POSIX::_exit (1); 
	    kill ('KILL', $$); 
	}

	# redirect STDOUT
	$fd = fileno(STDOUT);
	close STDOUT;
	POSIX::close (1) if $fd != 1;

	if ($filename) {
	    if (!open (STDOUT, ">&", $lockfh)) {
		POSIX::_exit (1); 
		kill ('KILL', $$); 
	    }

	    STDOUT->autoflush (1);
	} else {
	    if (!open (STDOUT, ">/dev/null")) {
		POSIX::_exit (1); 
		kill ('KILL', $$); 
	    }
	}
      
	#  redirect STDERR to STDOUT
	$fd = fileno (STDERR);
	close STDERR;
	POSIX::close(2) if $fd != 2;

	if (!open (STDERR, ">&1")) {
	    POSIX::_exit (1); 
	      kill ('KILL', $$); 
	  }
	
	STDERR->autoflush (1);

	my $pstart = PVE::Utils::read_proc_starttime ($$) ||
	    die "unable to read process starttime";

	my $upid = PVE::Utils::upid_encode ({
	    pid => $$, pstart => $pstart, starttime => $starttime,
	    type => $dtype, data => $data });

	# sync with parent
	POSIX::write ($psync[1], $upid, length ($upid));
	POSIX::close ($psync[1]);

	&$function ($upid);

	die "should not be reached";
    }

    POSIX::close ($psync[1]);

    # sync with child (wait until child starts)
    my $upid = '';
    POSIX::read($psync[0], $upid, 4096);
    POSIX::close ($psync[0]);

    if ($lockfh) {
	undef $lockfh; # close
    }

    my $uh = PVE::Utils::upid_decode ($upid);
    if (!$uh || 
	!($uh->{pid} == $cpid && $uh->{starttime} == $starttime &&
	  $uh->{type} eq $dtype && $uh->{data} eq $data)) {
	syslog ('err', "got strange upid - $upid\n");
    }

    PVE::Utils::register_worker ($cpid);
    
    return $upid;
};

# UPID: unique worker process descriptor
#
# general format used by fork_worker is 
# UPID:$pid-$pstart:$start:$type:$data
#
# $pid    ... process id of worker
# $pstart ... process start time from /proc/pid/stat
# $start  ... time (epoch) when process started
# $type   ... string to identity format of $data
# $data   ... arbitrary text
#
# speicalized format we use is 
# UPID:$pid-$pstart:$start:vmops:$command:$cid:$veid
#
# $command    ... create, start, stop, destroy
# $cid,$veid  ... cluster identity of VE 
#
# Note: PIDs are recycled, so to test if a process is still running
# we use (PID,PSTART) pair.

my $vmcommand = sub { # private method
    my ($class, $userid, $command, $cid, $veid, $code) = @_;

    my $remip;
    my $remcmd = [];

    $userid = 'unknown' if !$userid;

    my $cinfo = PVE::Cluster::clusterinfo ();

    if ($cid != $cinfo->{local}->{cid}) {
	$remip = $cinfo->{"CID_$cid"}->{ip};
	# we force tty allocation in order to tranfer signals (kill)
	$remcmd = ['/usr/bin/ssh', '-t', '-t', '-n', '-o', 'BatchMode=yes', $remip];
    }

    my $realcmd = sub {
	my $upid = shift;

	print "$upid\n";

	my $res = -1;
       
	eval {
	    $res = &$code ($upid, $remip, $remcmd, $cinfo);

	    my $ticket = $class->$get_ticket();

	    my $rcon = PVE::ConfigClient::connect ($ticket, $cinfo, $cid);
	    if (my $vzlist = $rcon->vzlist()->result) {
		PVE::Config::update_file ('vzlist', $vzlist, $cid);
	    }
	};

	my $err = $@;

	if ($err) {
	    syslog ('err', $err);
	    print STDERR "\n$err";
	    exit (-1);
	} 

	print STDERR "\n"; # flush
	exit ($res);
    };

    if (my $uid = $class->$fork_worker ('vmops', "$command:$cid:$veid:$userid", $realcmd)) {

	PVE::Config::update_file ("vmops", $uid);
	  
	return $uid;                 ;
    }

    return undef;
};

sub apl_start_download {  ##SOAP_EXPORT##
    my ($class, $aplname) = @_;

    my $userid = $class->$get_userid();

    my $pkglist = PVE::APLInfo::load_data();

    my $data;

    if (!$pkglist || !$aplname || !($data = $pkglist->{'all'}->{$aplname})) {
	syslog ('err', "download failed: no aplinfo for appliance '$aplname'");
	return;
    }

    my $realcmd = sub {
	my $upid = shift;

	print "$upid\n";

	my $tmp = "/tmp/apldownload-$$-tmp.dat";

	eval {
	    my $msg = "starting download: $aplname";
	    syslog ('info', $msg);
	    print STDERR "$msg\n";

	    my $src = $data->{location};
	    my $dest = "/var/lib/vz/template/cache/$aplname";

	    if (-f $dest) {
		my $md5 = (split (/\s/, `md5sum '$dest'`))[0];

		if ($md5 && (lc($md5) eq lc($data->{md5sum}))) {
		    $msg = "file already exists $md5 - no need to download";
		    syslog ('info', $msg);
		    print STDERR "$msg\n";
		    return;
		}
	    }

	    local %ENV;
	    my $pvecfg = PVE::Config::read_file('pvecfg'); 
	    if ($pvecfg && $pvecfg->{http_proxy}) {
		$ENV{http_proxy} = $pvecfg->{http_proxy};
	    }

	    my @cmd = ('/usr/bin/wget', '--progress=dot:mega', '-O', $tmp, $src);
	    if (system (@cmd) != 0) {
		die "download failed - $!\n";
	    }

	    my $md5 = (split (/\s/, `md5sum '$tmp'`))[0];
		
	    if (!$md5 || (lc($md5) ne lc($data->{md5sum}))) {
		die "wrong checksum: $md5 != $data->{md5sum}\n";
	    }

	    if (system ('mv', $tmp, $dest) != 0) {
		die "unable to save file - $!\n";
	    }
	};

	my $err = $@;

	unlink $tmp;

	if ($err) {
	    syslog ('err', $err);
	    print STDERR "\n\ndownload failed: $err";
	    exit (-1);
	} 

	syslog ('info', "download finished");
	print STDERR "download finished\n";

	exit (0);
    };

    if (my $uid = $class->$fork_worker ('apldownload', "$userid:$aplname", $realcmd)) {
	return $uid; 
    }

    return undef;
}

sub vmconfig_set {  ##SOAP_EXPORT##
    my ($class, $cid, $veid, $type, $settings) = @_;

    die "unknown virtualization type '$type'\n" if !($type eq 'openvz' || $type eq 'qemu');

    my $userid = $class->$get_userid();

    my $cinfo = PVE::Cluster::clusterinfo ();

    my $remip;
    my $remcmd = [];

    if ($cid != $cinfo->{local}->{cid}) {
	$remip = $cinfo->{"CID_$cid"}->{ip};
	$remcmd = ['/usr/bin/ssh', '-n', '-o', 'BatchMode=yes', $remip];
    }

    return if !$settings;

    my $param;

    foreach my $key (keys %$settings) {
	die "invalid key '$key'" if $key !~ m/^\w+$/;
	my $v = $settings->{$key};
	next if !defined ($v);
	if (ref ($v) eq 'ARRAY') {
	    foreach my $v1 (@$v) {
		push @$param, "--$key", $remip ? PVE::Utils::shellquote ($v1) : $v1;
	    }
	} else {
	    push @$param, "--$key", $remip ?  PVE::Utils::shellquote ($v) : $v;
	}
    }

    return if scalar (@$param) == 0;

    $remip = 'localhost' if !$remip;

    syslog ('info', "apply settings to VM $veid on node $cid ($remip)");

    my @cmd;

    if ($type eq 'openvz') {	
	@cmd = (@$remcmd, '/usr/bin/pvectl', 'vzset', $veid, @$param);
    } else {
	@cmd = (@$remcmd, '/usr/sbin/qm', 'set', $veid, @$param);
    }

    if (system (@cmd) != 0) {
	my $cmdstr = join (' ', @cmd);
	my $msg = "unable to apply VM settings, command failed: $cmdstr\n";
	syslog ('err', $msg);
	die "$msg\n";
    }

    my $msg = "VM $veid settings applied";
    syslog ('info', $msg);
}

# set cdrom for qemu/kvm
sub vmconfig_setcdrom { ##SOAP_EXPORT##
    my ($class, $cid, $veid, $device, $volid) = @_;

    my $userid = $class->$get_userid();

    my $cinfo = PVE::Cluster::clusterinfo ();

    my $remip;
    my $remcmd = [];

    if ($cid != $cinfo->{local}->{cid}) {
	$remip = $cinfo->{"CID_$cid"}->{ip};
	$remcmd = ['/usr/bin/ssh', '-n', '-o', 'BatchMode=yes', $remip];
    }

    my $param;

    die "invalid device name '$device'" if $device !~ m/^\w+$/;

    push @$param, "--$device",  $remip ?  PVE::Utils::shellquote ($volid) : $volid;

    return if scalar (@$param) == 0;

    $remip = 'localhost' if !$remip;

    syslog ('info', "setting cdrom on VM $veid on node $cid ($remip)");

    my @cmd = (@$remcmd, '/usr/sbin/qm', 'cdrom', $veid, @$param);

    if (system (@cmd) != 0) {
	my $cmdstr = join (' ', @cmd);
	my $msg = "unable to set cdrom, command failed: $cmdstr\n";
	syslog ('err', $msg);
	die "$msg\n";
    }

    my $msg = "VM $veid set cdrom";
    syslog ('info', $msg);
}

# delete unused qemu/kvm disk images
sub qemu_unlink_disk { ##SOAP_EXPORT##
    my ($class, $cid, $veid, $filename) = @_;

    my $userid = $class->$get_userid();

    my $cinfo = PVE::Cluster::clusterinfo ();

    my $remip;
    my $remcmd = [];

    if ($cid != $cinfo->{local}->{cid}) {
	$remip = $cinfo->{"CID_$cid"}->{ip};
	$remcmd = ['/usr/bin/ssh', '-n', '-o', 'BatchMode=yes', $remip];
    }

    $remip = 'localhost' if !$remip;

    syslog ('info', "delete image '$filename' on VM $veid on node $cid ($remip)");

    my @cmd = (@$remcmd, '/usr/sbin/qm', 'unlink', $veid, $filename);

    if (system (@cmd) != 0) {
	my $cmdstr = join (' ', @cmd);
	my $msg = "unable to delete image, command failed: $cmdstr\n";
	syslog ('err', $msg);
	die "$msg\n";
    }

    my $msg = "VM $veid image '$filename' successfuly deleted";
    syslog ('info', $msg);
}

sub vmcommand_create { ##SOAP_EXPORT##
    my ($class, $cid, $veid, $type, $settings) = @_;

    die "unknown virtualization type '$type'\n" if !($type eq 'openvz' || $type eq 'qemu');

    my $userid = $class->$get_userid();

    return $class->$vmcommand ($userid, 'create', $cid, $veid, sub {
	my ($upid, $remip, $remcmd, $cinfo) = @_;
	

	my @cmd;

	if ($type eq 'openvz') {
	    @cmd = (@$remcmd, '/usr/bin/pvectl', 'vzcreate', $veid);
	} else {
	    @cmd = (@$remcmd, '/usr/sbin/qm', 'create', $veid);
	}

	foreach my $key (keys %$settings) {
	    die "invalid key '$key'" if $key !~ m/^\w+$/;
	    my $v = $settings->{$key};
	    next if !defined ($v);
	    if (ref ($v) eq 'ARRAY') {
		foreach my $v1 (@$v) {
		    push @cmd, "--$key", $remip ?  PVE::Utils::shellquote ($v1) : $v1;
		}
	    } else {
		push @cmd, "--$key", $remip ?  PVE::Utils::shellquote ($v) : $v;
	    }
	}

	$remip = 'localhost' if !$remip;

	syslog ('info', "creating new VM $veid on node $cid ($remip)");

	my $cmdstr = join (' ', @cmd);
	print "$cmdstr\n";

	if (system (@cmd) != 0) {

	    my $msg = "unable to apply VM settings - $!";
	    syslog ('err', $msg);
	    print "$msg\n";
	    return -1;
	}

	my $msg = "VM $veid created";
	syslog ('info', $msg);
	print "$msg\n";

	return 0;
    });
}

sub vmcommand_destroy { ##SOAP_EXPORT##
    my ($class, $cid, $veid, $type) = @_;

    die "unknown virtualization type '$type'\n" if !($type eq 'openvz' || $type eq 'qemu');

    my $userid = $class->$get_userid();

    return $class->$vmcommand ($userid, 'destroy', $cid, $veid, sub {
	my ($upid, $remip, $remcmd, $cinfo) = @_;

	$remip = 'localhost' if !$remip;

	syslog ('info', "destroying VM $veid on node $cid ($remip)");

	my @cmd;

	if ($type eq 'openvz') {
	    @cmd = (@$remcmd, '/usr/sbin/vzctl', 'destroy', $veid);
	} else {
	    @cmd = (@$remcmd, '/usr/sbin/qm', 'destroy', $veid);
	}

	my $cmdstr = join (' ', @cmd);

	print "$cmdstr\n";

	if (system (@cmd) != 0) {
	    my $msg = "VM $veid destroy failed - $!";
	    syslog ('err', $msg);
	    print "$msg\n";
	    return -1;
	}
	
	my $msg = "VM $veid destroyed";
	syslog ('info', $msg);
	print "$msg\n";

	return 0;
    });
}

sub vmcommand_stop { ##SOAP_EXPORT##
    my ($class, $cid, $veid, $type, $force) = @_;

    my $userid = $class->$get_userid();

    die "unknown virtualization type '$type'\n" if !($type eq 'openvz' || $type eq 'qemu');

    return $class->$vmcommand ($userid, 'stop', $cid, $veid, sub {
	my ($upid, $remip, $remcmd, $cinfo) = @_;

	$remip = 'localhost' if !$remip;

	syslog ('info', "stopping VM $veid on node $cid ($remip)");

	my @cmd;

	if ($type eq 'openvz') {
	    @cmd = (@$remcmd, '/usr/sbin/vzctl', 'stop', $veid);
	    push @cmd, '--fast' if $force;
	} else {
	    @cmd = (@$remcmd, '/usr/sbin/qm', $force ? 'stop' : 'shutdown', $veid);
	}

	my $cmdstr = join (' ', @cmd);

	print "$cmdstr\n";

	if (system (@cmd) != 0) {
	    my $msg = "VM $veid stop failed - $!";
	    syslog ('err', $msg);
	    print "$msg\n";
	    return -1;
	}
	
	my $msg = "VM $veid stopped";
	syslog ('info', $msg);
	print "$msg\n";

	return 0;
    });
}

sub vmcommand_umount { ##SOAP_EXPORT##
    my ($class, $cid, $veid, $type) = @_;

    die "unknown virtualization type '$type'\n" if $type ne 'openvz';

    my $userid = $class->$get_userid();

    return $class->$vmcommand ($userid, 'umount', $cid, $veid, sub {
	my ($upid, $remip, $remcmd, $cinfo) = @_;

	$remip = 'localhost' if !$remip;

	syslog ('info', "unmounting VM $veid on node $cid ($remip)");

	my @cmd;

	@cmd = (@$remcmd, '/usr/sbin/vzctl', 'umount', $veid);

	my $cmdstr = join (' ', @cmd);

	print "$cmdstr\n";

	if (system (@cmd) != 0) {
	    my $msg = "VM $veid umount failed - $!";
	    syslog ('err', $msg);
	    print "$msg\n";
	    return -1;
	}
	
	my $msg = "VM $veid unmounted";
	syslog ('info', $msg);
	print "$msg\n";

	return 0;
    });
}

sub vmcommand_start { ##SOAP_EXPORT##
    my ($class, $cid, $veid, $type) = @_;

    die "unknown virtualization type '$type'\n" if !($type eq 'openvz' || $type eq 'qemu');

    my $userid = $class->$get_userid();

    return $class->$vmcommand ($userid, 'start', $cid, $veid, sub {
	my ($upid, $remip, $remcmd, $cinfo) = @_;

	$remip = 'localhost' if !$remip;

	syslog ('info', "starting VM $veid on node $cid ($remip)");

	my @cmd;

	if ($type eq 'openvz') {
	    @cmd = (@$remcmd, '/usr/sbin/vzctl', 'start', $veid);
	} else {
	    @cmd = (@$remcmd, '/usr/sbin/qm', 'start', $veid);
	}

	my $cmdstr = join (' ', @cmd);

	print "$cmdstr\n";

	if (system (@cmd) != 0) {
	    my $msg = "VM $veid start failed - $!";
	    syslog ('err', $msg);
	    print "$msg\n";
	    return -1;
	}
	
	my $msg = "VM $veid started";
	syslog ('info', $msg);
	print "$msg\n";

	return 0;
    });
}

sub vmcommand_restart {  ##SOAP_EXPORT##
    my ($class, $cid, $veid, $type) = @_;

    die "unknown virtualization type '$type'\n" if !($type eq 'openvz' || $type eq 'qemu');

    my $userid = $class->$get_userid();

    return $class->$vmcommand ($userid, 'restart', $cid, $veid, sub {
	my ($upid, $remip, $remcmd, $cinfo) = @_;

	$remip = 'localhost' if !$remip;

	syslog ('info', "restarting VM $veid on node $cid ($remip)");

	my @cmd;

	if ($type eq 'openvz') {	
	    @cmd = (@$remcmd, '/usr/sbin/vzctl', 'restart', $veid);
	} else {
	    @cmd = (@$remcmd, '/usr/sbin/qm', 'reset', $veid);
	}
	my $cmdstr = join (' ', @cmd);

	print "$cmdstr\n";

	if (system (@cmd) != 0) {
	    my $msg = "VM $veid restart failed - $!";
	    syslog ('err', $msg);
	    print "$msg\n";
	    return -1;
	}
	
	my $msg = "VM $veid restarted";
	syslog ('info', $msg);
	print "$msg\n";

	return 0;
    });
}

sub vmcommand_migrate { ##SOAP_EXPORT##
    my ($class, $cid, $veid, $type, $target, $online) = @_;

    die "unknown virtualization type '$type'\n" if !($type eq 'openvz' || $type eq 'qemu');

    my $userid = $class->$get_userid();

    my $cinfo = PVE::Cluster::clusterinfo ();

    return $class->$vmcommand ($userid, 'migrate', $cid, $veid, sub {
	my ($upid, $remip, $remcmd, $cinfo) = @_;

	$remip = 'localhost' if !$remip;

	my $targetip = $cinfo->{"CID_$target"}->{ip};

	syslog ('info', "migrating VM $veid from node $cid ($remip) to node $target ($targetip)");

	my @cmd;

	if ($type eq 'openvz') {
	    @cmd = (@$remcmd, '/usr/sbin/vzmigrate');
	    push @cmd, '--online' if $online;
	    push @cmd, $targetip;
	    push @cmd, $veid;
	} else {
	    @cmd = (@$remcmd, '/usr/sbin/qmigrate');
	    push @cmd, '--online' if $online;
	    push @cmd, $targetip;
	    push @cmd, $veid;
	}

	my $cmdstr = join (' ', @cmd);

	print "$cmdstr\n";

	if (system (@cmd) != 0) {
	    my $msg = "VM $veid migration failed - $!";
	    syslog ('err', $msg);
	    print "$msg\n";
	    return -1;
	}
	
	my $msg = "VM $veid migration done";
	syslog ('info', $msg);
	print "$msg\n";

	return 0;
    });
}

my $next_vnc_port = sub { # private method

    for (my $p = 5900; $p < 6000; $p++) {

	my $sock = IO::Socket::INET->new (Listen => 5,
					  LocalAddr => 'localhost',
					  LocalPort => $p,
					  ReuseAddr => 1,
					  Proto     => 0);

	if ($sock) {
	    close ($sock);
	    return $p;
	}
    }

    die "unable to find free vnc port";
};

sub create_vnc_proxy {  ##SOAP_EXPORT##
    my ($class, $cid, $veid) = @_;

    my $remip;
    my $remcmd = [];

    my $userid = $class->$get_userid();

    my $cinfo = PVE::Cluster::clusterinfo ();

    if ($cid != $cinfo->{local}->{cid}) {
	$remip = $cinfo->{"CID_$cid"}->{ip};
	$remcmd = ['/usr/bin/ssh', '-T', '-o', 'BatchMode=yes', $remip];
    }

    my $port = $class->$next_vnc_port();
    # generate ticket, olny first 8 character used by vnc
    my $ticket = Digest::SHA1::sha1_base64 ($userid, rand(), time());

    my $timeout = 30; 

    my $realcmd = sub {
	my $upid = shift;

	syslog ('info', "starting vnc proxy $upid\n");

	my $qmcmd = [@$remcmd, "/usr/sbin/qm", 'vncproxy', $veid , $ticket];

	my $qmstr = join (' ', @$qmcmd);

	# also redirect stderr (else we get RFB protocol errors)
	my @cmd = ('/bin/nc', '-l', '-p', $port, '-w', $timeout, '-c', "$qmstr 2>/dev/null");

	my $cmdstr = join (' ', @cmd);
	syslog ('info', "CMD: $cmdstr");

	if (system (@cmd) != 0) {
	    my $msg = "VM $veid vnc proxy failed - $?";
	    syslog ('err', $msg);
	    exit (-1);
	}

	exit (0);
    };

    if (my $uid = $class->$fork_worker ('vncproxy', "$cid:$veid:$userid:$port:$ticket", $realcmd)) {
	return { port => $port, ticket => $ticket};
    }

    return undef;
    
}

sub create_vnc_console { ##SOAP_EXPORT##
    my ($class, $cid, $veid, $type, $status) = @_;

    my $userid = $class->$get_userid();

    my $remip;
    my $remcmd = [];

    $userid = 'unknown' if !$userid;

    my $cinfo = PVE::Cluster::clusterinfo ();

    if ($cid != $cinfo->{local}->{cid}) {
	$remip = $cinfo->{"CID_$cid"}->{ip};
	$remcmd = ['/usr/bin/ssh', '-t', $remip];
    }

    my $port = $class->$next_vnc_port();
    # generate ticket, olny first 8 character used by vnc
    my $ticket = Digest::SHA1::sha1_base64 ($userid, rand(), time());

    my $timeout = 1; # immediately exit when last client disconnects

    my $realcmd = sub {
	my $upid = shift;

	syslog ('info', "starting vnc console $upid\n");

	# fixme: use ssl

	my $pwfile = "/tmp/.vncpwfile.$$";

	my $vzcmd;

	if ($type eq 'openvz') {
	    if ($status eq 'running') {
		$vzcmd = [ '/usr/sbin/vzctl', 'enter', $veid ];
	    } elsif ($status eq 'mounted') {
		$vzcmd = [ "/usr/bin/pvebash", $veid, 'root'];
	    } else {
		$vzcmd = [ "/usr/bin/pvebash", $veid, 'private'];
	    }
	} elsif ($type eq 'qemu') {
	    $vzcmd = [ "/usr/sbin/qm", 'monitor', $veid ];
	} else {
	    $vzcmd = [ '/bin/true' ]; # should not be reached
	}

	my @cmd = ('/usr/bin/vncterm', '-rfbport', $port, 
		   '-passwdfile', "rm:$pwfile",
		   '-timeout', $timeout, '-c', @$remcmd, @$vzcmd);

	my $cmdstr = join (' ', @cmd);
	syslog ('info', "CMD: $cmdstr");

	my $fh = IO::File->new ($pwfile, "w", 0600);
	print $fh "$ticket\n";
	$fh->close;

	if (system (@cmd) != 0) {
	    my $msg = "VM $veid console viewer failed - $?";
	    syslog ('err', $msg);
	    exit (-1);
	}

	exit (0);
    };

    if (my $uid = $class->$fork_worker ('vncview', "$cid:$veid:$userid:$port:$ticket", $realcmd)) {
	
	#PVE::Config::update_file ("vncview", $uid);
	  
	return { port => $port, ticket => $ticket};
    }

    return undef;
    
}

sub service_cmd { ##SOAP_EXPORT##
    my ($class, $service, $cmd) = @_;

    my $userid = $class->$get_userid();

    eval {
	my $res = PVE::Utils::service_cmd ($service, $cmd);
        syslog ('info', $res) if $res;
        syslog ('info', "service command '$service $cmd' successful");
    };

    if (my $err = $@) {
	syslog ('err', "service command '$service $cmd' failed : $err");
    }
}

my $service_list = {
    apache => { short => 'WWW', long => 'Web Server' },
    pvetunnel => { short => 'ClusterTunnel', 
		   long => 'PVE Cluster Tunnel Daemon' }, 
    pvemirror => { short => 'ClusterSync', 
		   long => 'PVE Cluster Synchronization Daemon' },
    postfix => { short => 'SMTP', long => 'Simple Mail Tranfer Protocol' },
    ntpd => { short => 'NTP', long => 'Network Time Protocol' },
    sshd => { short => 'SSH', long => 'Secure Shell Daemon' },
    # bind => { short => 'BIND', long => 'Local DNS Cache' },
    # pvedaemon => { short => 'NodeManager', long => 'PVE Node Manager Daemon' },
};

sub service_state_all { ##SOAP_EXPORT##
    my ($class) = @_;

    my $userid = $class->$get_userid();

    my $res = {};

    foreach my $s (keys %{$service_list}) {
	$res->{$s} = $service_list->{$s};
	$res->{$s}->{status} = PVE::Utils::service_state ($s);
    }

    return $res;
}

sub restart_server {  ##SOAP_EXPORT##
    my ($class, $poweroff) = @_;

    my $userid = $class->$get_userid();

    if ($poweroff) {
	system ("(sleep 2;/sbin/poweroff)&");
    } else {
	system ("(sleep 2;shutdown -r now)&");
    }
}

sub check_worker { ##SOAP_EXPORT##
    my ($class, $upid, $killit) = @_;

    my $userid = $class->$get_userid();

    if (my $upid_hash = PVE::Utils::upid_decode ($upid)) {

	my $pid = $upid_hash->{pid};

	# test if still running
	return 0 if !PVE::Utils::check_process ($pid, $upid_hash->{pstart});

	if ($killit) {

	    # send kill to process group (negative pid)
	    my $kpid = -$pid;

	    kill (15, $kpid); # send TERM signal

	    # give max 5 seconds to shut down
	    # note: waitpid only work for child processes, but not
	    # for processes spanned by other processes, so we use 
	    # kill to detect if the worker is still running
	    for (my $i = 0; $i < 5; $i++) {
		last if !kill (0, $kpid);
		sleep (1);
	    }
       
	    if (kill (0, $kpid)) {
		kill (9, $kpid); # kill if still alive
	    }

	    return 0; # killed, not running
	} else {
	    return 1; # running
	}
    }

    return 0;
}

sub kvm_version { ##SOAP_EXPORT##
    my ($class) = @_;

    my $userid = $class->$get_userid();

    return PVE::QemuServer::kvm_version();
}

sub install_template { ##SOAP_EXPORT##
    my ($class, $storeid, $type, $tmpname, $filename) = @_;

    my $userid = $class->$get_userid();

    my $cfg = PVE::Config::read_file ("storagecfg");

    PVE::Storage::install_template ($cfg, $storeid, $type, $tmpname, $filename);
}

sub delete_volume { ##SOAP_EXPORT##
    my ($class, $volid) = @_;

    my $userid = $class->$get_userid();

    my $cfg = PVE::Config::read_file ("storagecfg");

    PVE::Storage::vdisk_free ($cfg, $volid);
}

sub get_config_data { ##SOAP_EXPORT##
    my ($class, $id, $full) = @_;

    my $userid = $class->$get_userid();

    return PVE::Config::read_file ($id, $full);
}

sub set_config_data { ##SOAP_EXPORT##
    my ($class, $id, $data, $full) = @_;

    my $userid = $class->$get_userid();

    return PVE::Config::write_file ($id, $data, $full);
}

sub update_config_data { ##SOAP_EXPORT##
    my ($class, $id, $data, @param) = @_;

    my $userid = $class->$get_userid();

    return PVE::Config::update_file ($id, $data, @param);
}

sub discard_config_changes { ##SOAP_EXPORT##
    my ($class, $id, $full) = @_;

    my $userid = $class->$get_userid();

    return PVE::Config::discard_changes ($id, $full);
}

sub modify_user { ##SOAP_EXPORT##
    my ($class, $username, $group, $pw, $comment) = @_;

    my $userid = $class->$get_userid();

    return PVE::Utils::modify_user ($username, $group, $pw, $comment);
}

sub storage_list_volumes { ##SOAP_EXPORT##
    my ($class, $storeid) = @_;

    my $userid = $class->$get_userid();

    my $cfg = PVE::Config::read_file ("storagecfg");

    return PVE::Storage::vdisk_list ($cfg, $storeid);
}

sub storage_list_iso {  ##SOAP_EXPORT##
    my ($class, $storeid) = @_;

    my $userid = $class->$get_userid();

    my $cfg = PVE::Config::read_file ("storagecfg");

    return PVE::Storage::template_list ($cfg, $storeid, 'iso');
}

sub storage_list_vztmpl {  ##SOAP_EXPORT##
    my ($class, $storeid) = @_;

    my $userid = $class->$get_userid();

    my $cfg = PVE::Config::read_file ("storagecfg");

    return PVE::Storage::template_list ($cfg, $storeid, 'vztmpl');
}

sub storage_list_backups {  ##SOAP_EXPORT##
    my ($class, $storeid) = @_;

    my $userid = $class->$get_userid();

    my $cfg = PVE::Config::read_file ("storagecfg");

    return PVE::Storage::template_list ($cfg, $storeid, 'backup');
}

sub storage_list_vgs {  ##SOAP_EXPORT##
    my ($class) = @_;

    my $userid = $class->$get_userid();

    my $cfg = PVE::Config::read_file ("storagecfg");

    return PVE::Storage::lvm_vgs ();
}

sub storage_add { ##SOAP_EXPORT##
    my ($class, $storeid, $type, $param) = @_;

    my $userid = $class->$get_userid();

    PVE::Storage::storage_add ($storeid, $type, $param);
}

sub storage_set { ##SOAP_EXPORT##
    my ($class, $storeid, $param, $digest) = @_;

    my $userid = $class->$get_userid();

    PVE::Storage::storage_set ($storeid, $param, $digest);
}

sub storage_remove { ##SOAP_EXPORT##
    my ($class, $storeid, $digest) = @_;

    my $userid = $class->$get_userid();

    PVE::Storage::storage_remove ($storeid, $digest);
}

sub storage_enable { ##SOAP_EXPORT##
    my ($class, $storeid, $digest) = @_;

    my $userid = $class->$get_userid();

    PVE::Storage::storage_enable ($storeid, $digest);
}

sub storage_disable { ##SOAP_EXPORT##
    my ($class, $storeid, $digest) = @_;

    my $userid = $class->$get_userid();

    PVE::Storage::storage_disable ($storeid, $digest);
}

sub storage_scan_nfs { ##SOAP_EXPORT##
    my ($class, $server) = @_;

    my $userid = $class->$get_userid();

    return PVE::Storage::scan_nfs ($server);    
}

sub storage_scan_iscsi { ##SOAP_EXPORT##
    my ($class, $portal, $skip_used) = @_;

    my $userid = $class->$get_userid();

    my $res = PVE::Storage::scan_iscsi ($portal);    

    return $res if !$skip_used;

    my $cfg = PVE::Config::read_file ("storagecfg");

    my $unused = {};
    foreach my $target (keys %$res) {
	if (!PVE::Storage::target_is_used ($cfg, $target)) {
	    $unused->{$target} = $res->{target} 
	}
    }
    return $unused;
}

sub storage_user_info { ##SOAP_EXPORT##
    my ($class, $vmid) = @_;
 
    my $userid = $class->$get_userid();

    my $cfg = PVE::Config::read_file ("storagecfg");

    my $info = PVE::Storage::storage_info ($cfg);
    
    my $res = { cfg => $cfg };

    foreach my $storeid (PVE::Storage::storage_ids ($cfg)) {
	my $scfg = PVE::Storage::storage_config ($cfg, $storeid);

	next if $scfg->{disable};

	# fixme: check user access rights - pass username with connection?

	$res->{info}->{$storeid} = $info->{$storeid};

	if ($scfg->{content}->{rootdir}) {
	    $res->{rootdir}->{$storeid} = 1;
	    $res->{rootdir_default} = $storeid 
		if !$res->{rootdir_default};
	}

	if ($scfg->{content}->{vztmpl}) {
	    $res->{vztmpl}->{$storeid} = 1;
	    $res->{vztmpl_default} = $storeid 
		if !$res->{vztmpl_default};
	}

	if ($scfg->{content}->{images}) {
	    $res->{images}->{$storeid} = 1;
	    $res->{images_default} = $storeid
		if !$res->{images_default};
	}

	if ($scfg->{content}->{iso}) {
	    $res->{iso}->{$storeid} = 1;
	    $res->{iso_default} = $storeid
		if !$res->{iso_default};
	}

	if ($scfg->{content}->{backup}) {
	    $res->{backup}->{$storeid} = 1;
	    $res->{backup_default} = $storeid
		if !$res->{backup_default};
	}
    }

    # include disk list
    if ($vmid) {
	$res->{imagelist} = PVE::Storage::vdisk_list ($cfg, undef, $vmid);
    }


    return $res;
}

sub get_storage_status { ##SOAP_EXPORT##
    my ($class) = @_;
 
    my $userid = $class->$get_userid();

    # fixme: check user access rights 

    my $cfg = PVE::Config::read_file ("storagecfg");

    my $info = PVE::Storage::storage_info ($cfg);

    return { cfg => $cfg, info => $info };
}

##FILTER_DATA## do not remove this line

package PVE::SOAPSerializer;

use strict;
use SOAP::Lite;
use vars qw(@ISA);
use HTML::Entities;

@ISA = qw (SOAP::Serializer);

sub new {
    my $class = shift;

    my $self = $class->SUPER::new (@_);
    
# SOAP Serializer bug fix:
# "a string with embeded URI 'http://exsample.com'" is encoded as URI!
# should be a string instead
#        'anyURI' => 
#	      [95, sub { $_[0] =~ /^(urn:)|(http:\/\/)/i; }, 'as_anyURI'],
# regex should be: /^((urn:)|(http:\/\/))/i;
# so we disbale that
    delete $self->{_typelookup}->{'anyURI'};

# SOAP Serializer bug fix:
# by default utf8 strings are serialized as base64Binary - unfortunately
# that way the utf8 flags gets lost, so we provide our own encoding
# see bug #2860559 on sourgeforge project page
    $self->{_typelookup}->{'utf8string'} =
	[5, sub { Encode::is_utf8($_[0]) }, 'as_utf8string'],

    return $self;
}

sub as_utf8string {
    my ($self, $value, $name, $type, $attr) = @_;

    return [
        $name,
        {'xsi:type' => 'xsd:string', %$attr},
	HTML::Entities::encode_entities_numeric ($value)
    ];
}

package PVE::SOAPTransport;

use strict;
use vars qw(@ISA);
use SOAP::Transport::HTTP;
use MIME::Base64;
use PVE::SafeSyslog;
use PVE::Config;
use POSIX qw(EINTR);
use POSIX ":sys_wait_h";
use IO::Handle;
use IO::Select;
use vars qw(@ISA);

# This is a quite simple pre-fork server

@ISA = qw(SOAP::Transport::HTTP::Daemon);

my $workers = {};

my $max_workers = 2;    # pre-forked worker processes
my $max_requests = 500; # max requests per worker

sub worker_finished {
    my $cpid = shift;

    syslog ('info', "worker $cpid finished");
}
    
sub finish_workers {
    local $!; local $?;    
    foreach my $cpid (keys %$workers) {
        my $waitpid = waitpid ($cpid, WNOHANG);
        if (defined($waitpid) && ($waitpid == $cpid)) {
            delete ($workers->{$cpid});
	    worker_finished ($cpid);
	}
    }
}

sub test_workers {
    foreach my $cpid (keys %$workers) {
	if (!kill(0, $cpid)) {
	    waitpid($cpid, POSIX::WNOHANG());
	    delete $workers->{$cpid};
	    worker_finished ($cpid);
	}
    }
}

sub start_workers {
    my $self = shift;

    my $count = 0;
    foreach my $cpid (keys %$workers) {
	$count++;
    }

    my $need = $max_workers - $count;

    return if $need <= 0;

    syslog ('info', "starting $need worker(s)");

    while ($need > 0) {
	my $pid = fork;

	if (!defined ($pid)) {
	    syslog ('err', "can't fork worker");
	    sleep (1);
	} elsif ($pid) { #parent
	    $workers->{$pid} = 1;
	    $0 = 'pvedaemon worker';
	    syslog ('info', "worker $pid started");
	    $need--;
	} else {
	    $SIG{TERM} = $SIG{QUIT} = 'DEFAULT';

	    $SIG{USR1} = sub {
		$self->{reload_config} = 1;
	    };

	    eval {
		# try to init inotify
		PVE::Config::inotify_init();

	        $self->handle_requests ();
	    };
	    syslog ('err', $@) if $@;

	  
	    exit (0);
	}
    }
}

sub terminate_server {

    foreach my $cpid (keys %$workers) {
	kill (15, $cpid); # TERM childs
    }

    # nicely shutdown childs (give them max 10 seconds to shut down)
    my $previous_alarm = alarm (10);
    eval {
	local $SIG{ALRM} = sub { die "Timed Out!\n" };
	
	1 while ((my $pid = waitpid (-1, 0)) > 0);

    };
    alarm ($previous_alarm);

    foreach my $cpid (keys %$workers) {
	!kill (0, $cpid) || kill (9, $cpid); # KILL childs still alive!
    }
}

sub handle {
    my $self = shift;
    my $daemon = $self->new;

    $self->{httpdaemon} = $daemon;
 
    eval {
	my $old_sig_chld = $SIG{CHLD};
	local $SIG{CHLD} = sub {
	    finish_workers ();
	    &$old_sig_chld(@_);
	};

	my $old_sig_term = $SIG{TERM};
	local $SIG{TERM} = sub { 
	    terminate_server ();
	    &$old_sig_term(@_);
	};
	local $SIG{QUIT} = sub { 
	    terminate_server();
	    &$old_sig_term(@_);
	};

	local $SIG{USR1} = 'IGNORE';

	local $SIG{HUP} = sub {
	    syslog ("info", "received reload request");
	    foreach my $cpid (keys %$workers) {
		kill (10, $cpid); # SIGUSR1 childs
	    }
	};

	for (;;) { # forever
	    $self->start_workers ();
	    sleep (5); 
	    $self->test_workers ();
	}
    };
    my $err = $@;

    if ($err) {
	syslog ('err', "ERROR: $err");
    }
}

sub send_basic_auth_request {
    my ($c) = @_;
    
    my $realm = 'PVE SOAP Server';
    my $auth_request_res = HTTP::Response->new(401, 'Unauthorized');
    $auth_request_res->header('WWW-Authenticate' => qq{Basic realm="$realm"});
    $auth_request_res->is_error(1);
    $auth_request_res->error_as_HTML(1);
    $c->send_response($auth_request_res);
}

sub send_error {
    my ($c, $code, $msg) = @_;

    $c->send_response(HTTP::Response->new($code, $msg));
}

sub decode_basic_auth {
    my ($h) = @_;

    my $authtxt = $h->header('Authorization');
    return undef if !$authtxt;
    my ($test, $auth) = split /\s+/, $authtxt;
    return undef if !$auth;

    my $enc = MIME::Base64::decode ($auth);

    return $enc;
}

sub extract_auth_cookie {
    my ($h) = @_;

    my $txt = $h->header('Cookie') || '';

    return ($txt =~ /(?:^|\s)PVEAuthTicket=([^;]*)/)[0];
}

sub ident_user {
    my ($peerport, $sockport) = @_;

    my $filename = "/proc/net/tcp";
    
    my $fh = IO::File->new($filename, "r") ||
	die "unable to open file '$filename'\n";

    my $user;

    my $remoteaddr = sprintf "0100007F:%04X", $sockport;
    my $localaddr = sprintf "0100007F:%04X", $peerport;

    while (defined (my $line = <$fh>)) {
	$line =~ s/^\s+//;
	my @data = split (/\s+/, $line);
	if ($data[1] eq $localaddr && 
	    $data[2] eq  $remoteaddr) {
	    my $uid = $data[7];
	    $user = getpwuid ($uid);
	    last;
	}
    } 

    close ($fh);

    die "unable to identify user connection\n" if !$user;

    return $user;
}

sub handle_login {
    my ($daemon, $c, $r) = @_;

    # my $cuser = ident_user ($c->peerport, $c->sockport);

    my $h =  $r->headers;
    my $action = $h->header('SOAPAction');
    if ($action !~ m|^(\"?)http://proxmox.com/PVE/ConfigServer\#(\w+)(\"?)$|) {
	send_error($c, 400, "Invalid SOAPAction");
	return undef;
    }
    my $method = $2;
    my $ticket = extract_auth_cookie($h);
    my $authheader = $h->header('Authorization');
    
    if (!$ticket) {
	if (!$authheader || $authheader !~ m/^Basic\s+\S+$/) {
	    send_basic_auth_request ($c);
	    return undef;
	}
    }
    
    my ($user, $group);

    $daemon->request($r);
    
    my $update;
    
    if ($authheader) {
	my $auth = (split /\s+/, $authheader)[1];
	my $enc = MIME::Base64::decode ($auth);
	my $pw;
	($user, $pw) = split (/:/, $enc, 2);
	if ($group = PVE::Utils::is_valid_user ($user, $pw)) {
	    $ticket = PVE::Utils::create_auth_ticket ($daemon->{pve}->{secret}, $user, $group);
	    $update = 1;
	} else {
	    $daemon->make_fault($SOAP::Constants::FAULT_CLIENT, 
				'Basic authentication failed');
	    $c->send_response($daemon->response);
	    return undef;
	}
    } elsif ($ticket) {
	($user, $group) = PVE::Utils::verify_ticket ($daemon->{pve}->{secret}, $ticket);
	if (!($user && $group)) {
	    $daemon->make_fault($SOAP::Constants::FAULT_CLIENT, 
				"Ticket authentication failed - invalid ticket '$ticket'");
	    $c->send_response($daemon->response);
	    return undef;    
	}
	if ($method eq 'update_ticket') {
	    $ticket = PVE::Utils::create_auth_ticket ($daemon->{pve}->{secret}, $user, $group);
	}
    } else {
	$daemon->make_fault($SOAP::Constants::FAULT_CLIENT, 
			    'Ticket authentication failed - no ticket');
	$c->send_response($daemon->response);
	return undef;   
    }

    return ($user, $group, $ticket, $update);
}

sub handle_requests {
    my $self = shift;

    my $daemon = $self->{httpdaemon};

    my $rcount = 0;

    my $sel = IO::Select->new();
    $sel->add ($daemon->{_daemon});

    my $timeout = 5;
    my @ready;
    while (1) {
	if (scalar (@ready = $sel->can_read($timeout))) {

	    if (!$daemon->{pve}->{secret} || $self->{reload_config}) {
		$self->{reload_config} = undef;
		syslog ("info", "reloading configuration")
		    if $self->{reload_config};
		$daemon->{pve}->{secret} = PVE::Utils::load_auth_secret();
	    }

	    my $c;
	    while (($c = $daemon->accept) || ($! == EINTR)) {
		next if !$c; # EINTR

		$c->timeout(5);

		$daemon->{pve}->{username} = undef;
		$daemon->{pve}->{groupname} = undef;
		$daemon->{pve}->{ticket} = undef;

		# handle requests 
		while (my $r = $c->get_request) {

		    my ($user, $group, $ticket, $update) = handle_login ($daemon, $c, $r);
		    last if !$user;

		    $daemon->{pve}->{username} = $user;
		    $daemon->{pve}->{groupname} = $group;
		    $daemon->{pve}->{ticket} = $ticket;
		    $daemon->SOAP::Transport::HTTP::Server::handle;
		    
		    if ($update) {
			$daemon->response->header ("Set-Cookie" => "PVEAuthTicket=$ticket");
		    }

		    $c->send_response($daemon->response);
		}
		$rcount++;

		# we only handle one request per connection, because
		# we want to minimize the number of connections

		$c->shutdown(2);
		$c->close();
		last;
	    }

	    last if !$c || ($rcount >= $max_requests);

	} else {
	    # timeout
	    PVE::Config::poll(); # read inotify events
	}
    }
}

package PVE::ConfigClient;

use SOAP::Lite;
use HTTP::Cookies;
use HTTP::Headers;
use PVE::Config;

my ($soaphost, $soapport) = PVE::Config::soap_host_port();

sub __create_soaplite {
    my ($timeout, $port, $ticket, $username, $password) = @_;

    my $cookie_jar = HTTP::Cookies->new (ignore_discard => 1);

    if ($ticket) {
	$cookie_jar->set_cookie(0, 'PVEAuthTicket', $ticket, '/', $soaphost);
    }
 
    my $soap = SOAP::Lite
	-> serializer (PVE::SOAPSerializer->new)
	-> ns('http://proxmox.com/PVE/ConfigServer')
	-> on_fault (sub { 
	    my($soap, $res) = @_; 
	    die ref $res ? $res->faultstring : $soap->transport->status, "\n";
	})
	-> proxy("http://$soaphost:$port", timeout => $timeout,
		 cookie_jar => $cookie_jar);

    if ($username && defined($password)) {
	$soap->proxy->credentials ("$soaphost:$port", 'PVE SOAP Server', 
				   $username, $password);
    }

    return $soap;
}

sub connect {
    my ($ticket, $cinfo, $cid) = @_;

    die "no ticket specified" if !$ticket;

    # set longet timeout for local connection
    my $timeout = $cid ? 10 : 120;

    my $port = $soapport;

    if ($cid) {
	die "invalid cluster ID '$cid'"
	    if $cid !~ m/^\d+$/;
	my $ni;
	die "no config for cluster node '$cid'"
	    if !($cinfo && ($ni = $cinfo->{"CID_$cid"}));

	$port = $ni->{configport};
    }
   
    return __create_soaplite ($timeout, $port, $ticket);
}

sub update_ticket {
    my ($ticket) = @_;

    die "no ticket specified" if !$ticket;

    
    if ($ticket !~ m/^((\S+)::\w+::\d+::[0-9a-f]{40})(::[0-9a-f]{40})?$/)  {
	die "got invalid ticket '$ticket'\n";	
    }

    $ticket = $1; # strip second checksum used by PVE::AuthCookieHandler

    my $username = $2;

    my $timeout = 120;
   
    my $soap = __create_soaplite ($timeout, $soapport, $ticket);

    my $nt = $soap->update_ticket()->result;

    if ($ticket !~ m/^${username}::\w+::\d+::[0-9a-f]{40}$/)  {
	die "got invalid ticket '$ticket'\n";
    }

    return $nt;
}

sub request_ticket {
    my ($username, $password) = @_;

    die "no username specified\n" if !$username;
    die "no password specified for user '$username'\n" if !defined ($password);

    my $timeout = 120;

    my $soap = __create_soaplite ($timeout, $soapport, undef, $username, $password);
   
    my $ticket = $soap->update_ticket()->result;

    if ($ticket !~ m/^${username}::\w+::\d+::[0-9a-f]{40}$/)  {
	die "got invalid ticket '$ticket'\n";
    }

    return $ticket
}

1;
