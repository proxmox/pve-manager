package PVE::VZDump::OpenVZ;

#    Copyright (C) 2007-2009 Proxmox Server Solutions GmbH
#
#    Copyright: vzdump is under GNU GPL, the GNU General Public License.
#
#    This program is free software; you can redistribute it and/or modify
#    it under the terms of the GNU General Public License as published by
#    the Free Software Foundation; version 2 dated June, 1991.
#
#    This program is distributed in the hope that it will be useful,
#    but WITHOUT ANY WARRANTY; without even the implied warranty of
#    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
#    GNU General Public License for more details.
#
#    You should have received a copy of the GNU General Public License
#    along with this program; if not, write to the
#    Free Software Foundation, Inc., 51 Franklin St, Fifth Floor, Boston,
#    MA 02110-1301, USA.
#
#    Author: Dietmar Maurer <dietmar@proxmox.com>

use strict;
use warnings;
use File::Path;
use File::Basename;
use PVE::VZDump;
use Sys::Hostname;
use LockFile::Simple;

use base qw (PVE::VZDump::Plugin);

use constant SCRIPT_EXT => qw (start stop mount umount);
use constant VZDIR => '/etc/vz';

my $remove_quotes = sub {
    my $str = shift;

    $str =~ s/^\s*\"?//;
    $str =~ s/\"?\s*$//;

    return $str;
};

# read global vz.conf
sub read_global_vz_config {

    local $/;

    my $res = {
	rootdir => '/vz/root/$VEID', # note '$VEID' is a place holder
	privatedir => '/vz/private/$VEID', # note '$VEID' is a place holder
	dumpdir => '/vz/dump',
	lockdir => '/var/lib/vz/lock',
    };
    
    my $filename = VZDIR . "/vz.conf";

    my $fh = IO::File->new ($filename, "r");
    return $res if !$fh;
    my $data = <$fh> || '';
    $fh->close();

    if ($data =~ m/^\s*VE_PRIVATE=(.*)$/m) {
	my $dir = &$remove_quotes ($1);
	if ($dir !~ m/\$VEID/) {
	    warn "VE_PRIVATE does not contain '\$VEID' ('$dir')\n";
	} else {
	    $res->{privatedir} = $dir;
	}
    }
    if ($data =~ m/^\s*VE_ROOT=(.*)$/m) {
	my $dir = &$remove_quotes ($1);
	if ($dir !~ m/\$VEID/) {
	    warn "VE_ROOT does not contain '\$VEID' ('$dir')\n";
	} else {
	    $res->{rootdir} = $dir;
	}
    }
    if ($data =~ m/^\s*DUMPDIR=(.*)$/m) {
	my $dir = &$remove_quotes ($1);
	$dir =~ s|/\$VEID$||;
	$res->{dumpdir} = $dir;
    }
    if ($data =~ m/^\s*LOCKDIR=(.*)$/m) {
	my $dir = &$remove_quotes ($1);
	$res->{lockdir} = $dir;
    }

    return $res;
}

my $load_vz_conf = sub {
    my ($self, $vmid) = @_;

    local $/;

    my $conf = $self->{vmlist}->{$vmid}->{conffile};

    my $fh = IO::File->new ($conf, "r") ||
	die "unable to open config file '$conf'\n";
    my $data = <$fh>;
    $fh->close();

    my $dir;
    if ($data =~ m/^\s*VE_PRIVATE=(.*)$/m) {
	$dir = &$remove_quotes ($1);
    } else {
	$dir = $self->{privatedir};
    }
    $dir =~ s/\$VEID/$vmid/;
    $self->{vmlist}->{$vmid}->{dir} = $dir;

    if ($data =~ m/^\s*HOSTNAME=(.*)/m) {
	$self->{vmlist}->{$vmid}->{hostname} = &$remove_quotes ($1);
    } else {
	$self->{vmlist}->{$vmid}->{hostname} = "VM $vmid";
    }
};

sub read_vz_list {

    my $vmlist = {};

    my $dir = VZDIR . "/conf";
    foreach my $conf (<$dir/*.conf>) {

	next if $conf !~ m|/(\d\d\d+)\.conf$|;

	my $vmid = $1;

	$vmlist->{$vmid}->{conffile} = $conf;
    }

    return $vmlist;
}

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

    my $self = bless read_global_vz_config ();

    $self->{vzdump} = $vzdump;

    $self->{vmlist} = read_vz_list ();

    return $self;
};

sub type {
    return 'openvz';
}

sub vm_status {
    my ($self, $vmid) = @_;

    my $status_text = $self->cmd ("vzctl status $vmid");
    chomp $status_text;

    my $running = $status_text =~ m/running/ ? 1 : 0;
   
    return wantarray ? ($running, $status_text) : $running; 
}

sub prepare {
    my ($self, $task, $vmid, $mode) = @_;

    $self->$load_vz_conf ($vmid);

    my $dir = $self->{vmlist}->{$vmid}->{dir};

    my $diskinfo = { dir => $dir };

    $task->{hostname} = $self->{vmlist}->{$vmid}->{hostname};

    $task->{diskinfo} = $diskinfo;

    my $hostname = hostname(); 

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

    my $lockmgr = LockFile::Simple->make(-format => '%f',
					 -autoclean => 1,
					 -max => 30, 
					 -delay => 2, 
					 -stale => 1,
					 -nfs => 0);

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

    my $conffile = $self->{vmlist}->{$vmid}->{conffile};

    my $dir = $task->{snapdir};

    $task->{cleanup}->{etc_vzdump} = 1;
	
    mkpath "$dir/etc/vzdump/";
    $self->cmd ("cp '$conffile' '$dir/etc/vzdump/vps.conf'");
    my $cfgdir = dirname ($conffile);
    foreach my $s (SCRIPT_EXT) {
	my $fn = "$cfgdir/$vmid.$s";
	$self->cmd ("cp '$fn' '$dir/etc/vzdump/vps.$s'") if -f $fn;
    } 
}

sub archive {
    my ($self, $task, $vmid, $filename) = @_;
    
    my $findexcl = $self->{vzdump}->{findexcl};
    my $findargs = join (' ', @$findexcl) . ' -print0';
    my $opts = $self->{vzdump}->{opts};

    my $srcdir = $self->{vmlist}->{$vmid}->{dir};
    my $snapdir = $task->{snapdir};

    my $zflag = $opts->{compress} ? 'z' : '';

    my $taropts = "--totals --sparse --numeric-owner --no-recursion --ignore-failed-read --one-file-system";

    if ($snapdir eq $task->{tmpdir} && $snapdir =~ m|^$opts->{dumpdir}/|) {
	$taropts .= " --remove-files"; # try to save space
    }

    my $cmd = "(";
    $cmd .= "cd $snapdir;find . $findargs|sed 's/\\\\/\\\\\\\\/g'|";
    $cmd .= "tar c${zflag}pf - $taropts --null -T -";

    if ($opts->{bwlimit}) {
	my $bwl = $opts->{bwlimit}*1024; # bandwidth limit for cstream
	$cmd .= "|cstream -t $bwl";
    }

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
	$self->cmd_noerr ("lvremove -f $di->{snapdev}") if -b $di->{snapdev};
    }

    if ($task->{cleanup}->{etc_vzdump}) {
	my $dir = "$task->{snapdir}/etc/vzdump";
	eval { rmtree $dir if -d $dir; };
	$self->logerr ($@) if $@;
    }

}

1;
