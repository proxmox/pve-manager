package PVE::VZDump::OpenVZ;

use strict;
use warnings;
use File::Path;
use File::Basename;
use PVE::INotify;
use PVE::VZDump;
use PVE::OpenVZ;

use base qw (PVE::VZDump::Plugin);

my $load_vz_conf = sub {
    my ($self, $vmid) = @_;

    my $conf = PVE::OpenVZ::load_config($vmid);

    my $dir = $self->{privatedir};
    if ($conf->{ve_private} && $conf->{ve_private}->{value}) {
	$dir = $conf->{ve_private}->{value};
    }
    $dir =~ s/\$VEID/$vmid/;
    $self->{vmlist}->{$vmid}->{dir} = $dir;

    my $hostname = "CT $vmid";
    if ($conf->{hostname} && $conf->{hostname}->{value}) {
	$hostname = $conf->{hostname}->{value};
    }
    $self->{vmlist}->{$vmid}->{hostname} = $hostname;
};

my $rsync_vm = sub {
    my ($self, $task, $from, $to, $text) = @_;

    $self->loginfo ("starting $text sync $from to $to");

    my $starttime = time();

    my $opts = $self->{vzdump}->{opts};

    my $rsyncopts = "--stats -x --numeric-ids";

    $rsyncopts .= " --bwlimit=$opts->{bwlimit}" if $opts->{bwlimit};

    $self->cmd ("rsync $rsyncopts -aH --delete --no-whole-file --inplace '$from' '$to'");

    my $delay = time () - $starttime;

    $self->loginfo ("$text sync finished ($delay seconds)");
};

sub new {
    my ($class, $vzdump) = @_;
    
    PVE::VZDump::check_bin ('vzctl');

    my $self = bless PVE::OpenVZ::read_global_vz_config ();

    $self->{vzdump} = $vzdump;

    $self->{vmlist} = PVE::OpenVZ::config_list();

    return $self;
};

sub type {
    return 'openvz';
}

sub vm_status {
    my ($self, $vmid) = @_;

    my $status_text = '';
    $self->cmd ("vzctl status $vmid", outfunc => sub {$status_text .= shift; });
    chomp $status_text;

    my $running = $status_text =~ m/running/ ? 1 : 0;
   
    return wantarray ? ($running, $running ? 'running' : 'stopped') : $running; 
}

sub prepare {
    my ($self, $task, $vmid, $mode) = @_;

    $self->$load_vz_conf ($vmid);

    my $dir = $self->{vmlist}->{$vmid}->{dir};

    my $diskinfo = { dir => $dir };

    $task->{hostname} = $self->{vmlist}->{$vmid}->{hostname};

    $task->{diskinfo} = $diskinfo;

    my $hostname = PVE::INotify::nodename(); 

    if ($mode eq 'snapshot') {

	my $lvmmap = PVE::VZDump::get_lvm_mapping();
	my ($srcdev, $lvmpath, $lvmvg, $lvmlv, $fstype) =
	    PVE::VZDump::get_lvm_device ($dir, $lvmmap);

	my $targetdev = PVE::VZDump::get_lvm_device ($task->{dumpdir}, $lvmmap);

	die ("mode failure - unable to detect lvm volume group\n") if !$lvmvg;
	die ("mode failure - wrong lvm mount point '$lvmpath'\n") if $dir !~ m|/?$lvmpath/?|;
	die ("mode failure - unable to dump into snapshot (use option --dumpdir)\n") 
	    if $targetdev eq $srcdev;

	$diskinfo->{snapname} = "vzsnap-$hostname-0";
	$diskinfo->{snapdev} = "/dev/$lvmvg/$diskinfo->{snapname}";
	$diskinfo->{srcdev}  = $srcdev;
	$diskinfo->{lvmvg}   = $lvmvg;
	$diskinfo->{lvmlv}   = $lvmlv;
	$diskinfo->{fstype}  = $fstype;
	$diskinfo->{lvmpath} = $lvmpath;
	$diskinfo->{mountpoint} = "/mnt/vzsnap0";
	    
	$task->{snapdir} = $dir;
	$task->{snapdir} =~ s|/?$lvmpath/?|$diskinfo->{mountpoint}/|;
    
    } elsif ($mode eq 'suspend') {
	$task->{snapdir} = $task->{tmpdir};
    } else {
	$task->{snapdir} = $dir;
    }
}

sub lock_vm {
    my ($self, $vmid) = @_;

    my $filename = "$self->{lockdir}/103.lck";

    my $lockmgr = PVE::OpenVZ::create_lock_manager();

    $self->{lock} = $lockmgr->lock($filename) || die "can't lock VM $vmid\n";
}

sub unlock_vm {
    my ($self, $vmid) = @_;

    $self->{lock}->release();
}

sub copy_data_phase1 {
    my ($self, $task) = @_;

    $self->$rsync_vm ($task, "$task->{diskinfo}->{dir}/", $task->{snapdir}, "first");
}

# we use --skiplock for vzctl because we have already locked the VM
# by calling lock_vm()

sub stop_vm {
    my ($self, $task, $vmid) = @_;

    $self->cmd ("vzctl --skiplock stop $vmid");
}

sub start_vm {
    my ($self, $task, $vmid) = @_;

    $self->cmd ("vzctl --skiplock start $vmid");
}

sub suspend_vm {
    my ($self, $task, $vmid) = @_;

    $self->cmd ("vzctl --skiplock chkpnt $vmid --suspend");
}

sub snapshot {
    my ($self, $task) = @_;

    my $opts = $self->{vzdump}->{opts};

    my $di = $task->{diskinfo};

    mkpath $di->{mountpoint}; # create mount point for lvm snapshot

    if (-b $di->{snapdev}) {
	$self->loginfo ("trying to remove stale snapshot '$di->{snapdev}'");
	    
	$self->cmd_noerr ("umount $di->{mountpoint}");
	    
	$self->cmd_noerr ("lvremove -f $di->{snapdev}");
    }

    $self->loginfo ("creating lvm snapshot of $di->{srcdev} ('$di->{snapdev}')");

    $task->{cleanup}->{lvm_snapshot} = 1;
	
    $self->cmd ("lvcreate --size $opts->{size}M --snapshot" .
		" --name $di->{snapname} /dev/$di->{lvmvg}/$di->{lvmlv}");

    my $mopts = $di->{fstype} eq 'xfs' ? "-o nouuid" : '';

    $task->{cleanup}->{snapshot_mount} = 1;

    $self->cmd ("mount -t $di->{fstype} $mopts $di->{snapdev} $di->{mountpoint}");
}

sub copy_data_phase2 {
    my ($self, $task) = @_;

    $self->$rsync_vm ($task, "$task->{diskinfo}->{dir}/", $task->{snapdir}, "final");
}

sub resume_vm {
    my ($self, $task, $vmid) = @_;

    $self->cmd ("vzctl --skiplock chkpnt $vmid --resume");
}

sub assemble {
    my ($self, $task, $vmid) = @_;

    my $conffile = PVE::OpenVZ::config_file($vmid);

    my $dir = $task->{snapdir};

    $task->{cleanup}->{etc_vzdump} = 1;
	
    mkpath "$dir/etc/vzdump/";
    $self->cmd ("cp '$conffile' '$dir/etc/vzdump/vps.conf'");
    my $cfgdir = dirname ($conffile);
    foreach my $s (PVE::OpenVZ::SCRIPT_EXT) {
	my $fn = "$cfgdir/$vmid.$s";
	$self->cmd ("cp '$fn' '$dir/etc/vzdump/vps.$s'") if -f $fn;
    } 
}

sub archive {
    my ($self, $task, $vmid, $filename, $comp) = @_;
    
    my $findexcl = $self->{vzdump}->{findexcl};
    my $findargs = join (' ', @$findexcl) . ' -print0';
    my $opts = $self->{vzdump}->{opts};

    my $srcdir = $self->{vmlist}->{$vmid}->{dir};
    my $snapdir = $task->{snapdir};

    my $taropts = "--totals --sparse --numeric-owner --no-recursion --ignore-failed-read --one-file-system";

    # note: --remove-files does not work because we do not 
    # backup all files (filters). tar complains:
    # Cannot rmdir: Directory not empty
    # we we disable this optimization for now
    #if ($snapdir eq $task->{tmpdir} && $snapdir =~ m|^$opts->{dumpdir}/|) {
    #       $taropts .= " --remove-files"; # try to save space
    #}

    my $cmd = "(";

    $cmd .= "cd $snapdir;find . $findargs|sed 's/\\\\/\\\\\\\\/g'|";
    $cmd .= "tar cpf - $taropts --null -T -";
    my $bwl = $opts->{bwlimit}*1024; # bandwidth limit for cstream
    $cmd .= "|cstream -t $bwl" if $opts->{bwlimit};
    $cmd .= "|$comp" if $comp;

    $cmd .= ")";

    if ($opts->{stdout}) {
	$self->cmd ($cmd, output => ">&=" . fileno($opts->{stdout}));
    } else {
	$self->cmd ("$cmd >$filename");
    }
}

sub cleanup {
    my ($self, $task, $vmid) = @_;

    my $di = $task->{diskinfo};

    if ($task->{cleanup}->{snapshot_mount}) {
	$self->cmd_noerr ("umount $di->{mountpoint}");
    }

    if ($task->{cleanup}->{lvm_snapshot}) {
	# loop, because we often get 'LV in use: not deactivating'
	# we use run_command() because we do not want to log errors here
	my $wait = 1;
	while(-b $di->{snapdev}) {
	    eval { 
		my $cmd = ['lvremove', '-f', $di->{snapdev}];
		PVE::Tools::run_command($cmd, outfunc => sub {}, errfunc => sub {});
	    };
	    last if !$@;
	    if ($wait >= 64) {
		$self->logerr($@);
		last;
	    }
	    $self->loginfo("lvremove failed - trying again in $wait seconds") if $wait >= 8;
	    sleep($wait);
	    $wait = $wait*2;
	}

    }

    if ($task->{cleanup}->{etc_vzdump}) {
	my $dir = "$task->{snapdir}/etc/vzdump";
	eval { rmtree $dir if -d $dir; };
	$self->logerr ($@) if $@;
    }

}

1;
