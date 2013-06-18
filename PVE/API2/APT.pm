package PVE::API2::APT;

use strict;
use warnings;
use File::stat ();

use LWP::UserAgent;

use PVE::Tools qw(extract_param);
use PVE::Cluster;
use PVE::SafeSyslog;
use PVE::INotify;
use PVE::Exception qw(raise_param_exc);
use PVE::RESTHandler;
use PVE::RPCEnvironment;

use JSON;
use PVE::JSONSchema qw(get_standard_option);

use AptPkg::Cache;
use AptPkg::Version;
use AptPkg::PkgRecords;

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
	    { id => 'update' },
	    { id => 'upgrade' },
	    { id => 'changelog' },
	];

	return $res;
    }});

my $get_changelug_url = sub {
    my ($pkgname, $info, $candidate_ver) = @_;

    my $changelog_url;
    foreach my $verfile (@{$candidate_ver->{FileList}}) {
	my $pkgfile = $verfile->{File};
	my $origin = $pkgfile->{Origin};
	my $comp = $pkgfile->{Component};
	if ($origin && $comp) {
	    my $pkgver = $candidate_ver->{VerStr};
	    $pkgver =~ s/^\d+://; # strip epoch
	    my $srcpkg = $info->{SourcePkg} || $pkgname;
	    my $firstLetter = substr($srcpkg, 0, 1);
	    if ($origin eq 'Debian') {
		$changelog_url = "http://packages.debian.org/changelogs/pool/$comp/" . 
		    "$firstLetter/$srcpkg/${srcpkg}_$pkgver/changelog";
	    }
	    last;
	}
    }
    return $changelog_url;
};

my $assemble_pkginfo = sub {
    my ($pkgname, $info, $current_ver, $candidate_ver)  = @_;

    my $data = { 
	Package => $info->{Name},
	Title => $info->{ShortDesc},
    };

    if (my $changelog_url = &$get_changelug_url($pkgname, $info, $candidate_ver)) {
	$data->{ChangeLogUrl} = $changelog_url;
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
    $data->{OldVersion} = $current_ver->{VerStr};

    return $data;
};

# we try to cache results
my $pve_pkgstatus_fn = "/var/lib/pve-manager/pkgupdates";

my $update_pve_pkgstatus = sub {

    syslog('info', "update new package list: $pve_pkgstatus_fn");

    my $pkglist = [];

    my $cache = &$get_apt_cache();
    my $policy = $cache->policy;
    my $pkgrecords = $cache->packages();

    foreach my $pkgname (keys %$cache) {
	my $p = $cache->{$pkgname};
	next if $p->{SelectedState} ne 'Install';
	my $current_ver = $p->{CurrentVer};
	my $candidate_ver = $policy->candidate($p);

	if ($pkgname eq 'apt' || $current_ver->{VerStr} ne $candidate_ver->{VerStr}) {
	    my $info = $pkgrecords->lookup($pkgname);
	    my $res = &$assemble_pkginfo($pkgname, $info, $current_ver, $candidate_ver);
	    push @$pkglist, $res;
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
		my $data;
		eval {
		    my $jsonstr = PVE::Tools::file_get_contents($pve_pkgstatus_fn, 5*1024*1024);
		    $data = decode_json($jsonstr);
		};
		if (my $err = $@) {
		    warn "error readin cached package status in $pve_pkgstatus_fn\n";
		    # continue and overwrite cache with new content
		} else {
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

	    my $cmd = ['apt-get', 'update'];

	    print "starting apt-get update\n";
	    
	    PVE::Tools::run_command($cmd);

	    &$update_pve_pkgstatus();

	    return;
	};

	return $rpcenv->fork_worker('aptupdate', undef, $authuser, $realcmd);

    }});

__PACKAGE__->register_method({
    name => 'upgrade', 
    path => 'upgrade', 
    method => 'POST',
    description => "Install the newest versions of all packages (apt-get dist-upgrade).",
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
	type => 'string',
    },
    code => sub {
	my ($param) = @_;

	my $rpcenv = PVE::RPCEnvironment::get();

	my $authuser = $rpcenv->get_user();

	my $realcmd = sub {
	    my $upid = shift;

	    my $cmd = ['apt-get', 'dist-upgrade', '--assume-yes'];

	    print "starting apt-get dist-upgrade\n";

	    $ENV{DEBIAN_FRONTEND} = 'noninteractive';
	    
	    PVE::Tools::run_command($cmd);

	    &$update_pve_pkgstatus();

	    return;
	};

	return $rpcenv->fork_worker('aptupgrade', undef, $authuser, $realcmd);

    }});

__PACKAGE__->register_method({
    name => 'changelog', 
    path => 'changelog', 
    method => 'GET',
    description => "Get package changelogs.",
    permissions => {
	check => ['perm', '/nodes/{node}', [ 'Sys.Modify' ]],
    },
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
	    die "package '$pkgname' version '$param->{version}' is not avalable\n" if !$ver;
	} else {
	    $ver = $policy->candidate($p) || die "no installation candidate for package '$pkgname'\n";
	}

	my $info = $pkgrecords->lookup($pkgname);

	my $url = &$get_changelug_url($pkgname, $info, $ver) ||
	    die "changelog for '${pkgname}_$ver->{VerStr}' not available\n";

	my $data = "";

	my $dccfg = PVE::Cluster::cfs_read_file('datacenter.cfg');
	my $proxy = $dccfg->{http_proxy};

	my $ua = LWP::UserAgent->new;
	$ua->agent("PVE/1.0");
	$ua->timeout(10);
	$ua->max_size(1024*1024);
  
	if ($proxy) {
	    $ua->proxy(['http'], $proxy);
	} else {
	    $ua->env_proxy;
	}

	my $response = $ua->get($url);

        if ($response->is_success) {
            $data = $response->decoded_content;
        } else {
            die $response->status_line;
        }

	return $data;
    }});

1;
