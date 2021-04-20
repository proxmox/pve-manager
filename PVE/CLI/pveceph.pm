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
use PVE::Ceph::Services;
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
	    logs => {
		description => 'Additionally purge Ceph logs, /var/log/ceph.',
		type => 'boolean',
		optional => 1,
	    },
	    crash => {
		description => 'Additionally purge Ceph crash logs, /var/lib/ceph/crash.',
		type => 'boolean',
		optional => 1,
	    },
	},
    },
    returns => { type => 'null' },
    code => sub {
	my ($param) = @_;

	my $message;
	my $pools = [];
	my $monstat = {};
	my $mdsstat = {};
	my $osdstat = [];

	eval {
	    my $rados = PVE::RADOS->new();
	    $pools = PVE::Ceph::Tools::ls_pools(undef, $rados);
	    $monstat = PVE::Ceph::Services::get_services_info('mon', undef, $rados);
	    $mdsstat = PVE::Ceph::Services::get_services_info('mds', undef, $rados);
	    $osdstat = $rados->mon_command({ prefix => 'osd metadata' });
	};
	warn "Error gathering ceph info, already purged? Message: $@" if $@;

	my $osd = grep { $_->{hostname} eq $nodename } @$osdstat;
	my $mds = grep { $mdsstat->{$_}->{host} eq $nodename } keys %$mdsstat;
	my $mon = grep { $monstat->{$_}->{host} eq $nodename } keys %$monstat;

	# no pools = no data
	$message .= "- remove pools, this will !!DESTROY DATA!!\n" if @$pools;
	$message .= "- remove active OSD on $nodename\n" if $osd;
	$message .= "- remove active MDS on $nodename\n" if $mds;
	$message .= "- remove other MONs, $nodename is not the last MON\n"
	    if scalar(keys %$monstat) > 1 && $mon;

	# display all steps at once
	die "Unable to purge Ceph!\n\nTo continue:\n$message" if $message;

	my $services = PVE::Ceph::Services::get_local_services();
	$services->{mon} = $monstat if $mon;
	$services->{crash}->{$nodename} = { direxists => 1 } if $param->{crash};
	$services->{logs}->{$nodename} = { direxists => 1 } if $param->{logs};

	PVE::Ceph::Tools::purge_all_ceph_services($services);
	PVE::Ceph::Tools::purge_all_ceph_files($services);

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
		enum => ['luminous', 'nautilus', 'octopus'],
		default => 'nautilus',
		description => "Ceph version to install.",
		optional => 1,
	    },
	    'allow-experimental' => {
		type => 'boolean',
		default => 0,
		optional => 1,
		description => "Allow experimental versions. Use with care!",
	    },
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
	} elsif ($cephver eq 'luminous') {
	    die "Not allowed to select version '$cephver'\n" if !$param->{'allow-experimental'};
	    $repolist = "deb http://download.proxmox.com/debian/ceph-luminous buster main\n";
	} elsif ($cephver eq 'octopus') {
	    $repolist = "deb http://download.proxmox.com/debian/ceph-octopus buster main\n";
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

	return undef;
    }});

__PACKAGE__->register_method ({
    name => 'status',
    path => 'status',
    method => 'GET',
    description => "Get Ceph Status.",
    parameters => {
	additionalProperties => 0,
    },
    returns => { type => 'null' },
    code => sub {
	PVE::Ceph::Tools::check_ceph_inited();

	run_command(
	    ['ceph', '-s'],
	    outfunc => sub { print "$_[0]\n" },
	    errfunc => sub { print STDERR "$_[0]\n" },
	    timeout => 15,
	);
	return undef;
    }});

our $cmddef = {
    init => [ 'PVE::API2::Ceph', 'init', [], { node => $nodename } ],
    pool => {
	ls => [ 'PVE::API2::Ceph::Pools', 'lspools', [], { node => $nodename }, sub {
	    my ($data, $schema, $options) = @_;
	    PVE::CLIFormatter::print_api_result($data, $schema,
		[
		    'pool_name',
		    'size',
		    'min_size',
		    'pg_num',
		    'pg_num_min',
		    'pg_num_final',
		    'pg_autoscale_mode',
		    'target_size',
		    'target_size_ratio',
		    'crush_rule_name',
		    'percent_used',
		    'bytes_used',
		],
		$options);
	}, $PVE::RESTHandler::standard_output_options],
	create => [ 'PVE::API2::Ceph::Pools', 'createpool', ['name'], { node => $nodename }],
	destroy => [ 'PVE::API2::Ceph::Pools', 'destroypool', ['name'], { node => $nodename } ],
	set => [ 'PVE::API2::Ceph::Pools', 'setpool', ['name'], { node => $nodename } ],
	get => [ 'PVE::API2::Ceph::Pools', 'getpool', ['name'], { node => $nodename }, sub {
	    my ($data, $schema, $options) = @_;
	    PVE::CLIFormatter::print_api_result($data, $schema, undef, $options);
	}, $PVE::RESTHandler::standard_output_options],
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
    start => [ 'PVE::API2::Ceph', 'start', [], { node => $nodename }, $upid_exit],
    stop => [ 'PVE::API2::Ceph', 'stop', [], { node => $nodename }, $upid_exit],
    install => [ __PACKAGE__, 'install', [] ],
    purge => [  __PACKAGE__, 'purge', [] ],
    status => [ __PACKAGE__, 'status', []],
};

1;
