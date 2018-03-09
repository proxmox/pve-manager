#!/usr/bin/perl -w

# Example hook script for vzdump (--script option)
# This can also be added as a line in /etc/vzdump.conf
# e.g. 'script: /usr/local/bin/vzdump-hook-script.pl'


use strict;

print "HOOK: " . join (' ', @ARGV) . "\n";

my $phase = shift;

if ($phase eq 'job-start' ||
    $phase eq 'job-end'  ||
    $phase eq 'job-abort') {

    my $dumpdir = $ENV{DUMPDIR};

    my $storeid = $ENV{STOREID};

    print "HOOK-ENV: dumpdir=$dumpdir;storeid=$storeid\n";

    # do what you want

} elsif ($phase eq 'backup-start' ||
	 $phase eq 'backup-end' ||
	 $phase eq 'backup-abort' ||
	 $phase eq 'log-end' ||
	 $phase eq 'pre-stop' ||
	 $phase eq 'pre-restart' ||
	 $phase eq 'post-restart') {

    my $mode = shift; # stop/suspend/snapshot

    my $vmid = shift;

    my $vmtype = $ENV{VMTYPE}; # openvz/qemu

    my $dumpdir = $ENV{DUMPDIR};

    my $storeid = $ENV{STOREID};

    my $hostname = $ENV{HOSTNAME};

    # tarfile is only available in phase 'backup-end'
    my $tarfile = $ENV{TARFILE};

    # logfile is only available in phase 'log-end'
    my $logfile = $ENV{LOGFILE};

    print "HOOK-ENV: vmtype=$vmtype;dumpdir=$dumpdir;storeid=$storeid;hostname=$hostname;tarfile=$tarfile;logfile=$logfile\n";

    # example: copy resulting backup file to another host using scp
    if ($phase eq 'backup-end') {
        #system ("scp $tarfile backup-host:/backup-dir") == 0 ||
        #    die "copy tar file to backup-host failed";
    }

    # example: copy resulting log file to another host using scp
    if ($phase eq 'log-end') {
        #system ("scp $logfile backup-host:/backup-dir") == 0 ||
        #    die "copy log file to backup-host failed";
    }

} else {

    die "got unknown phase '$phase'";

}

exit (0);
