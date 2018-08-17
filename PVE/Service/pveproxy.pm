package PVE::Service::pveproxy;

use strict;
use warnings;

use PVE::SafeSyslog;
use PVE::Daemon;
use HTTP::Response;
use Encode;
use URI;
use URI::QueryParam;
use Data::Dumper;
use PVE::Cluster;
use PVE::API2Tools;
use PVE::API2;
use PVE::APIServer::Formatter;
use PVE::APIServer::Formatter::Standard;
use PVE::APIServer::Formatter::HTML;
use PVE::APIServer::AnyEvent;
use PVE::HTTPServer;
use PVE::pvecfg;

use Template;

use PVE::Tools;

use base qw(PVE::Daemon);

my $cmdline = [$0, @ARGV];

my %daemon_options = (
    max_workers => 3,
    restart_on_error => 5,
    stop_wait_time => 15,
    leave_children_open_on_reload => 1,
    setuid => 'www-data',
    setgid => 'www-data',
    pidfile => '/var/run/pveproxy/pveproxy.pid',
);

my $daemon = __PACKAGE__->new('pveproxy', $cmdline, %daemon_options);

sub add_dirs {
    my ($result_hash, $alias, $subdir) = @_;

    PVE::APIServer::AnyEvent::add_dirs($result_hash, $alias, $subdir);
}

my $basedirs = {
    novnc => '/usr/share/novnc-pve',
    extjs => '/usr/share/javascript/extjs',
    manager => '/usr/share/pve-manager',
    i18n => '/usr/share/pve-i18n',
    docs => '/usr/share/pve-docs',
    fontawesome => '/usr/share/fonts-font-awesome',
    xtermjs => '/usr/share/pve-xtermjs',
    widgettoolkit => '/usr/share/javascript/proxmox-widget-toolkit',
};

sub init {
    my ($self) = @_;

    # we use same ALLOW/DENY/POLICY as pveproxy
    my $proxyconf = PVE::API2Tools::read_proxy_config();

    my $accept_lock_fn = "/var/lock/pveproxy.lck";

    my $lockfh = IO::File->new(">>${accept_lock_fn}") ||
	die "unable to open lock file '${accept_lock_fn}' - $!\n";

    my $family = PVE::Tools::get_host_address_family($self->{nodename});
    my $socket = $self->create_reusable_socket(8006, undef, $family);

    my $dirs = {};

    add_dirs($dirs, '/pve2/locale/', "$basedirs->{i18n}/");
    add_dirs($dirs, '/pve2/touch/', "$basedirs->{manager}/touch/");
    add_dirs($dirs, '/pve2/ext6/', "$basedirs->{extjs}/");
    add_dirs($dirs, '/pve2/images/' =>  "$basedirs->{manager}/images/");
    add_dirs($dirs, '/pve2/css/' =>  "$basedirs->{manager}/css/");
    add_dirs($dirs, '/pve2/js/' =>  "$basedirs->{manager}/js/");
    add_dirs($dirs, '/pve2/fa/fonts/' =>  "$basedirs->{fontawesome}/fonts/");
    add_dirs($dirs, '/pve2/fa/css/' =>  "$basedirs->{fontawesome}/css/");
    add_dirs($dirs, '/pve-docs/' => "$basedirs->{docs}/");
    add_dirs($dirs, '/pve-docs/api-viewer/extjs/' => "$basedirs->{extjs}/");
    add_dirs($dirs, '/novnc/' => "$basedirs->{novnc}/");
    add_dirs($dirs, '/xtermjs/' => "$basedirs->{xtermjs}/");

    $self->{server_config} = {
	title => 'Proxmox VE API',
	keep_alive => 100,
	max_conn => 500,
	max_requests => 1000,
	lockfile => $accept_lock_fn,
	socket => $socket,
	lockfh => $lockfh,
	debug => $self->{debug},
	trusted_env => 0, # not trusted, anyone can connect
	logfile => '/var/log/pveproxy/access.log',
	allow_from => $proxyconf->{ALLOW_FROM},
	deny_from => $proxyconf->{DENY_FROM},
	policy => $proxyconf->{POLICY},
	ssl => {
	    # Note: older versions are considered insecure, for example
	    # search for "Poodle"-Attac
	    method => 'any',
	    sslv2 => 0,
	    sslv3 => 0,
	    cipher_list => $proxyconf->{CIPHERS} || 'HIGH:MEDIUM:!aNULL:!MD5',
	    key_file => '/etc/pve/local/pve-ssl.key',
	    cert_file => '/etc/pve/local/pve-ssl.pem',
	},
	# Note: there is no authentication for those pages and dirs!
	pages => {
	    '/' => sub { get_index($self->{nodename}, @_) },
	    # avoid authentication when accessing favicon
	    '/favicon.ico' => {
		file => "$basedirs->{manager}/images/favicon.ico",
	    },
	    '/proxmoxlib.js' => {
		file => "$basedirs->{widgettoolkit}/proxmoxlib.js",
	    },
	},
	dirs => $dirs,
    };

    if ($proxyconf->{DHPARAMS}) {
	$self->{server_config}->{ssl}->{dh_file} = $proxyconf->{DHPARAMS};
    } else {
	$self->{server_config}->{ssl}->{dh} = 'skip2048';
    }

    if (-f '/etc/pve/local/pveproxy-ssl.pem' && -f '/etc/pve/local/pveproxy-ssl.key') {
	$self->{server_config}->{ssl}->{cert_file} = '/etc/pve/local/pveproxy-ssl.pem';
	$self->{server_config}->{ssl}->{key_file} = '/etc/pve/local/pveproxy-ssl.key';
	syslog('info', 'Using \'/etc/pve/local/pveproxy-ssl.pem\' as certificate for the web interface.');
    }
}

sub run {
    my ($self) = @_;

    my $server = PVE::HTTPServer->new(%{$self->{server_config}});
    $server->run();
}

$daemon->register_start_command();
$daemon->register_restart_command(1);
$daemon->register_stop_command();
$daemon->register_status_command();

our $cmddef = {
    start => [ __PACKAGE__, 'start', []],
    restart => [ __PACKAGE__, 'restart', []],
    stop => [ __PACKAGE__, 'stop', []],
    status => [ __PACKAGE__, 'status', [], undef, sub { print shift . "\n";} ],
};

sub is_phone {
    my ($ua) = @_;

    return 0 if !$ua;

    return 1 if $ua =~ m/(iPhone|iPod|Windows Phone)/;

    if ($ua =~ m/Mobile(\/|\s)/) {
	return 1 if $ua =~ m/(BlackBerry|BB)/;
	return 1 if ($ua =~ m/(Android)/) && ($ua !~ m/(Silk)/);
    }

    return 0;
}

# NOTE: Requests to those pages are not authenticated
# so we must be very careful here

sub get_index {
    my ($nodename, $server, $r, $args) = @_;

    my $lang;
    my $username;
    my $token = 'null';

    if (my $cookie = $r->header('Cookie')) {
	if (my $newlang = ($cookie =~ /(?:^|\s)PVELangCookie=([^;]*)/)[0]) {
	    if ($newlang =~ m/^[a-z]{2,3}(_[A-Z]{2,3})?$/) {
		$lang = $newlang;
	    }
	}
	my $ticket = PVE::APIServer::Formatter::extract_auth_cookie($cookie, $server->{cookie_name});
	if (($username = PVE::AccessControl::verify_ticket($ticket, 1))) {
	    $token = PVE::AccessControl::assemble_csrf_prevention_token($username);
	}
    }

    if (!$lang) {
	my $dc_conf = PVE::Cluster::cfs_read_file('datacenter.cfg');
	$lang = $dc_conf->{language} // 'en';
    }

    $username = '' if !$username;

    my $mobile = is_phone($r->header('User-Agent')) ? 1 : 0;

    if (defined($args->{mobile})) {
	$mobile = $args->{mobile} ? 1 : 0;
    }

    my $novnc = defined($args->{console}) && $args->{novnc};
    my $xtermjs = defined($args->{console}) && $args->{xtermjs};

    my $page = '';
    my $template = Template->new({ABSOLUTE => 1});

    my $langfile = 0;

    if (-f  "$basedirs->{i18n}/pve-lang-$lang.js") {
	$langfile = 1;
    }

    my $ver = PVE::pvecfg::version();
    my $release = PVE::pvecfg::release();

    my $wtversionraw = PVE::Tools::file_read_firstline("$basedirs->{widgettoolkit}/proxmoxlib.js");
    my $wtversion;
    if ($wtversionraw =~ m|^// (.*)$|) {
	$wtversion = $1;
    };

    my $vars = {
	lang => $lang,
	langfile => $langfile,
	username => $username,
	token => $token,
	console => $args->{console},
	nodename => $nodename,
	debug => $server->{debug},
	version => "$ver-$release",
	wtversion => $wtversion,
    };

    # by default, load the normal index
    my $dir = $basedirs->{manager};

    if ($novnc) {
	$dir = $basedirs->{novnc};
    } elsif ($xtermjs) {
	$dir = $basedirs->{xtermjs};
    } elsif ($mobile) {
	$dir = "$basedirs->{manager}/touch";
    }

    $template->process("$dir/index.html.tpl", $vars, \$page)
	|| die $template->error(), "\n";
    my $headers = HTTP::Headers->new(Content_Type => "text/html; charset=utf-8");
    my $resp = HTTP::Response->new(200, "OK", $headers, $page);

    return $resp;
}

1;
