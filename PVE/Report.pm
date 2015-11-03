package PVE::Report;

use strict;
use warnings;
use PVE::pvecfg;
use PVE::Tools;

my $report;

my @general = ('hostname', 'pveversion --verbose', 'cat /etc/hosts', 'top -b -n 1  | head -n 15',
  'pvesubscription get', 'lscpu');

my @storage = ('cat /etc/pve/storage.cfg', 'pvesm status', 'cat /etc/fstab', 'mount', 'df --human');

my @volumes = ('lvdisplay', 'vgdisplay', 'zpool status', 'zfs list');

my @machines = ('qm list', sub { dir2text('/etc/pve/qemu-server/', '\d.*conf') });

my @net = ('ifconfig', 'cat /etc/network/interfaces', sub { dir2text('/etc/pve/firewall/', '.*fw') },
  'iptables-save');

my @cluster = ('pvecm nodes', 'pvecm status');

my @bios = ('dmidecode -t bios');

if (PVE::pvecfg::version() >= 4.0) {
    push @cluster, 'cat /etc/pve/corosync.conf 2> /dev/null' ;
    push @machines, sub { dir2text('/etc/pve/lxc/', '\d.*conf') };
} else {
    push @general, 'grep --max-count=1 "model name" /proc/cpuinfo';
    push @machines, sub { dir2text('/etc/pve/openvz/', '\d.*conf') };
    push @cluster,  'clustat', 'cat /etc/cluster.conf 2> /dev/null';
}

my $general_report = {
    title => 'general system info',
    commands => \@general,
};

my $storage_report = {
    title => 'info about storage (lvm and zfs)',
    commands => \@storage,
};

my $volume_report = {
    title => 'info about virtual machines',
    commands => \@machines,
};

my $net_report = {
    title => 'info about network and firewall',
    commands => \@net,
};

my $cluster_report = {
    title => 'info about clustering',
    commands => \@cluster,
};

my $bios_report = {
    title => 'info about bios',
    commands => \@bios,
};

my @global_report = ($general_report, $storage_report, $volume_report, $net_report, $cluster_report, $bios_report);

# output the content of all the files of a directory
sub dir2text {
    my ($target_dir, $regexp) = @_;

    PVE::Tools::dir_glob_foreach($target_dir, $regexp, sub {
	my ($file) = @_;
	$report .=  "# cat $target_dir$file\n";
	$report .= PVE::Tools::file_get_contents($target_dir.$file)."\n";
    });
}

# execute commands and display their output as if they've been done on a interactive shell
# so the local sysadmin can reproduce what we're doing
sub do_execute {
    my ($command) = @_;
    $report .= "# $command \n";
    open (COMMAND, "$command 2>&1 |");
    while (<COMMAND>) {
	$report .= $_;
    }
}

sub generate {
    foreach my $subreport (@global_report) {
	my $title = $subreport->{'title'};
	my @commands = @{$subreport->{'commands'}};

	$report .= "\n==== $title ====\n";
	foreach my $command (@commands) {
	    if (ref $command eq 'CODE') {
		&$command;
	    } else {
		do_execute($command);
		next;
	    }
	}
    }
return $report;
}
