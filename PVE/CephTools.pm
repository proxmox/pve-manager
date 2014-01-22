package PVE::CephTools;

use strict;
use warnings;
use File::Basename;
use File::Path;
use POSIX qw (LONG_MAX);
use Cwd qw(abs_path);

use PVE::Tools;

my $ccname = 'ceph'; # ceph cluster name
my $ceph_cfgdir = "/etc/ceph";
my $pve_ceph_cfgpath = "/etc/pve/$ccname.conf";
my $ceph_cfgpath = "$ceph_cfgdir/$ccname.conf";

my $pve_mon_key_path = "/etc/pve/priv/$ccname.mon.keyring";
my $pve_ckeyring_path = "/etc/pve/priv/$ccname.client.admin.keyring";
my $ceph_bootstrap_osd_keyring = "/var/lib/ceph/bootstrap-osd/$ccname.keyring";
my $ceph_bootstrap_mds_keyring = "/var/lib/ceph/bootstrap-mds/$ccname.keyring";

my $ceph_bin = "/usr/bin/ceph";

my $config_hash = {
    ccname => $ccname,
    pve_ceph_cfgpath => $pve_ceph_cfgpath,
    pve_mon_key_path => $pve_mon_key_path,
    pve_ckeyring_path => $pve_ckeyring_path,
    ceph_bootstrap_osd_keyring => $ceph_bootstrap_osd_keyring,
    ceph_bootstrap_mds_keyring => $ceph_bootstrap_mds_keyring,
};

sub get_config {
    my $key = shift;

    my $value = $config_hash->{$key};

    die "no such ceph config '$key'" if !$value; 

    return $value;
}

sub verify_blockdev_path {
    my ($path) = @_;

    $path = abs_path($path);

    die "got unusual device path '$path'\n" if $path !~  m|^/dev/(.*)$|;

    $path = "/dev/$1"; # untaint

    die "no such block device '$path'\n"
	if ! -b $path;
    
    return $path;
};

sub purge_all_ceph_files {
    # fixme: this is very dangerous - should we really support this function?

    unlink $ceph_cfgpath;

    unlink $pve_ceph_cfgpath;
    unlink $pve_ckeyring_path;
    unlink $pve_mon_key_path;

    unlink $ceph_bootstrap_osd_keyring;
    unlink $ceph_bootstrap_mds_keyring;

    system("rm -rf /var/lib/ceph/mon/ceph-*");

    # remove osd?
}

sub check_ceph_installed {
    my ($noerr) = @_;

    if (! -x $ceph_bin) {
	die "ceph binaries not installed\n" if !$noerr;
	return undef;
    }

    return 1;
}

sub check_ceph_inited {
    my ($noerr) = @_;

    return undef if !check_ceph_installed($noerr);
    
    if (! -f $pve_ceph_cfgpath) {
	die "pveceph configuration not initialized\n" if !$noerr;
	return undef;
    }

    return 1;
}

sub check_ceph_enabled {
    my ($noerr) = @_;

    return undef if !check_ceph_inited($noerr);

    if (! -f $ceph_cfgpath) {
	die "pveceph configuration not enabled\n" if !$noerr;
	return undef;
    }

    return 1;
}

sub parse_ceph_config {
    my ($filename) = @_;

    $filename = $pve_ceph_cfgpath if !$filename;

    my $cfg = {};

    return $cfg if ! -f $filename;

    my $fh = IO::File->new($filename, "r") ||
	die "unable to open '$filename' - $!\n";

    my $section;

    while (defined(my $line = <$fh>)) {
	$line =~ s/[;#].*$//;
	$line =~ s/^\s+//;
	$line =~ s/\s+$//;
	next if !$line;

	$section = $1 if $line =~ m/^\[(\S+)\]$/;
	if (!$section) {
	    warn "no section - skip: $line\n";
	    next;
	}

	if ($line =~ m/^(.*\S)\s*=\s*(\S.*)$/) {
	    $cfg->{$section}->{$1} = $2;
	}

    }

    return $cfg;
}

sub write_ceph_config {
    my ($cfg) = @_;

    my $out = '';

    my $cond_write_sec = sub {
	my $re = shift;

	foreach my $section (keys %$cfg) {
	    next if $section !~ m/^$re$/;
	    $out .= "[$section]\n";
	    foreach my $key (sort keys %{$cfg->{$section}}) {
		$out .= "\t $key = $cfg->{$section}->{$key}\n";
	    }
	    $out .= "\n";
	}
    };

    &$cond_write_sec('global');
    &$cond_write_sec('mon');
    &$cond_write_sec('osd');
    &$cond_write_sec('mon\..*');
    &$cond_write_sec('osd\..*');

    PVE::Tools::file_set_contents($pve_ceph_cfgpath, $out);
}

sub setup_pve_symlinks {
    # fail if we find a real file instead of a link
    if (-f $ceph_cfgpath) {
	my $lnk = readlink($ceph_cfgpath);
	die "file '$ceph_cfgpath' already exists\n"
	    if !$lnk || $lnk ne $pve_ceph_cfgpath;
    } else {
	symlink($pve_ceph_cfgpath, $ceph_cfgpath) ||
	    die "unable to create symlink '$ceph_cfgpath' - $!\n";
    }
}

sub ceph_service_cmd {
    PVE::Tools::run_command(['service', 'ceph', '-c', $pve_ceph_cfgpath, @_]);
}

1;
