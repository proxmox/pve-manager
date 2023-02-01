package PVE::API2::APT;

use strict;
use warnings;

use POSIX;
use File::stat ();
use IO::File;
use File::Basename;

use LWP::UserAgent;

use Proxmox::RS::APT::Repositories;

use PVE::pvecfg;
use PVE::Tools qw(extract_param);
use PVE::Cluster;
use PVE::DataCenterConfig;
use PVE::SafeSyslog;
use PVE::INotify;
use PVE::Exception;
use PVE::RESTHandler;
use PVE::RPCEnvironment;
use PVE::API2Tools;

use JSON;
use PVE::JSONSchema qw(get_standard_option);

use AptPkg::Cache;
use AptPkg::PkgRecords;
use AptPkg::System;

my $get_apt_cache = sub {

    my $apt_cache = AptPkg::Cache->new() || die "unable to initialize AptPkg::Cache\n";

    return $apt_cache;
};

use base qw(PVE::RESTHandler);

__PACKAGE__->register_method({
    name => 'index',
    path => '',
    method => 'GET',
    description => "Directory index for apt (Advanced Package Tool).",
    permissions => {
	user => 'all',
    },
    parameters => {
	additionalProperties => 0,
	properties => {
	    node => get_standard_option('pve-node'),
	},
    },
    returns => {
	type => "array",
	items => {
	    type => "object",
	    properties => {
		id => { type => 'string' },
	    },
	},
	links => [ { rel => 'child', href => "{id}" } ],
    },
    code => sub {
	my ($param) = @_;

	my $res = [
	    { id => 'changelog' },
	    { id => 'repositories' },
	    { id => 'update' },
	    { id => 'versions' },
	];

	return $res;
    }});

my $get_pkgfile = sub {
    my ($veriter)  = @_;

    foreach my $verfile (@{$veriter->{FileList}}) {
	my $pkgfile = $verfile->{File};
	next if !$pkgfile->{Origin};
	return $pkgfile;
    }

    return undef;
};

my $get_changelog_url =sub {
    my ($pkgname, $info, $pkgver, $pkgfile) = @_;

    my $base;
    $base = dirname($info->{FileName}) if defined($info->{FileName});

    my $origin = $pkgfile->{Origin};

    if ($origin && $base) {
	$pkgver =~ s/^\d+://; # strip epoch
	my $srcpkg = $info->{SourcePkg} || $pkgname;
	if ($origin eq 'Debian') {
	    $base =~ s!pool/updates/!pool/!; # for security channel
	    return "http://packages.debian.org/changelogs/$base/${srcpkg}_${pkgver}/changelog";
	} elsif ($origin eq 'Proxmox') {
	    # the product is just for getting the standard repos and is currently a required param,
	    # but we actually only care about `files`, which includes _all_ configured repos
	    my $data = Proxmox::RS::APT::Repositories::repositories("pve");

	    for my $file ($data->{files}->@*) {
		for my $repo (grep { $_->{Enabled} } $file->{repositories}->@*) {
		    next if !grep(/$pkgfile->{component}/, $repo->{Components}->@*);
		    next if !$repo->{URIs}[0] =~ m/$pkgfile->{Site}/;

		    return $repo->{URIs}[0] . "/$base/${pkgname}_${pkgver}.changelog";
		}
	    }
	}
    }
    return; # none found, with our heuristic that is..
};

my $assemble_pkginfo = sub {
    my ($pkgname, $info, $current_ver, $candidate_ver)  = @_;

    my $data = {
	Package => $info->{Name},
	Title => $info->{ShortDesc},
	Origin => 'unknown',
    };

    if (my $pkgfile = &$get_pkgfile($candidate_ver)) {
	$data->{Origin} = $pkgfile->{Origin};
	my $changelog_url = $get_changelog_url->(
	        $pkgname, $info, $candidate_ver->{VerStr}, $pkgfile);

	$data->{ChangeLogUrl} = $changelog_url if $changelog_url;
    }

    if (my $desc = $info->{LongDesc}) {
	$desc =~ s/^.*\n\s?//; # remove first line
	$desc =~ s/\n / /g;
	$data->{Description} = $desc;
    }

    foreach my $k (qw(Section Arch Priority)) {
	$data->{$k} = $candidate_ver->{$k};
    }

    $data->{Version} = $candidate_ver->{VerStr};
    $data->{OldVersion} = $current_ver->{VerStr} if $current_ver;

    return $data;
};

# we try to cache results
my $pve_pkgstatus_fn = "/var/lib/pve-manager/pkgupdates";
my $read_cached_pkgstatus = sub {
    my $data = eval { decode_json(PVE::Tools::file_get_contents($pve_pkgstatus_fn, 5*1024*1024)) } // [];
    warn "error reading cached package status in '$pve_pkgstatus_fn' - $@\n" if $@;
    return $data;
};

my $update_pve_pkgstatus = sub {
    syslog('info', "update new package list: $pve_pkgstatus_fn");

    my $oldpkglist = &$read_cached_pkgstatus();
    my $notify_status = { map { $_->{Package} => $_->{NotifyStatus} } $oldpkglist->@* };

    my $pkglist = [];

    my $cache = &$get_apt_cache();
    my $policy = $cache->policy;
    my $pkgrecords = $cache->packages();

    foreach my $pkgname (keys %$cache) {
	my $p = $cache->{$pkgname};
	next if !$p->{SelectedState} || ($p->{SelectedState} ne 'Install');
	my $current_ver = $p->{CurrentVer} || next;
	my $candidate_ver = $policy->candidate($p) || next;

	if ($current_ver->{VerStr} ne $candidate_ver->{VerStr}) {
	    my $info = $pkgrecords->lookup($pkgname);
	    my $res = &$assemble_pkginfo($pkgname, $info, $current_ver, $candidate_ver);
	    push @$pkglist, $res;

	    # also check if we need any new package
	    # Note: this is just a quick hack (not recursive as it should be), because
	    # I found no way to get that info from AptPkg
	    if (my $deps = $candidate_ver->{DependsList}) {
		my $found;
		my $req;
		for my $d (@$deps) {
		    if ($d->{DepType} eq 'Depends') {
			$found = $d->{TargetPkg}->{SelectedState} eq 'Install' if !$found;
			# need to check ProvidesList for virtual packages
			if (!$found && (my $provides = $d->{TargetPkg}->{ProvidesList})) {
			    for my $provide ($provides->@*) {
				$found = $provide->{OwnerPkg}->{SelectedState} eq 'Install';
				last if $found;
			    }
			}
			$req = $d->{TargetPkg} if !$req;

			if (!($d->{CompType} & AptPkg::Dep::Or)) {
			    if (!$found && $req) { # New required Package
				my $tpname = $req->{Name};
				my $tpinfo = $pkgrecords->lookup($tpname);
				my $tpcv = $policy->candidate($req);
				if ($tpinfo && $tpcv) {
				    my $res = &$assemble_pkginfo($tpname, $tpinfo, undef, $tpcv);
				    push @$pkglist, $res;
				}
			    }
			    undef $found;
			    undef $req;
			}
		    }
		}
	    }
	}
    }

    # keep notification status (avoid sending mails abou new packages more than once)
    foreach my $pi (@$pkglist) {
	if (my $ns = $notify_status->{$pi->{Package}}) {
	    $pi->{NotifyStatus} = $ns if $ns eq $pi->{Version};
	}
    }

    PVE::Tools::file_set_contents($pve_pkgstatus_fn, encode_json($pkglist));

    return $pkglist;
};

__PACKAGE__->register_method({
    name => 'list_updates',
    path => 'update',
    method => 'GET',
    description => "List available updates.",
    permissions => {
	check => ['perm', '/nodes/{node}', [ 'Sys.Modify' ]],
    },
    protected => 1,
    proxyto => 'node',
    parameters => {
	additionalProperties => 0,
	properties => {
	    node => get_standard_option('pve-node'),
	},
    },
    returns => {
	type => "array",
	items => {
	    type => "object",
	    properties => {},
	},
    },
    code => sub {
	my ($param) = @_;

	if (my $st1 = File::stat::stat($pve_pkgstatus_fn)) {
	    my $st2 = File::stat::stat("/var/cache/apt/pkgcache.bin");
	    my $st3 = File::stat::stat("/var/lib/dpkg/status");

	    if ($st2 && $st3 && $st2->mtime <= $st1->mtime && $st3->mtime <= $st1->mtime) {
		if (my $data = &$read_cached_pkgstatus()) {
		    return $data;
		}
	    }
	}

	my $pkglist = &$update_pve_pkgstatus();

	return $pkglist;
    }});

__PACKAGE__->register_method({
    name => 'update_database',
    path => 'update',
    method => 'POST',
    description => "This is used to resynchronize the package index files from their sources (apt-get update).",
    permissions => {
	check => ['perm', '/nodes/{node}', [ 'Sys.Modify' ]],
    },
    protected => 1,
    proxyto => 'node',
    parameters => {
	additionalProperties => 0,
	properties => {
	    node => get_standard_option('pve-node'),
	    notify => {
		type => 'boolean',
		description => "Send notification mail about new packages (to email address specified for user 'root\@pam').",
		optional => 1,
		default => 0,
	    },
	    quiet => {
		type => 'boolean',
		description => "Only produces output suitable for logging, omitting progress indicators.",
		optional => 1,
		default => 0,
	    },
	},
    },
    returns => {
	type => 'string',
    },
    code => sub {
	my ($param) = @_;

	my $rpcenv = PVE::RPCEnvironment::get();

	my $authuser = $rpcenv->get_user();

	my $realcmd = sub {
	    my $upid = shift;

	    # setup proxy for apt
	    my $dcconf = PVE::Cluster::cfs_read_file('datacenter.cfg');

	    my $aptconf = "// no proxy configured\n";
	    if ($dcconf->{http_proxy}) {
		$aptconf = "Acquire::http::Proxy \"$dcconf->{http_proxy}\";\n";
	    }
	    my $aptcfn = "/etc/apt/apt.conf.d/76pveproxy";
	    PVE::Tools::file_set_contents($aptcfn, $aptconf);

	    my $cmd = ['apt-get', 'update'];

	    print "starting apt-get update\n" if !$param->{quiet};

	    if ($param->{quiet}) {
		PVE::Tools::run_command($cmd, outfunc => sub {}, errfunc => sub {});
	    } else {
		PVE::Tools::run_command($cmd);
	    }

	    my $pkglist = &$update_pve_pkgstatus();

	    if ($param->{notify} && scalar(@$pkglist)) {

		my $usercfg = PVE::Cluster::cfs_read_file("user.cfg");
		my $rootcfg = $usercfg->{users}->{'root@pam'} || {};
		my $mailto = $rootcfg->{email};

		if ($mailto) {
		    my $hostname = `hostname -f` || PVE::INotify::nodename();
		    chomp $hostname;
		    my $mailfrom = $dcconf->{email_from} || "root";
		    my $subject = "New software packages available ($hostname)";

		    my $data = "The following updates are available:\n\n";

		    my $count = 0;
		    foreach my $p (sort {$a->{Package} cmp $b->{Package} } @$pkglist) {
			next if $p->{NotifyStatus} && $p->{NotifyStatus} eq $p->{Version};
			$count++;
			if ($p->{OldVersion}) {
			    $data .= "$p->{Package}: $p->{OldVersion} ==> $p->{Version}\n";
			} else {
			    $data .= "$p->{Package}: $p->{Version} (new)\n";
			}
		    }

		    return if !$count;

		    PVE::Tools::sendmail($mailto, $subject, $data, undef, $mailfrom, '');

		    foreach my $pi (@$pkglist) {
			$pi->{NotifyStatus} = $pi->{Version};
		    }
		    PVE::Tools::file_set_contents($pve_pkgstatus_fn, encode_json($pkglist));
		}
	    }

	    return;
	};

	return $rpcenv->fork_worker('aptupdate', undef, $authuser, $realcmd);

    }});

__PACKAGE__->register_method({
    name => 'changelog',
    path => 'changelog',
    method => 'GET',
    description => "Get package changelogs.",
    permissions => {
	check => ['perm', '/nodes/{node}', [ 'Sys.Modify' ]],
    },
    proxyto => 'node',
    parameters => {
	additionalProperties => 0,
	properties => {
	    node => get_standard_option('pve-node'),
	    name => {
		description => "Package name.",
		type => 'string',
	    },
	    version => {
		description => "Package version.",
		type => 'string',
		optional => 1,
	    },
	},
    },
    returns => {
	type => "string",
    },
    code => sub {
	my ($param) = @_;

	my $pkgname = $param->{name};

	my $cache = &$get_apt_cache();
	my $policy = $cache->policy;
	my $p = $cache->{$pkgname} || die "no such package '$pkgname'\n";
	my $pkgrecords = $cache->packages();

	my $ver;
	if ($param->{version}) {
	    if (my $available = $p->{VersionList}) {
		for my $v (@$available) {
		    if ($v->{VerStr} eq $param->{version}) {
			$ver = $v;
			last;
		    }
		}
	    }
	    die "package '$pkgname' version '$param->{version}' is not available\n" if !$ver;
	} else {
	    $ver = $policy->candidate($p) || die "no installation candidate for package '$pkgname'\n";
	}

	my $info = $pkgrecords->lookup($pkgname);

	my $pkgfile = &$get_pkgfile($ver);
	my $url;

	die "changelog for '${pkgname}_$ver->{VerStr}' not available\n"
	    if !($pkgfile && ($url = &$get_changelog_url($pkgname, $info, $ver->{VerStr}, $pkgfile)));

	my $data = "";

	my $dccfg = PVE::Cluster::cfs_read_file('datacenter.cfg');
	my $proxy = $dccfg->{http_proxy};

	my $ua = LWP::UserAgent->new;
	$ua->agent("PVE/1.0");
	$ua->timeout(10);
	$ua->max_size(1024*1024);
	$ua->ssl_opts(verify_hostname => 0); # don't care for changelogs

	if ($proxy) {
	    $ua->proxy(['http', 'https'], $proxy);
	} else {
	    $ua->env_proxy;
	}

	my $username;
	my $pw;

	if ($pkgfile->{Origin} eq 'Proxmox' && $pkgfile->{Component} eq 'pve-enterprise') {
	    my $info = PVE::API2::Subscription::read_etc_subscription();
	    if ($info->{status} eq 'active') {
		$username = $info->{key};
		$pw = PVE::API2Tools::get_hwaddress();
		$ua->credentials("enterprise.proxmox.com:443", 'pve-enterprise-repository',  $username, $pw);
	    }
	}

	my $response = $ua->get($url);

        if ($response->is_success) {
            $data = $response->decoded_content;
        } else {
	    PVE::Exception::raise($response->message, code => $response->code);
        }

	return $data;
    }});

__PACKAGE__->register_method({
    name => 'repositories',
    path => 'repositories',
    method => 'GET',
    proxyto => 'node',
    description => "Get APT repository information.",
    permissions => {
	check => ['perm', '/nodes/{node}', [ 'Sys.Audit' ]],
    },
    parameters => {
	additionalProperties => 0,
	properties => {
	    node => get_standard_option('pve-node'),
	},
    },
    returns => {
	type => "object",
	description => "Result from parsing the APT repository files in /etc/apt/.",
	properties => {
	    files => {
		type => "array",
		description => "List of parsed repository files.",
		items => {
		    type => "object",
		    properties => {
			path => {
			    type => "string",
			    description => "Path to the problematic file.",
			},
			'file-type' => {
			    type => "string",
			    enum => [ 'list', 'sources' ],
			    description => "Format of the file.",
			},
			repositories => {
			    type => "array",
			    description => "The parsed repositories.",
			    items => {
				type => "object",
				properties => {
				    Types => {
					type => "array",
					description => "List of package types.",
					items => {
					    type => "string",
					    enum => [ 'deb', 'deb-src' ],
					},
				    },
				    URIs => {
					description => "List of repository URIs.",
					type => "array",
					items => {
					    type => "string",
					},
				    },
				    Suites => {
					type => "array",
					description => "List of package distribuitions",
					items => {
					    type => "string",
					},
				    },
				    Components => {
					type => "array",
					description => "List of repository components",
					optional => 1, # not present if suite is absolute
					items => {
					    type => "string",
					},
				    },
				    Options => {
					type => "array",
					description => "Additional options",
					optional => 1,
					items => {
					    type => "object",
					    properties => {
						Key => {
						    type => "string",
						},
						Values => {
						    type => "array",
						    items => {
							type => "string",
						    },
						},
					    },
					},
				    },
				    Comment => {
					type => "string",
					description => "Associated comment",
					optional => 1,
				    },
				    FileType => {
					type => "string",
					enum => [ 'list', 'sources' ],
					description => "Format of the defining file.",
				    },
				    Enabled => {
					type => "boolean",
					description => "Whether the repository is enabled or not",
				    },
				},
			    },
			},
			digest => {
			    type => "array",
			    description => "Digest of the file as bytes.",
			    items => {
				type => "integer",
			    },
			},
		    },
		},
	    },
	    errors => {
		type => "array",
		description => "List of problematic repository files.",
		items => {
		    type => "object",
		    properties => {
			path => {
			    type => "string",
			    description => "Path to the problematic file.",
			},
			error => {
			    type => "string",
			    description => "The error message",
			},
		    },
		},
	    },
	    digest => {
		type => "string",
		description => "Common digest of all files.",
	    },
	    infos => {
		type => "array",
		description => "Additional information/warnings for APT repositories.",
		items => {
		    type => "object",
		    properties => {
			path => {
			    type => "string",
			    description => "Path to the associated file.",
			},
			index => {
			    type => "string",
			    description => "Index of the associated repository within the file.",
			},
			property => {
			    type => "string",
			    description => "Property from which the info originates.",
			    optional => 1,
			},
			kind => {
			    type => "string",
			    description => "Kind of the information (e.g. warning).",
			},
			message => {
			    type => "string",
			    description => "Information message.",
			}
		    },
		},
	    },
	    'standard-repos' => {
		type => "array",
		description => "List of standard repositories and their configuration status",
		items => {
		    type => "object",
		    properties => {
			handle => {
			    type => "string",
			    description => "Handle to identify the repository.",
			},
			name => {
			    type => "string",
			    description => "Full name of the repository.",
			},
			status => {
			    type => "boolean",
			    optional => 1,
			    description => "Indicating enabled/disabled status, if the " .
				"repository is configured.",
			},
		    },
		},
	    },
	},
    },
    code => sub {
	my ($param) = @_;

	return Proxmox::RS::APT::Repositories::repositories("pve");
    }});

__PACKAGE__->register_method({
    name => 'add_repository',
    path => 'repositories',
    method => 'PUT',
    description => "Add a standard repository to the configuration",
    permissions => {
	check => ['perm', '/nodes/{node}', [ 'Sys.Modify' ]],
    },
    protected => 1,
    proxyto => 'node',
    parameters => {
	additionalProperties => 0,
	properties => {
	    node => get_standard_option('pve-node'),
	    handle => {
		type => 'string',
		description => "Handle that identifies a repository.",
	    },
	    digest => {
		type => "string",
		description => "Digest to detect modifications.",
		maxLength => 80,
		optional => 1,
	    },
	},
    },
    returns => {
	type => 'null',
    },
    code => sub {
	my ($param) = @_;

	Proxmox::RS::APT::Repositories::add_repository($param->{handle}, "pve", $param->{digest});
    }});

__PACKAGE__->register_method({
    name => 'change_repository',
    path => 'repositories',
    method => 'POST',
    description => "Change the properties of a repository. Currently only allows enabling/disabling.",
    permissions => {
	check => ['perm', '/nodes/{node}', [ 'Sys.Modify' ]],
    },
    protected => 1,
    proxyto => 'node',
    parameters => {
	additionalProperties => 0,
	properties => {
	    node => get_standard_option('pve-node'),
	    path => {
		type => 'string',
		description => "Path to the containing file.",
	    },
	    index => {
		type => 'integer',
		description => "Index within the file (starting from 0).",
	    },
	    enabled => {
		type => 'boolean',
		description => "Whether the repository should be enabled or not.",
		optional => 1,
	    },
	    digest => {
		type => "string",
		description => "Digest to detect modifications.",
		maxLength => 80,
		optional => 1,
	    },
	},
    },
    returns => {
	type => 'null',
    },
    code => sub {
	my ($param) = @_;

	my $options = {};

	my $enabled = $param->{enabled};
	$options->{enabled} = int($enabled) if defined($enabled);

	Proxmox::RS::APT::Repositories::change_repository(
	    $param->{path},
	    int($param->{index}),
	    $options,
	    $param->{digest}
	);
    }});

__PACKAGE__->register_method({
    name => 'versions',
    path => 'versions',
    method => 'GET',
    proxyto => 'node',
    description => "Get package information for important Proxmox packages.",
    permissions => {
	check => ['perm', '/nodes/{node}', [ 'Sys.Audit' ]],
    },
    parameters => {
	additionalProperties => 0,
	properties => {
	    node => get_standard_option('pve-node'),
	},
    },
    returns => {
	type => "array",
	items => {
	    type => "object",
	    properties => {},
	},
    },
    code => sub {
	my ($param) = @_;

	my $cache = &$get_apt_cache();
	my $policy = $cache->policy;
	my $pkgrecords = $cache->packages();

	# order most important things first
	my @list = qw(proxmox-ve pve-manager);

	my $aptver = $AptPkg::System::_system->versioning();
	my $byver = sub { $aptver->compare($cache->{$b}->{CurrentVer}->{VerStr}, $cache->{$a}->{CurrentVer}->{VerStr}) };
	push @list, sort $byver grep { /^pve-kernel-/ && $cache->{$_}->{CurrentState} eq 'Installed' } keys %$cache;

        my @opt_pack = qw(
	    ceph
	    criu
	    gfs2-utils
	    ifupdown
	    ifupdown2
	    ksm-control-daemon
	    ksmtuned
	    libpve-apiclient-perl
	    libpve-network-perl
	    openvswitch-switch
	    proxmox-backup-file-restore
	    proxmox-offline-mirror-helper
	    pve-zsync
	    zfsutils-linux
	);

	my @pkgs = qw(
	    ceph-fuse
	    corosync
	    libjs-extjs
	    glusterfs-client
	    libknet1
	    libpve-access-control
	    libpve-common-perl
	    libpve-guest-common-perl
	    libpve-http-server-perl
	    libpve-storage-perl
	    libproxmox-acme-perl
	    libproxmox-backup-qemu0
	    libqb0
	    libspice-server1
	    lvm2
	    lxc-pve
	    lxcfs
	    novnc-pve
	    proxmox-backup-client
	    proxmox-mail-forward
	    proxmox-mini-journalreader
	    proxmox-widget-toolkit
	    pve-cluster
	    pve-container
	    pve-docs
	    pve-edk2-firmware
	    pve-firewall
	    pve-firmware
	    pve-ha-manager
	    pve-i18n
	    pve-qemu-kvm
	    pve-xtermjs
	    qemu-server
	    smartmontools
	    swtpm
	    spiceterm
	    vncterm
	);

	# add the rest ordered by name, easier to find for humans
	push @list, (sort @pkgs, @opt_pack);

	my (undef, undef, $kernel_release) = POSIX::uname();
	my $pvever =  PVE::pvecfg::version_text();

	my $pkglist = [];
	foreach my $pkgname (@list) {
	    my $p = $cache->{$pkgname};
	    my $info = $pkgrecords->lookup($pkgname);
	    my $candidate_ver = defined($p) ? $policy->candidate($p) : undef;
	    my $res;
	    if (my $current_ver = $p->{CurrentVer}) {
		$res = $assemble_pkginfo->($pkgname, $info, $current_ver, $candidate_ver || $current_ver);
	    } elsif ($candidate_ver) {
		$res = $assemble_pkginfo->($pkgname, $info, $candidate_ver, $candidate_ver);
		delete $res->{OldVersion};
	    } else {
		next;
	    }
	    $res->{CurrentState} = $p->{CurrentState};

	    # hack: add some useful information (used by 'pveversion -v')
	    if ($pkgname eq 'pve-manager') {
		$res->{ManagerVersion} = $pvever;
	    } elsif ($pkgname eq 'proxmox-ve') {
		$res->{RunningKernel} = $kernel_release;
	    }
	    if (grep( /^$pkgname$/, @opt_pack)) {
		next if $res->{CurrentState} eq 'NotInstalled';
	    }

	    push @$pkglist, $res;
	}

	return $pkglist;
    }});

1;
