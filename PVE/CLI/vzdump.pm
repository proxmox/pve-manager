package PVE::CLI::vzdump;

use strict;
use warnings;

use PVE::CLIHandler;
use PVE::API2::VZDump;

use base qw(PVE::CLIHandler);

# Note: use string 'vmid' as $arg_param option, to allow vmid lists
our $cmddef = [ 'PVE::API2::VZDump', 'vzdump', 'vmid', undef,
		sub {
		    my $upid = shift;
		    exit(0) if $upid eq 'OK';
		    my $status = PVE::Tools::upid_read_status($upid);
		    exit($status eq 'OK' ? 0 : -1);
		}];

1;

__END__

=head1 NAME

vzdump - backup utility for virtual machine

=head1 SYNOPSIS

=include synopsis

=head1 DESCRIPTION

vzdump is an utility to make consistent snapshots of running virtual
machines (VMs). It basically creates an archive of the VM private area,
which also includes the VM configuration files. vzdump currently
supports LXC containers and QemuServer VMs.

There are several ways to provide consistency (option C<mode>):

=over 2

=item C<stop> mode

Stop the VM during backup. This results in a very long downtime.

=item C<suspend> mode

For containers, this mode uses rsync to copy the VM to a temporary
location (see option --tmpdir). Then the VM is suspended and a second
rsync copies changed files. After that, the VM is started (resume)
again. This results in a minimal downtime, but needs additional space
to hold the VM copy.

For QemuServer, this mode will suspend the VM, start
a live backup, and resume the VM.

=item C<snapshot> mode

For containers, this mode uses the snapshotting facilities of the underlying
storage. A snapshot will be made of the container volume, and the snapshot content
will be archived in a tar file.

For QemuServer, this mode will do a live backup similar to the C<snaphost> mode, but without
suspending/resuming the VM.

=back

A technical overview of the Proxmox VE live backup for QemuServer can be found online at:
https://git.proxmox.com/?p=pve-qemu-kvm.git;a=blob;f=backup.txt

=head1 BACKUP FILE NAMES

Newer version of vzdump encodes the virtual machine type and the
backup time into the filename, for example

 vzdump-lxc-105-2009_10_09-11_04_43.tar

That way it is possible to store several backup into the same
directory. The parameter C<maxfiles> can be used to specify the maximal
number of backups to keep.

=head1 RESTORE

The resulting archive files can be restored with the following programs.

=over 1

=item pct restore: Containers restore utility

=item qmrestore: QemuServer restore utility

=back

For details see the corresponding manual pages.

=head1 CONFIGURATION

Global configuration is stored in /etc/vzdump.conf.

 tmpdir: DIR
 dumpdir: DIR
 storage: STORAGE_ID
 mode: snapshot|suspend|stop
 bwlimit: KBPS
 ionize: PRI
 lockwait: MINUTES
 stopwait: MINUTES
 size: MB
 maxfiles: N
 script: FILENAME
 exclude-path: PATHLIST

=head1 HOOK SCRIPT

You can specify a hook script with option C<--script>. This script is called at various phases of the backup process, with parameters accordingly set. You can find an example in the documentation directory (C<vzdump-hook-script.pl>).

=head1 EXCLUSIONS (Containers only)

vzdump skips the following files wit option --stdexcludes

 /var/log/?*
 /tmp/?*
 /var/tmp/?*
 /var/run/?*pid

You can manually specify exclude paths, for example:

 # vzdump 777 --exclude-path /tmp/ --exclude-path /var/foo*

(only excludes tmp directories)

Configuration files are also stored inside the backup archive (/etc/vzdump), and will be correctly restored.

=head1 LIMITATIONS

VZDump does not save ACLs.

=head1 EXAMPLES

Simply dump VM 777 - no snapshot, just archive the VM private area and configuration files to the default dump directory (usually /vz/dump/).

 # vzdump 777

Use rsync and suspend/resume to create an snapshot (minimal downtime).

 # vzdump 777 --mode suspend

Backup all VMs and send notification mails to root and admin.

 # vzdump --all --mode suspend --mailto root --mailto admin

Use LVM2 to create snapshots (no downtime).

 # vzdump 777 --dumpdir /mnt/backup --mode snapshot

Backup more than one VM (selectively)

 # vzdump 101 102 103 --mailto root

Backup all VMs excluding VM 101 and 102

 # vzdump --mode suspend --exclude 101,102

Restore a container to a new VM 600

 # pct restore 600 /mnt/backup/vzdump-lxc-777.tar

Restore a Qemu/KVM machine to VM 601

 # qmrestore /mnt/backup/vzdump-qemu-888.vma 601

Clone an existing container 101 to a new container 300 with a 4GB root file system, using pipes

 # vzdump 101 --stdout | pct restore --rootfs 4 300 -

=head1 SEE ALSO

pct(1), qmrestore(1)

=include pve_copyright
