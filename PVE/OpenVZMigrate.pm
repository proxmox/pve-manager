package PVE::OpenVZMigrate;

use strict;
use warnings;
use POSIX qw(strftime);
use File::Basename;
use File::Copy;
use IO::File;
use IPC::Open2;
use PVE::Tools;
use PVE::INotify;
use PVE::Cluster;
use PVE::Storage;
use PVE::OpenVZ;

my $delayed_interrupt = 0;

# blowfish is a fast block cipher, much faster then 3des
my @ssh_opts = ('-c', 'blowfish', '-o', 'BatchMode=yes');
my @ssh_cmd = ('/usr/bin/ssh', @ssh_opts);
my @scp_cmd = ('/usr/bin/scp', @ssh_opts);
my @rsync_opts = ('-aH', '--delete', '--numeric-ids');
my @rsync_cmd = ('/usr/bin/rsync', @rsync_opts);

sub msg2text {
    my ($level, $msg) = @_;

    chomp $msg;

    return '' if !$msg;

    my $res = '';

    my $tstr = strftime("%b %d %H:%M:%S", localtime);

    foreach my $line (split (/\n/, $msg)) {
	if ($level eq 'err') {
	    $res .= "$tstr ERROR: $line\n";
	} else {
	    $res .= "$tstr $line\n";
	}
    }

    return $res;
}

sub logmsg {
    my ($level, $msg) = @_;

    chomp $msg;

    return if !$msg;

    print msg2text($level, $msg);
}

sub run_command {
    my ($cmd, %param) = @_;

    my $logfunc = sub {
	my $line = shift;
	logmsg('info', $line);
    };

    logmsg('info', "# " . PVE::Tools::cmd2string($cmd));

    PVE::Tools::run_command($cmd, %param, outfunc => $logfunc, errfunc => $logfunc);
}

sub run_command_quiet_full {
    my ($cmd, $logerr, %param) = @_;

    my $log = '';
    my $logfunc = sub {
	my $line = shift;
	$log .= msg2text('info', $line);;
    };

    eval { PVE::Tools::run_command($cmd, %param, outfunc => $logfunc, errfunc => $logfunc); };
    if (my $err = $@) {
	logmsg('info', "# " . PVE::Tools::cmd2string($cmd));
	print $log;
	if ($logerr) {
	    logmsg('err', $err);
	} else {
	    die $err;
	}
    }
}

sub run_command_quiet {
    my ($cmd, %param) = @_;
    return run_command_quiet_full($cmd, 0, %param);
}

sub run_command_logerr {
    my ($cmd, %param) = @_;
    return run_command_quiet_full($cmd, 1, %param);
}

sub eval_int {
    my ($func) = @_;

    eval {
	local $SIG{INT} = $SIG{TERM} = $SIG{QUIT} = $SIG{HUP} = sub {
	    $delayed_interrupt = 0;
	    die "interrupted by signal\n";
	};
	local $SIG{PIPE} = sub {
	    $delayed_interrupt = 0;
	    die "interrupted by signal\n";
	};

	my $di = $delayed_interrupt;
	$delayed_interrupt = 0;

	die "interrupted by signal\n" if $di;

	&$func();
    };
}

sub migrate {
    my ($node, $nodeip, $vmid, $online) = @_;

    my $starttime = time();

    my $rem_ssh = 

    local $ENV{RSYNC_RSH} = join(' ', @ssh_cmd);

    local $SIG{INT} = $SIG{TERM} = $SIG{QUIT} = $SIG{HUP} = $SIG{PIPE} = sub {
	logmsg('err', "received interrupt - delayed");
	$delayed_interrupt = 1;
    };

    local $ENV{RSYNC_RSH} = join(' ', @ssh_cmd);

    my $session = {
	vmid => $vmid,
	node => $node,
	nodeip => $nodeip,
	storecfg => PVE::Storage::config(),
	vzconf => PVE::OpenVZ::read_global_vz_config(),
	rem_ssh => [@ssh_cmd, "root\@$nodeip"],
    };
    
    my $errors;

    # lock container during migration
    eval { PVE::OpenVZ::lock_container($vmid, sub {

	eval_int(sub { prepare($session, $vmid, $online); });
	die $@ if $@;

	my $rhash = {};

	eval_int (sub { phase1($session, $vmid, $session->{vmconf}, $rhash, $session->{running}); });
	my $err = $@;
	if ($err) {
	    logmsg('err', $err);
	    eval { phase1_cleanup($session, $vmid, $session->{vmconf}, $rhash, $session->{running}); };
	    if (my $tmperr = $@) {
		logmsg('err', $tmperr);
	    }
	    eval { final_cleanup($session, $vmid, $session->{vmconf}); };
	    if (my $tmperr = $@) {
		logmsg('err', $tmperr);
	    }
	    die $err;
	}

	# vm is now owned by other node
	# Note: there is no VM config file on the local node anymore

	if ($session->{running}) {

	    $rhash = {};
	    eval_int(sub { phase2($session, $vmid, $session->{vmconf}, $rhash); });
	    my $phase2err = $@;
	    if ($phase2err) {
		$errors = 1;
		logmsg('err', "online migrate failure - $phase2err");
	    }
	    eval { phase2_cleanup($session, $vmid, $session->{vmconf}, $rhash, $phase2err); };
	    if (my $err = $@) {
		logmsg('err', $err);
		$errors = 1;
	    }

	    # always stop local VM - no interrupts possible
	    eval { phase2_stop_vm($session, $vmid, $session->{vmconf}) };
	    if (my $err = $@) {
		logmsg('err', "stopping vm failed - $err");
		$errors = 1;
	    }
	}

	# phase3 (finalize) 
	$rhash = {};
	eval_int(sub { phase3($session, $vmid, $session->{vmconf}, $rhash); });
	my $phase3err = $@;
	if ($phase3err) {
	    logmsg('err', $phase3err);
	    $errors = 1;
	}
	eval { phase3_cleanup($session, $vmid, $session->{vmconf}, $rhash, $phase3err); };
	if (my $err = $@) {
	    logmsg('err', $err);
	    $errors = 1;
	}
	eval { final_cleanup($session, $vmid, $session->{vmconf}); };
	if (my $tmperr = $@) {
	    logmsg('err', $tmperr);
	}
    })};

    my $err = $@;

    my $delay = time() - $starttime;
    my $mins = int($delay/60);
    my $secs = $delay - $mins*60;
    my $hours =  int($mins/60);
    $mins = $mins - $hours*60;

    my $duration = sprintf "%02d:%02d:%02d", $hours, $mins, $secs;

    if ($err) {
	logmsg('err', "migration aborted (duration $duration): $err");
	die "migration aborted\n";
    }

    if ($errors) {
	logmsg('err', "migration finished with problems (duration $duration)");
	die "migration problems\n"
    }

    logmsg('info', "migration finished successfuly (duration $duration)");

}

sub prepare {
    my ($session, $vmid, $online) = @_;

    # test is VM exist
    my $conf = $session->{vmconf} = PVE::OpenVZ::load_config($vmid);

    my $path = PVE::OpenVZ::get_privatedir($conf, $vmid);
    my ($vtype, $volid) = PVE::Storage::path_to_volume_id($session->{storecfg}, $path);
    my ($storage, $volname) = PVE::Storage::parse_volume_id($volid, 1) if $volid;
   
    die "can't determine assigned storage\n" if !$storage;

    # check if storage is available on both nodes
    my $scfg = PVE::Storage::storage_check_node($session->{storecfg}, $storage);
    PVE::Storage::storage_check_node($session->{storecfg}, $storage, $session->{node});

    # we simply use the backup dir to store temporary dump files
    # Note: this is on shared storage if the storage is 'shared'
    $session->{dumpdir} = PVE::Storage::get_backup_dir($session->{storecfg}, $storage);

    PVE::Storage::activate_volumes($session->{storecfg}, [ $volid ]);

    $session->{storage} = $storage;
    $session->{privatedir} = $path;

    $session->{rootdir} = PVE::OpenVZ::get_rootdir($conf, $vmid);

    $session->{shared} = $scfg->{shared};

    $session->{running} = 0;
    if (PVE::OpenVZ::check_running($vmid)) {
	die "cant migrate running container without --online\n" if !$online;
	$session->{running} = 1;
    }

    # fixme: test if VM uses local resources

    # test ssh connection
    my $cmd = [ @{$session->{rem_ssh}}, '/bin/true' ];
    eval { run_command_quiet($cmd); };
    die "Can't connect to destination address using public key\n" if $@;

    if ($session->{running}) {

	# test if OpenVZ is running
	$cmd = [ @{$session->{rem_ssh}}, '/etc/init.d/vz status' ];
	eval { run_command_quiet($cmd); };
	die "OpenVZ is not running on the target machine\n" if $@;

	# test if CPT modules are loaded for online migration
	die "vzcpt module is not loaded\n" if ! -f '/proc/cpt';

	$cmd = [ @{$session->{rem_ssh}}, 'test -f /proc/rst' ];
	eval { run_command_quiet($cmd); };
	die "vzrst module is not loaded on the target machine\n" if $@;
    }

    # fixme: do we want to test if IPs exists on target node?
}

sub phase1 {
    my ($session, $vmid, $conf, $rhash, $running) = @_;

    logmsg('info', "starting migration of CT $session->{vmid} to node '$session->{node}' ($session->{nodeip})");

    if ($running) {
	logmsg('info', "container is running - using online migration"); 
    }

    my $cmd = [ @{$session->{rem_ssh}}, 'mkdir', '-p', $session->{rootdir} ];
    run_command_quiet($cmd, errmsg => "Failed to make container root directory");

    my $privatedir = $session->{privatedir};

    if (!$session->{shared}) {

	$cmd = [ @{$session->{rem_ssh}}, 'mkdir', '-p', $privatedir ];
	run_command_quiet($cmd, errmsg => "Failed to make container private directory");

	$rhash->{undo_private} = $privatedir;

	logmsg('info', "starting rsync phase 1");
	my $basedir = dirname($privatedir);
	$cmd = [ @rsync_cmd, '--sparse', $privatedir, "root\@$session->{nodeip}:$basedir" ];
	run_command($cmd, errmsg => "Failed to sync container private area");
    } else {
	logmsg('info', "container data is on shared storage '$session->{storage}'");
    }

    my $conffile = PVE::OpenVZ::config_file($vmid);
    my $newconffile = PVE::OpenVZ::config_file($vmid, $session->{node});

    my $srccfgdir = dirname($conffile);
    my $newcfgdir = dirname($newconffile);
    foreach my $s (PVE::OpenVZ::SCRIPT_EXT) {
	my $scriptfn = "${vmid}.$s";
	my $srcfn = "$srccfgdir/$scriptfn";
	next if ! -f $srcfn;
	my $dstfn = "$newcfgdir/$scriptfn";
	copy($srcfn, $dstfn) || die "copy '$srcfn' to '$dstfn' failed - $!\n";
    }

    if ($running) {
	# fixme: save state and quota
	logmsg('info', "start live migration - suspending container");
	$cmd = [ 'vzctl', '--skiplock', 'chkpnt', $vmid, '--suspend' ];
	run_command_quiet($cmd, errmsg => "Failed to suspend container");

	$rhash->{undo_suspend} = 1;

	logmsg('info', "dump container state");
	$session->{dumpfile} = "$session->{dumpdir}/dump.$vmid";
	$cmd = [ 'vzctl', '--skiplock', 'chkpnt', $vmid, '--dump', '--dumpfile', $session->{dumpfile} ];
	run_command_quiet($cmd, errmsg => "Failed to dump container state");

	if (!$session->{shared}) {
	    logmsg('info', "copy dump file to target node");
	    $session->{undo_copy_dump} = 1;
	    $cmd = [@scp_cmd, $session->{dumpfile}, "root\@$session->{nodeip}:$session->{dumpfile}"];
	    run_command_quiet($cmd, errmsg => "Failed to copy dump file");

	    logmsg('info', "starting rsync (2nd pass)");
	    my $basedir = dirname($privatedir);
	    $cmd = [ @rsync_cmd, $privatedir, "root\@$session->{nodeip}:$basedir" ];
	    run_command($cmd, errmsg => "Failed to sync container private area");
	}
    } else {
	if (PVE::OpenVZ::check_mounted($conf, $vmid)) {
	    logmsg('info', "unmounting container");
	    $cmd = [ 'vzctl', '--skiplock', 'umount', $vmid ];
	    run_command_quiet($cmd, errmsg => "Failed to umount container");
	}
    }

    my $disk_quota = $conf->{disk_quota}->{value};
    if (!defined($disk_quota) || ($disk_quota != 0)) {
	$disk_quota = $session->{disk_quota} = 1;

	logmsg('info', "dump 2nd level quota");
	$session->{quotadumpfile} = "$session->{dumpdir}/quotadump.$vmid";
	$cmd = "vzdqdump $vmid -U -G -T > " . PVE::Tools::shellquote($session->{quotadumpfile});
	run_command_quiet($cmd, errmsg => "Failed to dump 2nd level quota");

	if (!$session->{shared}) {
	    logmsg('info', "copy 2nd level quota to target node");
	    $session->{undo_copy_quota_dump} = 1;
	    $cmd = [@scp_cmd, $session->{quotadumpfile}, "root\@$session->{nodeip}:$session->{quotadumpfile}"];
	    run_command_quiet($cmd, errmsg => "Failed to copy 2nd level quota dump");
	}
    }

    # everythin copied - make sure container is stoped
    # fixme_ do we need to start on the other node first?
    if ($running) {
	delete $rhash->{undo_suspend};
	$cmd = [ 'vzctl', '--skiplock', 'chkpnt', $vmid, '--kill' ];
	run_command_quiet($cmd, errmsg => "Failed to kill container");
	$cmd = [ 'vzctl', '--skiplock', 'umount', $vmid ];
	run_command_quiet($cmd, errmsg => "Failed to umount container");
    }

    # move config
    die "Failed to move config to node '$session->{node}' - rename failed: $!\n"
	if !rename($conffile, $newconffile);
}

# only called if there are errors in phase1
sub phase1_cleanup {
    my ($session, $vmid, $conf, $rhash, $running) = @_;

    logmsg('info', "aborting phase 1 - cleanup resources");

    if ($rhash->{undo_suspend}) {
	my $cmd = [ 'vzctl', '--skiplock', 'chkpnt', $vmid, '--resume' ];
	run_command_logerr($cmd, errmsg => "Failed to resume container");
    }

    if ($rhash->{undo_private}) { 
	logmsg('info', "removing copied files on target node");
	my $cmd = [ @{$session->{rem_ssh}}, 'rm', '-rf', $rhash->{undo_private} ];
	run_command_logerr($cmd, errmsg => "Failed to remove copied files");
    }

    # fixme: that seem to be very dangerous and not needed
    #my $cmd = [ @{$session->{rem_ssh}}, 'rm', '-rf', $session->{rootdir} ];
    #eval { run_command_quiet($cmd); };

    my $newconffile = PVE::OpenVZ::config_file($vmid, $session->{node});
    my $newcfgdir = dirname($newconffile);
    foreach my $s (PVE::OpenVZ::SCRIPT_EXT) {
	my $scriptfn = "${vmid}.$s";
	my $dstfn = "$newcfgdir/$scriptfn";
	if (-f $dstfn) {
	    logmsg('err', "unlink '$dstfn' failed - $!") if !unlink $dstfn; 
	}
    }
}

sub init_target_vm {
    my ($session, $vmid, $conf) = @_;

    logmsg('info', "initialize container on remote node '$session->{node}'");

    my $cmd = [ @{$session->{rem_ssh}}, 'vzctl', '--quiet', 'set', $vmid, 
		'--applyconfig_map', 'name', '--save'  ];

    run_command_quiet($cmd, errmsg => "Failed to apply config on target node");

    if ($session->{disk_quota}) {
	logmsg('info', "initializing remote quota");
	$cmd = [ @{$session->{rem_ssh}}, 'vzctl', 'quotainit', $vmid];
	run_command_quiet($cmd, errmsg => "Failed to initialize quota");
	logmsg('info', "turn on remote quota");
	$cmd = [ @{$session->{rem_ssh}}, 'vzctl', 'quotaon', $vmid];
	run_command_quiet($cmd, errmsg => "Failed to turn on quota");
	logmsg('info', "load 2nd level quota");
	$cmd = [ @{$session->{rem_ssh}}, "(vzdqload $vmid -U -G -T < " .
		 PVE::Tools::shellquote($session->{quotadumpfile}) . 
		 " && vzquota reload2 $vmid)"];
	run_command_quiet($cmd, errmsg => "Failed to load 2nd level quota");
	if (!$session->{running}) {
	    logmsg('info', "turn off remote quota");
	    $cmd = [ @{$session->{rem_ssh}}, 'vzquota', 'off', $vmid];
	    run_command_quiet($cmd, errmsg => "Failed to turn off quota");
	}
    }
}

# only called when VM is running
sub phase2 {
    my ($session, $vmid, $conf, $rhash) = @_;

    $session->{target_initialized} = 1;
    init_target_vm($session, $vmid, $conf);

    logmsg('info', "starting container on remote node '$session->{node}'");

    logmsg('info', "restore container state");
    $session->{dumpfile} = "$session->{dumpdir}/dump.$vmid";
    my $cmd = [ @{$session->{rem_ssh}}, 'vzctl', 'restore', $vmid, '--undump', 
		'--dumpfile', $session->{dumpfile}, '--skip_arpdetect' ];
    run_command_quiet($cmd, errmsg => "Failed to restore container");

    $cmd = [ @{$session->{rem_ssh}}, 'vzctl', 'restore', $vmid, '--resume' ];
    run_command_quiet($cmd, errmsg => "Failed to resume container");
}

sub phase2_cleanup {
    my ($session, $vmid, $conf, $rhash, $err) = @_;

};

sub phase2_stop_vm {
    my ($session, $vmid, $conf, $rhash);

}

# finalize
sub phase3 {
    my ($session, $vmid, $conf, $rhash) = @_;

    if (!$session->{target_initialized}) {
	init_target_vm($session, $vmid, $conf);
    }

}

# phase3 cleanup 
sub phase3_cleanup {
    my ($session, $vmid, $conf, $rhash, $err) = @_;

    if (!$session->{shared}) {
	# destroy local container data
	logmsg('info', "removing container files on local node");
	my $cmd = [ 'rm', '-rf', $session->{privatedir} ];
	run_command_logerr($cmd);
    }

    if ($session->{disk_quota}) {
	my $cmd = [ 'vzquota', 'drop', $vmid];
	run_command_logerr($cmd, errmsg => "Failed to drop local quota");
    }
}

# final cleanup - always called
sub final_cleanup {
    my ($session, $vmid, $conf) = @_;

    logmsg('info', "start final cleanup");

    unlink($session->{quotadumpfile}) if $session->{quotadumpfile};

    unlink($session->{dumpfile}) if $session->{dumpfile};

    if ($session->{undo_copy_dump} && $session->{dumpfile}) {
	my $cmd = [ @{$session->{rem_ssh}}, 'rm', '-f', $session->{dumpfile} ];
	run_command_logerr($cmd, errmsg => "Failed to remove dump file");
    }

    if ($session->{undo_copy_quota_dump} && $session->{quotadumpfile}) {
	my $cmd = [ @{$session->{rem_ssh}}, 'rm', '-f', $session->{quotadumpfile} ];
	run_command_logerr($cmd, errmsg => "Failed to remove 2nd level quota dump file");
    }

}

1;
