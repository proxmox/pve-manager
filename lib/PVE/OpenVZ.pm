package PVE::OpenVZ;

use strict;
use IO::Dir;
use IO::File;
use PVE::Config;

my $confdir = "/etc/vz/conf";

my $last_proc_vestat = {};

$ENV{'PATH'} = '/sbin:/bin:/usr/sbin:/usr/bin';

my $kernel_version = `uname -r`;

sub vmlist {

    my $res = {};

    my $fd = IO::Dir->new ($confdir) || 
	die "unable to open dir '$confdir' - $!";

    while (defined(my $de = $fd->read)) { 
	if ($de =~ m/^(\d+)\.conf$/) {
	    my $veid = $1;
	    next if !$veid; # skip VE0
	    my $d = { 
		status => 'stopped',
		type => 'openvz',
	    };

	    if (my $conf = PVE::Config::read_file ("$confdir/$de")) {
		$d->{name} = $conf->{hostname}->{value} || "VM$veid";
		$d->{name} =~ s/[\s]//g;

		$d->{cpus} = $conf->{cpus}->{value} || 1;

		$d->{disk} = 0;
		$d->{maxdisk} = int ($conf->{diskspace}->{bar} / 1024);

		$d->{mem} = 0;
		$d->{maxmem} = int (($conf->{vmguarpages}->{bar} * 4) / 1024);
		$d->{nproc} = 0;

		$d->{uptime} = 0;
		$d->{pctcpu} = 0;
		$d->{relcpu} = 0;

		if (my $ip = $conf->{ip_address}->{value}) {
		    $ip =~ s/,;/ /g;
		    $d->{ip} = (split(/\s+/, $ip))[0];
		} else {
		    $d->{ip} = '-';
		}
		$res->{"VEID_$veid"} = $d;
	    }
	}
    }

    my $fh;

    if ($fh = IO::File->new ("/proc/mounts", "r")) {
	while (defined (my $line = <$fh>)) {
	    if ($line =~ m|^/var/lib/vz/private/(\d+)\s+/var/lib/vz/root/|) {
		$res->{"VEID_$1"}->{status} = 'mounted';
	    }
	}
    }

    if ($fh = IO::File->new ("/proc/user_beancounters", "r")) {
	my $veid;
	while (defined (my $line = <$fh>)) {
	    if ($line =~ m|\s*((\d+):\s*)?([a-z]+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)$|) {
		$veid = $2 if defined($2);
		next if !$veid;
		my ($name, $held, $maxheld, $bar, $lim, $failcnt) = ($3, $4, $5, $6, $7, $8);
		if (my $d = $res->{"VEID_$veid"}) {
		    if ($name eq 'privvmpages') {
			$d->{mem} = int (($held *4) / 1024);
			$d->{maxmem} = int (($bar *4) / 1024);
		    } elsif ($name eq 'numproc') {
			$d->{nproc} = $held;
		    }
		}
	    }
	}
    }

    if ($fh = IO::File->new ("/proc/vz/vzquota", "r")) {
	while (defined (my $line = <$fh>)) {
	    if ($line =~ m|^(\d+):\s+/var/lib/vz/private/\d+$|) {
		if (my $d = $res->{"VEID_$1"}) {
		    $line = <$fh>;
		    if ($line =~ m|^\s*1k-blocks\s+(\d+)\s+(\d+)\s|) {
			$d->{disk} = int ($1/1024);
			$d->{maxdisk} = int ($2/1024);
		    }
		}
	    }
	}
    }

    my $cpuinfo = PVE::Utils::get_cpu_info();
    my $cpus = $cpuinfo->{cpus} || 1;

    # see http://wiki.openvz.org/Vestat
    if ($fh = new IO::File ("/proc/vz/vestat", "r")) {
	while (defined (my $line = <$fh>)) {
	    if ($line =~ m/^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+/) {
		my $veid = $1;
		my $user = $2;
		my $nice = $3;
		my $system = $4;
		my $ut = $5;
		my $sum = $8*$cpus; # uptime in jiffies * cpus = available jiffies
		my $used = $9; # used time in jiffies

		# HZ is 250 in our kernel 2.6.24 kernel
		# but HZ is 1000 in our kernel 2.6.18 kernel
		my $hz = 250; 
		$hz = 1000 if $kernel_version && $kernel_version =~ m/^2.6.18/;
		my $uptime = int ($ut / $hz); # HZ is 250 in our kernel

		my $d = $res->{"VEID_$veid"};
		next if !$d;

		$d->{status} = 'running';
		$d->{uptime} = $uptime;

		if (!defined ($last_proc_vestat->{$veid}) ||
		    ($last_proc_vestat->{$veid}->{sum} > $sum)) {
		    $last_proc_vestat->{$veid} = { used => 0, sum => 0, pctcpu => 0, relcpu => 0};
		}

		my $diff = $sum - $last_proc_vestat->{$veid}->{sum};

		if ($diff > 1000) { # don't update too often
		    my $useddiff = $used - $last_proc_vestat->{$veid}->{used};
		    my $pctcpu = int ($useddiff*100/$diff);
		    $last_proc_vestat->{$veid}->{sum} = $sum;
		    $last_proc_vestat->{$veid}->{used} = $used;
		    $last_proc_vestat->{$veid}->{pctcpu} = $d->{pctcpu} = $pctcpu;

		    # fixme: openvz --cpus does not work currently
		    my $relcpu = $pctcpu;
		    $last_proc_vestat->{$veid}->{relcpu} = $d->{relcpu} = $relcpu;

		} else {
		    $d->{pctcpu} = $last_proc_vestat->{$veid}->{pctcpu};
		    $d->{relcpu} = $last_proc_vestat->{$veid}->{relcpu};
		}
	    }
	}
    }

    return $res;

}
