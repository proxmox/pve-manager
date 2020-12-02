package PVE::API2::Cluster::MetricServer;

use warnings;
use strict;

use PVE::Tools qw(extract_param);
use PVE::Exception qw(raise_perm_exc raise_param_exc);
use PVE::JSONSchema qw(get_standard_option);
use PVE::RPCEnvironment;
use PVE::ExtMetric;

use PVE::RESTHandler;

use base qw(PVE::RESTHandler);

__PACKAGE__->register_method ({
    name => 'index',
    path => '',
    method => 'GET',
    description => "Metrics index.",
    permissions => { user => 'all' },
    parameters => {
	additionalProperties => 0,
	properties => {},
    },
    returns => {
	type => 'array',
	items => {
	    type => "object",
	    properties => {},
	},
	links => [ { rel => 'child', href => "{name}" } ],
    },
    code => sub {
	my ($param) = @_;

	my $result = [
	    { name => 'server' },
	];

	return $result;
    }
});

__PACKAGE__->register_method ({
    name => 'server_index',
    path => 'server',
    method => 'GET',
    description => "List configured metric servers.",
    permissions => {
	check => ['perm', '/', ['Sys.Audit']],
    },
    parameters => {
	additionalProperties => 0,
	properties => {},
    },
    returns => {
	type => 'array',
	items => {
	    type => "object",
	    properties => {
		id => {
		    description => "The ID of the entry.",
		    type => 'string'
		},
		disable => {
		    description => "Flag to disable the plugin.",
		    type => 'boolean',
		},
		type => {
		    description => "Plugin type.",
		    type => 'string',
		},
		server => {
		    description => "Server dns name or IP address",
		    type => 'string',
		},
		port => {
		    description => "Server network port",
		    type => 'integer',
		},
	    },
	},
	links => [ { rel => 'child', href => "{id}" } ],
    },
    code => sub {
	my ($param) = @_;

	my $res = [];
	my $status_cfg = PVE::Cluster::cfs_read_file('status.cfg');

	for my $id (sort keys %{$status_cfg->{ids}}) {
	    my $plugin_config = $status_cfg->{ids}->{$id};
	    push @$res, {
		id => $id,
		disable => $plugin_config->{disable} // 0,
		type => $plugin_config->{type},
		server => $plugin_config->{server},
		port => $plugin_config->{port},
	    };
	}

	return $res;
    }});

__PACKAGE__->register_method ({
    name => 'read',
    path => 'server/{id}',
    method => 'GET',
    description => "Read metric server configuration.",
    permissions => {
	check => ['perm', '/', ['Sys.Audit']],
    },
    parameters => {
	additionalProperties => 0,
	properties => {
	    id => {
		type => 'string',
		format => 'pve-configid',
	    },
	},
    },
    returns => { type => 'object' },
    code => sub {
	my ($param) = @_;

	my $status_cfg = PVE::Cluster::cfs_read_file('status.cfg');
	my $id = $param->{id};

	if (!defined($status_cfg->{ids}->{$id})) {
	    die "status server entry '$id' does not exist\n";
	}

	return $status_cfg->{ids}->{$id};
    }});

__PACKAGE__->register_method ({
    name => 'create',
    path => 'server/{id}',
    protected => 1,
    method => 'POST',
    description => "Create a new external metric server config",
    permissions => {
	check => ['perm', '/', ['Sys.Modify']],
    },
    parameters => PVE::Status::Plugin->createSchema(),
    returns => { type => 'null' },
    code => sub {
	my ($param) = @_;

	my $type = extract_param($param, 'type');
	my $plugin = PVE::Status::Plugin->lookup($type);
	my $id = extract_param($param, 'id');

	PVE::Cluster::cfs_lock_file('status.cfg', undef, sub {
	    my $cfg = PVE::Cluster::cfs_read_file('status.cfg');

	    die "Metric server '$id' already exists\n"
		if $cfg->{ids}->{$id};

	    my $opts = $plugin->check_config($id, $param, 1, 1);

	    $plugin->test_connection($opts);

	    $cfg->{ids}->{$id} = $opts;

	    PVE::Cluster::cfs_write_file('status.cfg', $cfg);
	});
	die $@ if $@;

	return;
    }});


__PACKAGE__->register_method ({
    name => 'update',
    protected => 1,
    path => 'server/{id}',
    method => 'PUT',
    description => "Update metric server configuration.",
    permissions => {
	check => ['perm', '/', ['Sys.Modify']],
    },
    parameters => PVE::Status::Plugin->updateSchema(),
    returns => { type => 'null' },
    code => sub {
	my ($param) = @_;

	my $id = extract_param($param, 'id');
	my $digest = extract_param($param, 'digest');
	my $delete = extract_param($param, 'delete');

	PVE::Cluster::cfs_lock_file('status.cfg', undef, sub {
	    my $cfg = PVE::Cluster::cfs_read_file('status.cfg');

	    PVE::SectionConfig::assert_if_modified($cfg, $digest);

	    my $data = $cfg->{ids}->{$id};
	    die "no such server '$id'\n" if !$data;

	    my $plugin = PVE::Status::Plugin->lookup($data->{type});
	    my $opts = $plugin->check_config($id, $param, 0, 1);

	    $plugin->test_connection($opts);

	    for my $k (keys %$opts) {
		$data->{$k} = $opts->{$k};
	    }

	    if ($delete) {
		my $options = $plugin->private()->{options}->{$data->{type}};
		for my $k (PVE::Tools::split_list($delete)) {
		    my $d = $options->{$k} || die "no such option '$k'\n";
		    die "unable to delete required option '$k'\n" if !$d->{optional};
		    die "unable to delete fixed option '$k'\n" if $d->{fixed};
		    die "cannot set and delete property '$k' at the same time!\n"
			if defined($opts->{$k});

		    delete $data->{$k};
		}
	    }

	    PVE::Cluster::cfs_write_file('status.cfg', $cfg);
	});
	die $@ if $@;

	return;
    }});

__PACKAGE__->register_method ({
    name => 'delete',
    protected => 1,
    path => 'server/{id}',
    method => 'DELETE',
    description => "Remove Metric server.",
    permissions => {
	check => ['perm', '/', ['Sys.Modify']],
    },
    parameters => {
	additionalProperties => 0,
	properties => {
	    id => {
		type => 'string',
		format => 'pve-configid',
	    },
	}
    },
    returns => { type => 'null' },
    code => sub {
	my ($param) = @_;

	PVE::Cluster::cfs_lock_file('status.cfg', undef, sub {
	    my $cfg = PVE::Cluster::cfs_read_file('status.cfg');

	    my $id = $param->{id};
	    delete $cfg->{ids}->{$id};
	    PVE::Cluster::cfs_write_file('status.cfg', $cfg);
	});
	die $@ if $@;

	return;
    }});

1;
