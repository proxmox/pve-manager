package PVE::CLI::pveceph;

use strict;
use warnings;

use Fcntl ':flock';
use File::Path;
use IO::File;
use JSON;
use Data::Dumper;
use LWP::UserAgent;

use PVE::SafeSyslog;
use PVE::Cluster;
use PVE::INotify;
use PVE::RPCEnvironment;
use PVE::Storage;
use PVE::Tools qw(run_command);
use PVE::JSONSchema qw(get_standard_option);
use PVE::Ceph::Tools;
use PVE::API2::Ceph;
use PVE::API2::Ceph::FS;
use PVE::API2::Ceph::MDS;
use PVE::API2::Ceph::MGR;
use PVE::API2::Ceph::MON;
use PVE::API2::Ceph::OSD;

use PVE::CLIHandler;

use base qw(PVE::CLIHandler);

my $nodename = PVE::INotify::nodename();

my $upid_exit = sub {
    my $upid = shift;
    my $status = PVE::Tools::upid_read_status($upid);
    exit($status eq 'OK' ? 0 : -1);
};

sub setup_environment {
    PVE::RPCEnvironment->setup_default_cli_env();
}

__PACKAGE__->register_method ({
    name => 'purge',
    path => 'purge',
    method => 'POST',
    description => "Destroy ceph related data and configuration files.",
    parameters => {
	additionalProperties => 0,
	properties => {
	},
    },
    returns => { type => 'null' },
    code => sub {
	my ($param) = @_;

	my $monstat;

	eval {
	    my $rados = PVE::RADOS->new();
	    my $monstat = $rados->mon_command({ prefix => 'mon_status' });
	};
	my $err = $@;

	die "detected running ceph services- unable to purge data\n"
	    if !$err;

	# fixme: this is dangerous - should we really support this function?
	PVE::Ceph::Tools::purge_all_ceph_files();

	return undef;
    }});

__PACKAGE__->register_method ({
    name => 'install',
    path => 'install',
    method => 'POST',
    description => "Install ceph related packages.",
    parameters => {
	additionalProperties => 0,
	properties => {
	    version => {
		type => 'string',
		# for buster, luminous kept for testing/upgrade purposes only! - FIXME: remove with 6.2?
		enum => ['luminous', 'nautilus',],
		default => 'nautilus',
		description => "Ceph version to install.",
		optional => 1,
	    }
	},
    },
    returns => { type => 'null' },
    code => sub {
	my ($param) = @_;

	my $default_vers = 'nautilus';
	my $cephver = $param->{version} || $default_vers;

	my $repolist;
	if ($cephver eq 'nautilus') {
		$repolist = "deb http://download.proxmox.com/debian/ceph-nautilus buster main\n";
		# FIXME: remove non-public testing repo
		$repolist = "deb http://repo.proxmox.com/staging/ceph-nautilus buster ceph-14.0\n";
	} elsif ($cephver eq 'luminous') {
		$repolist = "deb http://download.proxmox.com/debian/ceph-luminous buster main\n";
	} else {
	    die "not implemented ceph version: $cephver";
	}
	PVE::Tools::file_set_contents("/etc/apt/sources.list.d/ceph.list", $repolist);

	warn "WARNING: installing non-default ceph release '$cephver'!\n\n" if $cephver ne $default_vers;

	local $ENV{DEBIAN_FRONTEND} = 'noninteractive';
	print "update available package list\n";
	eval { run_command(['apt-get', '-q', 'update'], outfunc => sub {}, errfunc => sub { print STDERR "$_[0]\n" }) };

	my @apt_install = qw(apt-get --no-install-recommends -o Dpkg::Options::=--force-confnew install --);
	my @ceph_packages = qw(
	    ceph
	    ceph-common
	    ceph-mds
	    ceph-fuse
	    gdisk
	);

	print "start installation\n";
	if (system(@apt_install, @ceph_packages) != 0) {
	    die "apt failed during ceph installation ($?)\n";
	}

	print "\ninstalled ceph $cephver successfully\n";

	if (! -e '/etc/systemd/system/ceph.service') {
	    print "\nreplacing ceph init script with own ceph.service\n";
	    eval {
		run_command('cp -v /usr/share/doc/pve-manager/examples/ceph.service /etc/systemd/system/ceph.service');
		run_command('systemctl daemon-reload');
		run_command('systemctl enable ceph.service');
	    };
	    if (my $err = $@) {
		warn "WARNING: could not install ceph.service: $@\n";
	    } else {
		print "installed ceph.service successfully\n";
	    }
	}

	return undef;
    }});

our $cmddef = {
    init => [ 'PVE::API2::Ceph', 'init', [], { node => $nodename } ],
    pool => {
	ls => [ 'PVE::API2::Ceph', 'lspools', [], { node => $nodename }, sub {
	    my $res = shift;

	    printf("%-20s %10s %10s %10s %10s %20s\n", "Name", "size", "min_size",
		    "pg_num", "%-used", "used");
	    foreach my $p (sort {$a->{pool_name} cmp $b->{pool_name}} @$res) {
		printf("%-20s %10d %10d %10d %10.2f %20d\n", $p->{pool_name},
			$p->{size}, $p->{min_size}, $p->{pg_num},
			$p->{percent_used}, $p->{bytes_used});
	    }
	}],
	create => [ 'PVE::API2::Ceph', 'createpool', ['name'], { node => $nodename }],
	destroy => [ 'PVE::API2::Ceph', 'destroypool', ['name'], { node => $nodename } ],
    },
    lspools => { alias => 'pool ls' },
    createpool => { alias => 'pool create' },
    destroypool => { alias => 'pool destroy' },
    fs => {
	create => [ 'PVE::API2::Ceph::FS', 'createfs', [], { node => $nodename }],
    },
    osd => {
	create => [ 'PVE::API2::Ceph::OSD', 'createosd', ['dev'], { node => $nodename }, $upid_exit],
	destroy => [ 'PVE::API2::Ceph::OSD', 'destroyosd', ['osdid'], { node => $nodename }, $upid_exit],
    },
    createosd => { alias => 'osd create' },
    destroyosd => { alias => 'osd destroy' },
    mon => {
	create => [ 'PVE::API2::Ceph::MON', 'createmon', [], { node => $nodename }, $upid_exit],
	destroy => [ 'PVE::API2::Ceph::MON', 'destroymon', ['monid'], { node => $nodename }, $upid_exit],
    },
    createmon => { alias => 'mon create' },
    destroymon => { alias => 'mon destroy' },
    mgr => {
	create => [ 'PVE::API2::Ceph::MGR', 'createmgr', [], { node => $nodename }, $upid_exit],
	destroy => [ 'PVE::API2::Ceph::MGR', 'destroymgr', ['id'], { node => $nodename }, $upid_exit],
    },
    createmgr => { alias => 'mgr create' },
    destroymgr => { alias => 'mgr destroy' },
    mds => {
	create => [ 'PVE::API2::Ceph::MDS', 'createmds', [], { node => $nodename }, $upid_exit],
	destroy => [ 'PVE::API2::Ceph::MDS', 'destroymds', ['name'], { node => $nodename }, $upid_exit],
    },
    start => [ 'PVE::API2::Ceph', 'start', ['service'], { node => $nodename }, $upid_exit],
    stop => [ 'PVE::API2::Ceph', 'stop', ['service'], { node => $nodename }, $upid_exit],
    install => [ __PACKAGE__, 'install', [] ],
    purge => [  __PACKAGE__, 'purge', [] ],
    status => [ 'PVE::API2::Ceph', 'status', [], { node => $nodename }, sub {
	my $res = shift;
	my $json = JSON->new->allow_nonref;
	print $json->pretty->encode($res) . "\n";
    }],
};

1;
