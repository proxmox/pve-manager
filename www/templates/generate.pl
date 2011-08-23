#!/usr/bin/perl -w

use strict;

use POSIX qw (LONG_MAX);

my $max = LONG_MAX;
my $nolimit = "\"$max:$max\"";

my $defaults = {

    128 => {},
    256 => {},
    512 => {},
    1024 => {},
    2048 => {},

};

my $mem = $ARGV[0];

die "unknown memory size" if !defined ($defaults->{$mem});

print "# PVE default config for ${mem}MB RAM\n\n";

print "ONBOOT=\"no\"\n";

print "\n# Primary parameters\n";
print "NUMPROC=\"1024:1024\"\n";
print "NUMTCPSOCK=$nolimit\n";
print "NUMOTHERSOCK=$nolimit\n";

my $vmguarpages = int ($mem*1024/4);
print "VMGUARPAGES=\"$vmguarpages:$max\"\n";

print "\n# Secondary parameters\n";

print "KMEMSIZE=$nolimit\n";

my $privmax = int ($vmguarpages*1.1);
$privmax = $vmguarpages + 12500 if ($privmax-$vmguarpages) > 12500;
print "OOMGUARPAGES=\"$vmguarpages:$max\"\n";
print "PRIVVMPAGES=\"$vmguarpages:$privmax\"\n";

print "TCPSNDBUF=$nolimit\n";
print "TCPRCVBUF=$nolimit\n";
print "OTHERSOCKBUF=$nolimit\n";
print "DGRAMRCVBUF=$nolimit\n";

print "\n# Auxiliary parameters\n";
print "NUMFILE=$nolimit\n";
print "NUMFLOCK=$nolimit\n";
print "NUMPTY=\"255:255\"\n";
print "NUMSIGINFO=\"1024:1024\"\n";
print "DCACHESIZE=$nolimit\n";
print "LOCKEDPAGES=$nolimit\n";
print "SHMPAGES=$nolimit\n";
print "NUMIPTENT=$nolimit\n";
print "PHYSPAGES=\"0:$max\"\n";

print "\n# Disk quota parameters\n";
print "DISKSPACE=$nolimit\n";
print "DISKINODES=$nolimit\n";
print "QUOTATIME=\"0\"\n";
print "QUOTAUGIDLIMIT=\"0\"\n";

print "\n# CPU fair sheduler parameter\n";
print "CPUUNITS=\"1000\"\n";
print "CPUS=\"1\"\n";
