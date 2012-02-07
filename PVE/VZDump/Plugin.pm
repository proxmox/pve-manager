package PVE::VZDump::Plugin;

use strict;
use warnings;
use PVE::VZDump;

sub set_logfd {
    my ($self, $logfd) = @_;

    $self->{logfd} = $logfd;
}

sub cmd {
    my ($self, $cmdstr, %param) = @_;

    return PVE::VZDump::run_command($self->{logfd}, $cmdstr, %param);   
}

sub cmd_noerr {
    my ($self, $cmdstr, %param) = @_;

    my $res;
    eval { $res = $self->cmd($cmdstr, %param); };
    $self->logerr ($@) if $@;
    return $res;
}

sub loginfo {
    my ($self, $msg) = @_;

    PVE::VZDump::debugmsg('info', $msg, $self->{logfd}, 0);
}

sub logerr {
    my ($self, $msg) = @_;

    PVE::VZDump::debugmsg('err', $msg, $self->{logfd}, 0);
}

sub type {
    return 'unknown';
};

sub vmlist {
    my ($self) = @_;

    return [ keys %{$self->{vmlist}} ] if $self->{vmlist};

    return [];
}

sub vm_status {
    my ($self, $vmid) = @_;

    die "internal error"; # implement in subclass
}

sub prepare {
    my ($self, $task, $vmid, $mode) = @_;

    die "internal error"; # implement in subclass
}

sub lock_vm {
    my ($self, $vmid) = @_;

    die "internal error"; # implement in subclass
}

sub unlock_vm {
    my ($self, $vmid) = @_;

    die "internal error"; # implement in subclass
}

sub stop_vm {
    my ($self, $task, $vmid) = @_;

    die "internal error"; # implement in subclass
}

sub start_vm {
    my ($self, $task, $vmid) = @_;

    die "internal error"; # implement in subclass
}

sub suspend_vm {
    my ($self, $task, $vmid) = @_;

    die "internal error"; # implement in subclass
}

sub resume_vm {
    my ($self, $task, $vmid) = @_;

    die "internal error"; # implement in subclass
}

sub snapshot {
    my ($self, $task, $vmid) = @_;

    die "internal error"; # implement in subclass
}

sub copy_data_phase2 {
    my ($self, $task, $vmid) = @_;

    die "internal error"; # implement in subclass
}

sub assemble {
    my ($self, $task, $vmid) = @_;

    die "internal error"; # implement in subclass
}

sub archive {
    my ($self, $task, $vmid, $filename, $comp) = @_;

    die "internal error"; # implement in subclass
}

sub cleanup {
    my ($self, $task, $vmid) = @_;

    die "internal error"; # implement in subclass
}

1;
