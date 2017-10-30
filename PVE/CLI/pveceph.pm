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
use PVE::CephTools;
use PVE::API2::Ceph;

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
	PVE::CephTools::purge_all_ceph_files();

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
		#enum => ['hammer', 'jewel'], # for jessie
		enum => ['luminous',], # for stretch
		optional => 1,
	    }
	},
    },
    returns => { type => 'null' },
    code => sub {
	my ($param) = @_;

	my $cephver = $param->{version} || 'luminous';

	local $ENV{DEBIAN_FRONTEND} = 'noninteractive';

	if ($cephver eq 'luminous') {
	    PVE::Tools::file_set_contents("/etc/apt/sources.list.d/ceph.list",
		"deb http://download.proxmox.com/debian/ceph-luminous stretch main\n");
	} else {
	    # use fixed devel repo for now, because there is no officila repo for jessie
	    my $devrepo = undef;

	    my $keyurl = $devrepo ?
		"https://git.ceph.com/?p=ceph.git;a=blob_plain;f=keys/autobuild.asc" :
		"https://git.ceph.com/?p=ceph.git;a=blob_plain;f=keys/release.asc";

	    print "download and import ceph repository keys\n";

	    # Note: wget on Debian wheezy cannot handle new ceph.com certificates, so
	    # we use LWP::UserAgent
	    #system("wget -q -O- '$keyurl'| apt-key add - 2>&1 >/dev/null") == 0 ||
	    #die "unable to download ceph release key\n";

	    my $tmp_key_file = "/tmp/ceph-release-keys.asc";
	    my $ua = LWP::UserAgent->new(protocols_allowed => ['http', 'https'], timeout => 120);
	    $ua->env_proxy;
	    my $response = $ua->get($keyurl);
	    if ($response->is_success) {
		my $data = $response->decoded_content;
		PVE::Tools::file_set_contents($tmp_key_file, $data);
	    } else {
		die "unable to download ceph release key: " . $response->status_line . "\n";
	    }

	    system("apt-key add $tmp_key_file 2>&1 >/dev/null") == 0 ||
		die "unable to download ceph release key\n";

	    unlink $tmp_key_file;

	    my $source = $devrepo ?
		"deb http://gitbuilder.ceph.com/ceph-deb-jessie-x86_64-basic/ref/$devrepo jessie main\n" :
		"deb http://download.ceph.com/debian-$cephver jessie main\n";

	    PVE::Tools::file_set_contents("/etc/apt/sources.list.d/ceph.list", $source);
	}

	print "update available package list\n";
	eval { run_command(['apt-get', '-q', 'update'], outfunc => sub {}, errfunc => sub {}); };

	system('apt-get', '--no-install-recommends',
		'-o', 'Dpkg::Options::=--force-confnew',
		'install', '--',
		'ceph', 'ceph-common', 'gdisk');

	if (PVE::CephTools::systemd_managed() && ! -e '/etc/systemd/system/ceph.service') {
	    #to disable old SysV init scripts.
	    print "replacing ceph init script with own ceph.service\n";
	    eval {
		PVE::Tools::run_command('cp -v /usr/share/doc/pve-manager/examples/ceph.service /etc/systemd/system/ceph.service');
		PVE::Tools::run_command('systemctl daemon-reload');
		PVE::Tools::run_command('systemctl enable ceph.service');
	    };
	    warn "could not install ceph.service\n" if $@;
	}

	return undef;
    }});

our $cmddef = {
    init => [ 'PVE::API2::Ceph', 'init', [], { node => $nodename } ],
    lspools => [ 'PVE::API2::Ceph', 'lspools', [], { node => $nodename }, sub {
	my $res = shift;

	printf("%-20s %10s %10s %10s %10s %20s\n", "Name", "size", "min_size",
		"pg_num", "%-used", "used");
	foreach my $p (sort {$a->{pool_name} cmp $b->{pool_name}} @$res) {
	    printf("%-20s %10d %10d %10d %10.2f %20d\n", $p->{pool_name},
		    $p->{size}, $p->{min_size}, $p->{pg_num},
		    $p->{percent_used}, $p->{bytes_used});
	}
    }],
    createpool => [ 'PVE::API2::Ceph', 'createpool', ['name'], { node => $nodename }],
    destroypool => [ 'PVE::API2::Ceph', 'destroypool', ['name'], { node => $nodename } ],
    createosd => [ 'PVE::API2::CephOSD', 'createosd', ['dev'], { node => $nodename }, $upid_exit],
    destroyosd => [ 'PVE::API2::CephOSD', 'destroyosd', ['osdid'], { node => $nodename }, $upid_exit],
    createmon => [ 'PVE::API2::Ceph', 'createmon', [], { node => $nodename }, $upid_exit],
    destroymon => [ 'PVE::API2::Ceph', 'destroymon', ['monid'], { node => $nodename }, $upid_exit],
    createmgr => [ 'PVE::API2::Ceph', 'createmgr', [], { node => $nodename }, $upid_exit],
    destroymgr => [ 'PVE::API2::Ceph', 'destroymgr', ['id'], { node => $nodename }, $upid_exit],
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
