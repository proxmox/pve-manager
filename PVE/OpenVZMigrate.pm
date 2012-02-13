package PVE::OpenVZMigrate;

use strict;
use warnings;
use PVE::AbstractMigrate;
use File::Basename;
use File::Copy;
use PVE::Tools;
use PVE::INotify;
use PVE::Cluster;
use PVE::Storage;
use PVE::OpenVZ;

use base qw(PVE::AbstractMigrate);

# fixme: lock VM on target node

sub lock_vm {
    my ($self, $vmid, $code, @param) = @_;
    
    return PVE::OpenVZ::lock_container($vmid, $code, @param);
}

sub prepare {
    my ($self, $vmid) = @_;

    my $online = $self->{opts}->{online};

    $self->{storecfg} = PVE::Storage::config();
    $self->{vzconf} = PVE::OpenVZ::read_global_vz_config(),

    # test is VM exist
    my $conf = $self->{vmconf} = PVE::OpenVZ::load_config($vmid);

    my $path = PVE::OpenVZ::get_privatedir($conf, $vmid);
    my ($vtype, $volid) = PVE::Storage::path_to_volume_id($self->{storecfg}, $path);
    my ($storage, $volname) = PVE::Storage::parse_volume_id($volid, 1) if $volid;
   
    die "can't determine assigned storage\n" if !$storage;

    # check if storage is available on both nodes
    my $scfg = PVE::Storage::storage_check_node($self->{storecfg}, $storage);
    PVE::Storage::storage_check_node($self->{storecfg}, $storage, $self->{node});

    # we simply use the backup dir to store temporary dump files
    # Note: this is on shared storage if the storage is 'shared'
    $self->{dumpdir} = PVE::Storage::get_backup_dir($self->{storecfg}, $storage);

    PVE::Storage::activate_volumes($self->{storecfg}, [ $volid ]);

    $self->{storage} = $storage;
    $self->{privatedir} = $path;

    $self->{rootdir} = PVE::OpenVZ::get_rootdir($conf, $vmid);

    $self->{shared} = $scfg->{shared};

    my $running = 0;
    if (PVE::OpenVZ::check_running($vmid)) {
	die "cant migrate running container without --online\n" if !$online;
	$running = 1;
    }

    # fixme: test if VM uses local resources

    # test ssh connection
    my $cmd = [ @{$self->{rem_ssh}}, '/bin/true' ];
    eval { $self->cmd_quiet($cmd); };
    die "Can't connect to destination address using public key\n" if $@;

    if ($running) {

	# test if OpenVZ is running
	$cmd = [ @{$self->{rem_ssh}}, '/etc/init.d/vz status' ];
	eval { $self->cmd_quiet($cmd); };
	die "OpenVZ is not running on the target machine\n" if $@;

	# test if CPT modules are loaded for online migration
	die "vzcpt module is not loaded\n" if ! -f '/proc/cpt';

	$cmd = [ @{$self->{rem_ssh}}, 'test -f /proc/rst' ];
	eval { $self->cmd_quiet($cmd); };
	die "vzrst module is not loaded on the target machine\n" if $@;
    }

    # fixme: do we want to test if IPs exists on target node?

    return $running;
}

sub phase1 {
    my ($self, $vmid) = @_;

    $self->log('info', "starting migration of CT $self->{vmid} to node '$self->{node}' ($self->{nodeip})");

    my $conf = $self->{vmconf};

    if ($self->{running}) {
	$self->log('info', "container is running - using online migration"); 
    }

    my $cmd = [ @{$self->{rem_ssh}}, 'mkdir', '-p', $self->{rootdir} ];
    $self->cmd_quiet($cmd, errmsg => "Failed to make container root directory");

    my $privatedir = $self->{privatedir};

    if (!$self->{shared}) {

	$cmd = [ @{$self->{rem_ssh}}, 'mkdir', '-p', $privatedir ];
	$self->cmd_quiet($cmd, errmsg => "Failed to make container private directory");

	$self->{undo_private} = $privatedir;

	$self->log('info', "starting rsync phase 1");
	my $basedir = dirname($privatedir);
	$cmd = [ @{$self->{rsync_cmd}}, '--sparse', $privatedir, "root\@$self->{nodeip}:$basedir" ];
	$self->cmd($cmd, errmsg => "Failed to sync container private area");
    } else {
	$self->log('info', "container data is on shared storage '$self->{storage}'");
    }

    my $conffile = PVE::OpenVZ::config_file($vmid);
    my $newconffile = PVE::OpenVZ::config_file($vmid, $self->{node});

    my $srccfgdir = dirname($conffile);
    my $newcfgdir = dirname($newconffile);
    foreach my $s (PVE::OpenVZ::SCRIPT_EXT) {
	my $scriptfn = "${vmid}.$s";
	my $srcfn = "$srccfgdir/$scriptfn";
	next if ! -f $srcfn;
	my $dstfn = "$newcfgdir/$scriptfn";
	copy($srcfn, $dstfn) || die "copy '$srcfn' to '$dstfn' failed - $!\n";
    }

    if ($self->{running}) {
	# fixme: save state and quota
	$self->log('info', "start live migration - suspending container");
	$cmd = [ 'vzctl', '--skiplock', 'chkpnt', $vmid, '--suspend' ];
	$self->cmd_quiet($cmd, errmsg => "Failed to suspend container");

	$self->{undo_suspend} = 1;

	$self->log('info', "dump container state");
	$self->{dumpfile} = "$self->{dumpdir}/dump.$vmid";
	$cmd = [ 'vzctl', '--skiplock', 'chkpnt', $vmid, '--dump', '--dumpfile', $self->{dumpfile} ];
	$self->cmd_quiet($cmd, errmsg => "Failed to dump container state");

	if (!$self->{shared}) {
	    $self->log('info', "copy dump file to target node");
	    $self->{undo_copy_dump} = 1;
	    $cmd = [ @{$self->{scp_cmd}}, $self->{dumpfile}, "root\@$self->{nodeip}:$self->{dumpfile}"];
	    $self->cmd_quiet($cmd, errmsg => "Failed to copy dump file");

	    $self->log('info', "starting rsync (2nd pass)");
	    my $basedir = dirname($privatedir);
	    $cmd = [ @{$self->{rsync_cmd}}, $privatedir, "root\@$self->{nodeip}:$basedir" ];
	    $self->cmd($cmd, errmsg => "Failed to sync container private area");
	}
    } else {
	if (PVE::OpenVZ::check_mounted($conf, $vmid)) {
	    $self->log('info', "unmounting container");
	    $cmd = [ 'vzctl', '--skiplock', 'umount', $vmid ];
	    $self->cmd_quiet($cmd, errmsg => "Failed to umount container");
	}
    }

    my $disk_quota = $conf->{disk_quota}->{value};
    if (!defined($disk_quota) || ($disk_quota != 0)) {
	$disk_quota = $self->{disk_quota} = 1;

	$self->log('info', "dump 2nd level quota");
	$self->{quotadumpfile} = "$self->{dumpdir}/quotadump.$vmid";
	$cmd = "vzdqdump $vmid -U -G -T > " . PVE::Tools::shellquote($self->{quotadumpfile});
	$self->cmd_quiet($cmd, errmsg => "Failed to dump 2nd level quota");

	if (!$self->{shared}) {
	    $self->log('info', "copy 2nd level quota to target node");
	    $self->{undo_copy_quota_dump} = 1;
	    $cmd = [@{$self->{scp_cmd}}, $self->{quotadumpfile}, 
		    "root\@$self->{nodeip}:$self->{quotadumpfile}"];
	    $self->cmd_quiet($cmd, errmsg => "Failed to copy 2nd level quota dump");
	}
    }

    # everythin copied - make sure container is stoped
    # fixme_ do we need to start on the other node first?
    if ($self->{running}) {
	delete $self->{undo_suspend};
	$cmd = [ 'vzctl', '--skiplock', 'chkpnt', $vmid, '--kill' ];
	$self->cmd_quiet($cmd, errmsg => "Failed to kill container");
	$cmd = [ 'vzctl', '--skiplock', 'umount', $vmid ];
	sleep(1); # hack: wait - else there are open files 
	$self->cmd_quiet($cmd, errmsg => "Failed to umount container");
    }

    # move config
    die "Failed to move config to node '$self->{node}' - rename failed: $!\n"
	if !rename($conffile, $newconffile);
}

sub phase1_cleanup {
    my ($self, $vmid, $err) = @_;

    $self->log('info', "aborting phase 1 - cleanup resources");

    my $conf = $self->{vmconf};

    if ($self->{undo_suspend}) {
	my $cmd = [ 'vzctl', '--skiplock', 'chkpnt', $vmid, '--resume' ];
	$self->cmd_logerr($cmd, errmsg => "Failed to resume container");
    }

    if ($self->{undo_private}) { 
	$self->log('info', "removing copied files on target node");
	my $cmd = [ @{$self->{rem_ssh}}, 'rm', '-rf', $self->{undo_private} ];
	$self->cmd_logerr($cmd, errmsg => "Failed to remove copied files");
    }

    # fixme: that seem to be very dangerous and not needed
    #my $cmd = [ @{$self->{rem_ssh}}, 'rm', '-rf', $self->{rootdir} ];
    #eval { $self->cmd_quiet($cmd); };

    my $newconffile = PVE::OpenVZ::config_file($vmid, $self->{node});
    my $newcfgdir = dirname($newconffile);
    foreach my $s (PVE::OpenVZ::SCRIPT_EXT) {
	my $scriptfn = "${vmid}.$s";
	my $dstfn = "$newcfgdir/$scriptfn";
	if (-f $dstfn) {
	    $self->log('err', "unlink '$dstfn' failed - $!") if !unlink $dstfn; 
	}
    }
}

sub init_target_vm {
    my ($self, $vmid) = @_;

    my $conf = $self->{vmconf};

    $self->log('info', "initialize container on remote node '$self->{node}'");

    my $cmd = [ @{$self->{rem_ssh}}, 'vzctl', '--quiet', 'set', $vmid, 
		'--applyconfig_map', 'name', '--save'  ];

    $self->cmd_quiet($cmd, errmsg => "Failed to apply config on target node");

    if ($self->{disk_quota}) {
	$self->log('info', "initializing remote quota");
	$cmd = [ @{$self->{rem_ssh}}, 'vzctl', 'quotainit', $vmid];
	$self->cmd_quiet($cmd, errmsg => "Failed to initialize quota");
	$self->log('info', "turn on remote quota");
	$cmd = [ @{$self->{rem_ssh}}, 'vzctl', 'quotaon', $vmid];
	$self->cmd_quiet($cmd, errmsg => "Failed to turn on quota");
	$self->log('info', "load 2nd level quota");
	$cmd = [ @{$self->{rem_ssh}}, "(vzdqload $vmid -U -G -T < " .
		 PVE::Tools::shellquote($self->{quotadumpfile}) . 
		 " && vzquota reload2 $vmid)"];
	$self->cmd_quiet($cmd, errmsg => "Failed to load 2nd level quota");
	if (!$self->{running}) {
	    $self->log('info', "turn off remote quota");
	    $cmd = [ @{$self->{rem_ssh}}, 'vzquota', 'off', $vmid];
	    $self->cmd_quiet($cmd, errmsg => "Failed to turn off quota");
	}
    }
}

sub phase2 {
    my ($self, $vmid) = @_;

    my $conf = $self->{vmconf};

    $self->{target_initialized} = 1;
    init_target_vm($self, $vmid);

    $self->log('info', "starting container on remote node '$self->{node}'");

    $self->log('info', "restore container state");
    $self->{dumpfile} = "$self->{dumpdir}/dump.$vmid";
    my $cmd = [ @{$self->{rem_ssh}}, 'vzctl', 'restore', $vmid, '--undump', 
		'--dumpfile', $self->{dumpfile}, '--skip_arpdetect' ];
    $self->cmd_quiet($cmd, errmsg => "Failed to restore container");

    $cmd = [ @{$self->{rem_ssh}}, 'vzctl', 'restore', $vmid, '--resume' ];
    $self->cmd_quiet($cmd, errmsg => "Failed to resume container");
}

sub phase3 {
    my ($self, $vmid) = @_;

    if (!$self->{target_initialized}) {
	init_target_vm($self, $vmid);
    }

}

sub phase3_cleanup {
    my ($self, $vmid, $err) = @_;

    my $conf = $self->{vmconf};

    if (!$self->{shared}) {
	# destroy local container data
	$self->log('info', "removing container files on local node");
	my $cmd = [ 'rm', '-rf', $self->{privatedir} ];
	$self->cmd_logerr($cmd);
    }

    if ($self->{disk_quota}) {
	my $cmd = [ 'vzquota', 'drop', $vmid];
	$self->cmd_logerr($cmd, errmsg => "Failed to drop local quota");
    }
}

sub final_cleanup {
    my ($self, $vmid) = @_;

    $self->log('info', "start final cleanup");

    my $conf = $self->{vmconf};

    unlink($self->{quotadumpfile}) if $self->{quotadumpfile};

    unlink($self->{dumpfile}) if $self->{dumpfile};

    if ($self->{undo_copy_dump} && $self->{dumpfile}) {
	my $cmd = [ @{$self->{rem_ssh}}, 'rm', '-f', $self->{dumpfile} ];
	$self->cmd_logerr($cmd, errmsg => "Failed to remove dump file");
    }

    if ($self->{undo_copy_quota_dump} && $self->{quotadumpfile}) {
	my $cmd = [ @{$self->{rem_ssh}}, 'rm', '-f', $self->{quotadumpfile} ];
	$self->cmd_logerr($cmd, errmsg => "Failed to remove 2nd level quota dump file");
    }
}

1;
