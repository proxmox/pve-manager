package PVE::API2;

use strict;
use warnings;

use PVE::pvecfg;
use PVE::RESTHandler;
use PVE::JSONSchema;

use base qw(PVE::RESTHandler);

# preload classes
use PVE::API2::Cluster;
use PVE::API2::Nodes;
use PVE::API2::Pool;
use PVE::API2::AccessControl;
use PVE::API2::Storage::Config;

__PACKAGE__->register_method ({
    subclass => "PVE::API2::Cluster",  
    path => 'cluster',
});

__PACKAGE__->register_method ({
    subclass => "PVE::API2::Nodes",  
    path => 'nodes',
});

__PACKAGE__->register_method ({
    subclass => "PVE::API2::Storage::Config",  
    path => 'storage',
});

__PACKAGE__->register_method ({
    subclass => "PVE::API2::AccessControl",  
    path => 'access',
});

__PACKAGE__->register_method ({
    subclass => "PVE::API2::Pool",  
    path => 'pools',
});

__PACKAGE__->register_method ({
    name => 'index', 
    path => '',
    method => 'GET',
    permissions => { user => 'all' },
    description => "Directory index.",
    parameters => {
	additionalProperties => 0,
	properties => {},
    },
    returns => {
	type => 'array',
	items => {
	    type => "object",
	    properties => {
		subdir => { type => 'string' },
	    },
	},
	links => [ { rel => 'child', href => "{subdir}" } ],
    },
    code => sub {
	my ($resp, $param) = @_;
    
	my $res = [ { subdir => 'version' } ];

	my $ma = PVE::API2->method_attributes();

	foreach my $info (@$ma) {
	    next if !$info->{subclass};

	    my $subpath = $info->{match_re}->[0];

	    push @$res, { subdir => $subpath };
	}

	return $res;
    }});

__PACKAGE__->register_method ({
    name => 'version', 
    path => 'version',
    method => 'GET',
    permissions => { user => 'all' },
    description => "API version details. The result also includes the global datacenter confguration.",
    parameters => {
	additionalProperties => 0,
	properties => {},
    },
    returns => {
	type => "object",
	properties => {
	    version => { type => 'string' },
	    release => { type => 'string' },
	    repoid => { type => 'string' },
	},
    },
    code => sub {
	my ($resp, $param) = @_;
    
	my $res = PVE::Cluster::cfs_read_file('datacenter.cfg');

	my $vi = PVE::pvecfg::version_info();
	foreach my $k (qw(version release repoid)) {
	    $res->{$k} = $vi->{$k};
	}
	
	return $res;
    }});

1;
