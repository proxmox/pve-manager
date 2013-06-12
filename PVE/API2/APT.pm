package PVE::API2::APT;

use strict;
use warnings;
use File::stat ();

use PVE::Tools qw(extract_param);
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

my $apt_cache;

my $get_apt_cache = sub {
    
    return $apt_cache if $apt_cache;

    $apt_cache = AptPkg::Cache->new() || die "unable to initialize AptPkg::Cache\n";

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

my $assemble_pkginfo = sub {
    my ($pkgname, $info, $current_ver, $candidate_ver)  = @_;

    my $data = { 
	Package => $info->{Name},
	Title => $info->{ShortDesc},
    };

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

	# we try to cache results
	my $pve_pkgstatus_fn = "/var/lib/pve-manager/pkgupdates";

	if (my $st1 = File::stat::stat($pve_pkgstatus_fn)) {
	    my $st2 = File::stat::stat("/var/cache/apt/pkgcache.bin");
	    my $st3 = File::stat::stat("/var/lib/dpkg/status");
	
	    if ($st2->mtime < $st1->mtime && $st3->mtime < $st1->mtime) {
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

	my $pkglist = [];

	my $cache = &$get_apt_cache();
	my $policy = $cache->policy;
	my $pkgrecords = $cache->packages();

	foreach my $pkgname (keys %$cache) {
	    my $p = $cache->{$pkgname};
	    next if $p->{SelectedState} ne 'Install';
	    my $current_ver = $p->{CurrentVer};
	    my $candidate_ver = $policy->candidate($p);

	    if ($current_ver->{VerStr} ne $candidate_ver->{VerStr}) {
		my $info = $pkgrecords->lookup($pkgname);
		my $res = &$assemble_pkginfo($pkgname, $info, $current_ver, $candidate_ver);
		push @$pkglist, $res;
	    }
	}

	PVE::Tools::file_set_contents($pve_pkgstatus_fn, encode_json($pkglist));

	return $pkglist;
    }});

1;
