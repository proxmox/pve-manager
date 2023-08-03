package PVE::API2::Cluster::Notifications;

use warnings;
use strict;

use Storable qw(dclone);
use JSON;

use PVE::Tools qw(extract_param);
use PVE::JSONSchema qw(get_standard_option);
use PVE::RESTHandler;
use PVE::Notify;

use base qw(PVE::RESTHandler);

sub make_properties_optional {
    my ($properties) = @_;
    $properties = dclone($properties);

    for my $key (keys %$properties) {
	$properties->{$key}->{optional} = 1 if $key ne 'name';
    }

    return $properties;
}

sub raise_api_error {
    my ($api_error) = @_;

    if (!(ref($api_error) eq 'HASH' && $api_error->{message} && $api_error->{code})) {
	die $api_error;
    }

    my $msg = "$api_error->{message}\n";
    my $exc = PVE::Exception->new($msg, code => $api_error->{code});

    my (undef, $filename, $line) = caller;

    $exc->{filename} = $filename;
    $exc->{line} = $line;

    die $exc;
}

sub filter_entities_by_privs {
    my ($rpcenv, $entities) = @_;
    my $authuser = $rpcenv->get_user();

    my $can_see_mapping_privs = ['Mapping.Modify', 'Mapping.Use', 'Mapping.Audit'];

    my $filtered = [grep {
	$rpcenv->check_any(
	    $authuser,
	    "/mapping/notification/$_->{name}",
	    $can_see_mapping_privs,
	    1
	)
    } @$entities];

    return $filtered;
}

__PACKAGE__->register_method ({
    name => 'index',
    path => '',
    method => 'GET',
    description => 'Index for notification-related API endpoints.',
    permissions => { user => 'all' },
    parameters => {
	additionalProperties => 0,
	properties => {},
    },
    returns => {
	type => 'array',
	items => {
	    type => 'object',
	    properties => {},
	},
	links => [ { rel => 'child', href => '{name}' } ],
    },
    code => sub {
	my $result = [
	    { name => 'groups' },
	];

	return $result;
    }
});

my $group_properties = {
    name => {
	description => 'Name of the group.',
	type => 'string',
	format => 'pve-configid',
    },
    'endpoint' => {
	type => 'array',
	items => {
	    type => 'string',
	    format => 'pve-configid',
	},
	description => 'List of included endpoints',
    },
    'comment' => {
	description => 'Comment',
	type => 'string',
	optional => 1,
    },
    filter => {
	description => 'Name of the filter that should be applied.',
	type => 'string',
	format => 'pve-configid',
	optional => 1,
    },
};

__PACKAGE__->register_method ({
    name => 'get_groups',
    path => 'groups',
    method => 'GET',
    description => 'Returns a list of all groups',
    protected => 1,
    permissions => {
	description => "Only lists entries where you have 'Mapping.Modify', 'Mapping.Use' or"
	    . " 'Mapping.Audit' permissions on '/mapping/notification/<name>'.",
	user => 'all',
    },
    parameters => {
	additionalProperties => 0,
	properties => {},
    },
    returns => {
	type => 'array',
	items => {
	    type => 'object',
	    properties => $group_properties,
	},
	links => [ { rel => 'child', href => '{name}' } ],
    },
    code => sub {
	my $config = PVE::Notify::read_config();
	my $rpcenv = PVE::RPCEnvironment::get();

	my $entities = eval {
	    $config->get_groups();
	};
	raise_api_error($@) if $@;

	return filter_entities_by_privs($rpcenv, $entities);
    }
});

__PACKAGE__->register_method ({
    name => 'get_group',
    path => 'groups/{name}',
    method => 'GET',
    description => 'Return a specific group',
    protected => 1,
    permissions => {
	check => ['or',
	    ['perm', '/mapping/notification/{name}', ['Mapping.Modify']],
	    ['perm', '/mapping/notification/{name}', ['Mapping.Audit']],
	],
    },
    parameters => {
	additionalProperties => 0,
	properties => {
	    name => {
		type => 'string',
		format => 'pve-configid',
	    },
	}
    },
    returns => {
	type => 'object',
	properties => {
	    %$group_properties,
	    digest => get_standard_option('pve-config-digest'),
	},
    },
    code => sub {
	my ($param) = @_;
	my $name = extract_param($param, 'name');

	my $config = PVE::Notify::read_config();

	my $group = eval {
	    $config->get_group($name)
	};

	raise_api_error($@) if $@;
	$group->{digest} = $config->digest();

	return $group;
    }
});

__PACKAGE__->register_method ({
    name => 'create_group',
    path => 'groups',
    protected => 1,
    method => 'POST',
    description => 'Create a new group',
    permissions => {
	check => ['perm', '/mapping/notification', ['Mapping.Modify']],
    },
    parameters => {
	additionalProperties => 0,
	properties => $group_properties,
    },
    returns => { type => 'null' },
    code => sub {
	my ($param) = @_;

	my $name = extract_param($param, 'name');
	my $endpoint = extract_param($param, 'endpoint');
	my $comment = extract_param($param, 'comment');
	my $filter = extract_param($param, 'filter');

	eval {
	    PVE::Notify::lock_config(sub {
		my $config = PVE::Notify::read_config();

		$config->add_group(
		    $name,
		    $endpoint,
		    $comment,
		    $filter,
		);

		PVE::Notify::write_config($config);
	    });
	};

	raise_api_error($@) if $@;
	return;
    }
});

__PACKAGE__->register_method ({
    name => 'update_group',
    path => 'groups/{name}',
    protected => 1,
    method => 'PUT',
    description => 'Update existing group',
    permissions => {
	check => ['perm', '/mapping/notification/{name}', ['Mapping.Modify']],
    },
    parameters => {
	additionalProperties => 0,
	properties => {
	    %{ make_properties_optional($group_properties) },
	    delete => {
		type => 'array',
		items => {
		    type => 'string',
		    format => 'pve-configid',
		},
		optional => 1,
		description => 'A list of settings you want to delete.',
	    },
	    digest => get_standard_option('pve-config-digest'),
	},
    },
    returns => { type => 'null' },
    code => sub {
	my ($param) = @_;

	my $name = extract_param($param, 'name');
	my $endpoint = extract_param($param, 'endpoint');
	my $comment = extract_param($param, 'comment');
	my $filter = extract_param($param, 'filter');
	my $digest = extract_param($param, 'digest');
	my $delete = extract_param($param, 'delete');

	eval {
	    PVE::Notify::lock_config(sub {
		my $config = PVE::Notify::read_config();

		$config->update_group(
		    $name,
		    $endpoint,
		    $comment,
		    $filter,
		    $delete,
		    $digest,
		);

		PVE::Notify::write_config($config);
	    });
	};

	raise_api_error($@) if $@;
	return;
    }
});

__PACKAGE__->register_method ({
    name => 'delete_group',
    protected => 1,
    path => 'groups/{name}',
    method => 'DELETE',
    description => 'Remove group',
    permissions => {
	check => ['perm', '/mapping/notification/{name}', ['Mapping.Modify']],
    },
    parameters => {
	additionalProperties => 0,
	properties => {
	    name => {
		type => 'string',
		format => 'pve-configid',
	    },
	}
    },
    returns => { type => 'null' },
    code => sub {
	my ($param) = @_;
	my $name = extract_param($param, 'name');

	eval {
	    PVE::Notify::lock_config(sub {
		my $config = PVE::Notify::read_config();
		$config->delete_group($name);
		PVE::Notify::write_config($config);
	    });
	};

	raise_api_error($@) if $@;
	return;
    }
});

1;
