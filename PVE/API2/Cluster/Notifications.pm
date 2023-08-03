package PVE::API2::Cluster::Notifications;

use warnings;
use strict;

use Storable qw(dclone);
use JSON;

use PVE::Exception qw(raise_param_exc);
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

sub remove_protected_properties {
    my ($properties, $to_remove) = @_;
    $properties = dclone($properties);

    for my $key (keys %$properties) {
	if (grep /^$key$/, @$to_remove) {
	    delete $properties->{$key};
	}
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

sub target_used_by {
    my ($target) = @_;

    my $used_by = [];

    # Check keys in datacenter.cfg
    my $dc_conf = PVE::Cluster::cfs_read_file('datacenter.cfg');
    for my $key (qw(target-package-updates target-replication target-fencing)) {
	if ($dc_conf->{notify} && $dc_conf->{notify}->{$key} eq $target) {
	    push @$used_by, $key;
	}
    }

    # Check backup jobs
    my $jobs_conf = PVE::Cluster::cfs_read_file('jobs.cfg');
    for my $key (keys %{$jobs_conf->{ids}}) {
	my $job = $jobs_conf->{ids}->{$key};
	if ($job->{'notification-target'} eq $target) {
	    push @$used_by, $key;
	}
    }

    return join(', ', @$used_by);
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
	    { name => 'endpoints' },
	    { name => 'filters' },
	    { name => 'groups' },
	    { name => 'targets' },
	];

	return $result;
    }
});

__PACKAGE__->register_method ({
    name => 'endpoints_index',
    path => 'endpoints',
    method => 'GET',
    description => 'Index for all available endpoint types.',
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
	    { name => 'gotify' },
	    { name => 'sendmail' },
	];

	return $result;
    }
});

__PACKAGE__->register_method ({
    name => 'get_all_targets',
    path => 'targets',
    method => 'GET',
    description => 'Returns a list of all entities that can be used as notification targets' .
	' (endpoints and groups).',
    permissions => {
	description => "Only lists entries where you have 'Mapping.Modify', 'Mapping.Use' or"
	    . " 'Mapping.Audit' permissions on '/mapping/notification/<name>'.",
	user => 'all',
    },
    protected => 1,
    parameters => {
	additionalProperties => 0,
	properties => {},
    },
    returns => {
	type => 'array',
	items => {
	    type => 'object',
	    properties => {
		name => {
		    description => 'Name of the endpoint/group.',
		    type => 'string',
		    format => 'pve-configid',
		},
		'type' => {
		    description => 'Type of the endpoint or group.',
		    type  => 'string',
		    enum => [qw(sendmail gotify group)],
		},
		'comment' => {
		    description => 'Comment',
		    type        => 'string',
		    optional    => 1,
		},
	    },
	},
	links => [ { rel => 'child', href => '{name}' } ],
    },
    code => sub {
	my $config = PVE::Notify::read_config();
	my $rpcenv = PVE::RPCEnvironment::get();

	my $targets = eval {
	    my $result = [];

	    for my $target (@{$config->get_sendmail_endpoints()}) {
		push @$result, {
		    name => $target->{name},
		    comment => $target->{comment},
		    type => 'sendmail',
		};
	    }

	    for my $target (@{$config->get_gotify_endpoints()}) {
		push @$result, {
		    name => $target->{name},
		    comment => $target->{comment},
		    type => 'gotify',
		};
	    }

	    for my $target (@{$config->get_groups()}) {
		push @$result, {
		    name => $target->{name},
		    comment => $target->{comment},
		    type => 'group',
		};
	    }

	    $result
	};

	raise_api_error($@) if $@;

	return filter_entities_by_privs($rpcenv, $targets);
    }
});

__PACKAGE__->register_method ({
    name => 'test_target',
    path => 'targets/{name}/test',
    protected => 1,
    method => 'POST',
    description => 'Send a test notification to a provided target.',
    permissions => {
	check => ['or',
	    ['perm', '/mapping/notification/{name}', ['Mapping.Use']],
	    ['perm', '/mapping/notification/{name}', ['Mapping.Modify']],
	    ['perm', '/mapping/notification/{name}', ['Mapping.Audit']],
	],
    },
    parameters => {
	additionalProperties => 0,
	properties => {
	    name => {
		description => 'Name of the target.',
		type => 'string',
		format => 'pve-configid'
	    },
	},
    },
    returns => { type => 'null' },
    code => sub {
	my ($param) = @_;
	my $name = extract_param($param, 'name');

	my $config = PVE::Notify::read_config();

	eval {
	    $config->test_target($name);
	};

	raise_api_error($@) if $@;

	return;
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

	my $used_by = target_used_by($name);
	if ($used_by) {
	    raise_param_exc({'name' => "Cannot remove $name, used by: $used_by"});
	}

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

my $sendmail_properties = {
    name => {
	description => 'The name of the endpoint.',
	type => 'string',
	format => 'pve-configid',
    },
    mailto => {
	type => 'array',
	items => {
	    type => 'string',
	    format => 'email-or-username',
	},
	description => 'List of email recipients',
	optional => 1,
    },
    'mailto-user' => {
	type => 'array',
	items => {
	    type => 'string',
	    format => 'pve-userid',
	},
	description => 'List of users',
	optional => 1,
    },
    'from-address' => {
	description => '`From` address for the mail',
	type => 'string',
	optional => 1,
    },
    author => {
	description => 'Author of the mail',
	type => 'string',
	optional => 1,
    },
    'comment' => {
	description => 'Comment',
	type        => 'string',
	optional    => 1,
    },
    filter => {
	description => 'Name of the filter that should be applied.',
	type => 'string',
	format => 'pve-configid',
	optional => 1,
    },
};

__PACKAGE__->register_method ({
    name => 'get_sendmail_endpoints',
    path => 'endpoints/sendmail',
    method => 'GET',
    description => 'Returns a list of all sendmail endpoints',
    permissions => {
	description => "Only lists entries where you have 'Mapping.Modify', 'Mapping.Use' or"
	    . " 'Mapping.Audit' permissions on '/mapping/notification/<name>'.",
	user => 'all',
    },
    protected => 1,
    parameters => {
	additionalProperties => 0,
	properties => {},
    },
    returns => {
	type => 'array',
	items => {
	    type => 'object',
	    properties => $sendmail_properties,
	},
	links => [ { rel => 'child', href => '{name}' } ],
    },
    code => sub {
	my $config = PVE::Notify::read_config();
	my $rpcenv = PVE::RPCEnvironment::get();

	my $entities = eval {
	    $config->get_sendmail_endpoints();
	};
	raise_api_error($@) if $@;

	return filter_entities_by_privs($rpcenv, $entities);
    }
});

__PACKAGE__->register_method ({
    name => 'get_sendmail_endpoint',
    path => 'endpoints/sendmail/{name}',
    method => 'GET',
    description => 'Return a specific sendmail endpoint',
    permissions => {
	check => ['or',
	    ['perm', '/mapping/notification/{name}', ['Mapping.Modify']],
	    ['perm', '/mapping/notification/{name}', ['Mapping.Audit']],
	],
    },
    protected => 1,
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
	    %$sendmail_properties,
	    digest => get_standard_option('pve-config-digest'),
	}

    },
    code => sub {
	my ($param) = @_;
	my $name = extract_param($param, 'name');

	my $config = PVE::Notify::read_config();
	my $endpoint = eval {
	    $config->get_sendmail_endpoint($name)
	};

	raise_api_error($@) if $@;
	$endpoint->{digest} = $config->digest();

	return $endpoint;
    }
});

__PACKAGE__->register_method ({
    name => 'create_sendmail_endpoint',
    path => 'endpoints/sendmail',
    protected => 1,
    method => 'POST',
    description => 'Create a new sendmail endpoint',
    permissions => {
	check => ['perm', '/mapping/notification', ['Mapping.Modify']],
    },
    parameters => {
	additionalProperties => 0,
	properties => $sendmail_properties,
    },
    returns => { type => 'null' },
    code => sub {
	my ($param) = @_;

	my $name = extract_param($param, 'name');
	my $mailto = extract_param($param, 'mailto');
	my $mailto_user = extract_param($param, 'mailto-user');
	my $from_address = extract_param($param, 'from-address');
	my $author = extract_param($param, 'author');
	my $comment = extract_param($param, 'comment');
	my $filter = extract_param($param, 'filter');

	eval {
	    PVE::Notify::lock_config(sub {
		my $config = PVE::Notify::read_config();

		$config->add_sendmail_endpoint(
		    $name,
		    $mailto,
		    $mailto_user,
		    $from_address,
		    $author,
		    $comment,
		    $filter
		);

		PVE::Notify::write_config($config);
	    });
	};

	raise_api_error($@) if $@;
	return;
    }
});

__PACKAGE__->register_method ({
    name => 'update_sendmail_endpoint',
    path => 'endpoints/sendmail/{name}',
    protected => 1,
    method => 'PUT',
    description => 'Update existing sendmail endpoint',
    permissions => {
	check => ['perm', '/mapping/notification/{name}', ['Mapping.Modify']],
    },
    parameters => {
	additionalProperties => 0,
	properties => {
	    %{ make_properties_optional($sendmail_properties) },
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

	}
    },
    returns => { type => 'null' },
    code => sub {
	my ($param) = @_;

	my $name = extract_param($param, 'name');
	my $mailto = extract_param($param, 'mailto');
	my $mailto_user = extract_param($param, 'mailto-user');
	my $from_address = extract_param($param, 'from-address');
	my $author = extract_param($param, 'author');
	my $comment = extract_param($param, 'comment');
	my $filter = extract_param($param, 'filter');

	my $delete = extract_param($param, 'delete');
	my $digest = extract_param($param, 'digest');

	eval {
	    PVE::Notify::lock_config(sub {
		my $config = PVE::Notify::read_config();

		$config->update_sendmail_endpoint(
		    $name,
		    $mailto,
		    $mailto_user,
		    $from_address,
		    $author,
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
    name => 'delete_sendmail_endpoint',
    protected => 1,
    path => 'endpoints/sendmail/{name}',
    method => 'DELETE',
    description => 'Remove sendmail endpoint',
    permissions => {
	check => ['perm', '/mapping/notification', ['Mapping.Modify']],
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

	my $used_by = target_used_by($name);
	if ($used_by) {
	    raise_param_exc({'name' => "Cannot remove $name, used by: $used_by"});
	}

	eval {
	    PVE::Notify::lock_config(sub {
		my $config = PVE::Notify::read_config();
		$config->delete_sendmail_endpoint($name);
		PVE::Notify::write_config($config);
	    });
	};

	raise_api_error($@) if ($@);
	return;
    }
});

my $gotify_properties = {
    name => {
	description => 'The name of the endpoint.',
	type => 'string',
	format => 'pve-configid',
    },
    'server' => {
	description => 'Server URL',
	type => 'string',
    },
    'token' => {
	description => 'Secret token',
	type => 'string',
    },
    'comment' => {
	description => 'Comment',
	type        => 'string',
	optional    => 1,
    },
    'filter' => {
	description => 'Name of the filter that should be applied.',
	type => 'string',
	format => 'pve-configid',
	optional => 1,
    }
};

__PACKAGE__->register_method ({
    name => 'get_gotify_endpoints',
    path => 'endpoints/gotify',
    method => 'GET',
    description => 'Returns a list of all gotify endpoints',
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
	    properties => remove_protected_properties($gotify_properties, ['token']),
	},
	links => [ { rel => 'child', href => '{name}' } ],
    },
    code => sub {
	my $config = PVE::Notify::read_config();
	my $rpcenv = PVE::RPCEnvironment::get();

	my $entities = eval {
	    $config->get_gotify_endpoints();
	};
	raise_api_error($@) if $@;

	return filter_entities_by_privs($rpcenv, $entities);
    }
});

__PACKAGE__->register_method ({
    name => 'get_gotify_endpoint',
    path => 'endpoints/gotify/{name}',
    method => 'GET',
    description => 'Return a specific gotify endpoint',
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
		description => 'Name of the endpoint.'
	    },
	}
    },
    returns => {
	type => 'object',
	properties => {
	    %{ remove_protected_properties($gotify_properties, ['token']) },
	    digest => get_standard_option('pve-config-digest'),
	}
    },
    code => sub {
	my ($param) = @_;
	my $name = extract_param($param, 'name');

	my $config = PVE::Notify::read_config();
	my $endpoint = eval {
	    $config->get_gotify_endpoint($name)
	};

	raise_api_error($@) if $@;
	$endpoint->{digest} = $config->digest();

	return $endpoint;
    }
});

__PACKAGE__->register_method ({
    name => 'create_gotify_endpoint',
    path => 'endpoints/gotify',
    protected => 1,
    method => 'POST',
    description => 'Create a new gotify endpoint',
    permissions => {
	check => ['perm', '/mapping/notification', ['Mapping.Modify']],
    },
    parameters => {
	additionalProperties => 0,
	properties => $gotify_properties,
    },
    returns => { type => 'null' },
    code => sub {
	my ($param) = @_;

	my $name = extract_param($param, 'name');
	my $server = extract_param($param, 'server');
	my $token = extract_param($param, 'token');
	my $comment = extract_param($param, 'comment');
	my $filter = extract_param($param, 'filter');

	eval {
	    PVE::Notify::lock_config(sub {
		my $config = PVE::Notify::read_config();

		$config->add_gotify_endpoint(
		    $name,
		    $server,
		    $token,
		    $comment,
		    $filter
		);

		PVE::Notify::write_config($config);
	    });
	};

	raise_api_error($@) if $@;
	return;
    }
});

__PACKAGE__->register_method ({
    name => 'update_gotify_endpoint',
    path => 'endpoints/gotify/{name}',
    protected => 1,
    method => 'PUT',
    description => 'Update existing gotify endpoint',
    permissions => {
	check => ['perm', '/mapping/notification/{name}', ['Mapping.Modify']],
    },
    parameters => {
	additionalProperties => 0,
	properties => {
	    %{ make_properties_optional($gotify_properties) },
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
	}
    },
    returns => { type => 'null' },
    code => sub {
	my ($param) = @_;

	my $name = extract_param($param, 'name');
	my $server = extract_param($param, 'server');
	my $token = extract_param($param, 'token');
	my $comment = extract_param($param, 'comment');
	my $filter = extract_param($param, 'filter');

	my $delete = extract_param($param, 'delete');
	my $digest = extract_param($param, 'digest');

	eval {
	    PVE::Notify::lock_config(sub {
		my $config = PVE::Notify::read_config();

		$config->update_gotify_endpoint(
		    $name,
		    $server,
		    $token,
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
    name => 'delete_gotify_endpoint',
    protected => 1,
    path => 'endpoints/gotify/{name}',
    method => 'DELETE',
    description => 'Remove gotify endpoint',
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

	my $used_by = target_used_by($name);
	if ($used_by) {
	    raise_param_exc({'name' => "Cannot remove $name, used by: $used_by"});
	}

	eval {
	    PVE::Notify::lock_config(sub {
		my $config = PVE::Notify::read_config();
		$config->delete_gotify_endpoint($name);
		PVE::Notify::write_config($config);
	    });
	};

	raise_api_error($@) if $@;
	return;
    }
});

my $filter_properties = {
    name => {
	description => 'Name of the endpoint.',
	type => 'string',
	format => 'pve-configid',
    },
    'min-severity' => {
	type => 'string',
	description => 'Minimum severity to match',
	optional => 1,
	enum => [qw(info notice warning error)],
    },
    mode => {
	type => 'string',
	description => "Choose between 'and' and 'or' for when multiple properties are specified",
	optional => 1,
	enum => [qw(and or)],
	default => 'and',
    },
    'invert-match' => {
	type => 'boolean',
	description => 'Invert match of the whole filter',
	optional => 1,
    },
    'comment' => {
	description => 'Comment',
	type        => 'string',
	optional    => 1,
    },
};

__PACKAGE__->register_method ({
    name => 'get_filters',
    path => 'filters',
    method => 'GET',
    description => 'Returns a list of all filters',
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
	    properties => $filter_properties,
	},
	links => [ { rel => 'child', href => '{name}' } ],
    },
    code => sub {
	my $config = PVE::Notify::read_config();
	my $rpcenv = PVE::RPCEnvironment::get();

	my $entities = eval {
	    $config->get_filters();
	};
	raise_api_error($@) if $@;

	return filter_entities_by_privs($rpcenv, $entities);
    }
});

__PACKAGE__->register_method ({
    name => 'get_filter',
    path => 'filters/{name}',
    method => 'GET',
    description => 'Return a specific filter',
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
	    %$filter_properties,
	    digest => get_standard_option('pve-config-digest'),
	},
    },
    code => sub {
	my ($param) = @_;
	my $name = extract_param($param, 'name');

	my $config = PVE::Notify::read_config();

	my $filter = eval {
	    $config->get_filter($name)
	};

	raise_api_error($@) if $@;
	$filter->{digest} = $config->digest();

	return $filter;
    }
});

__PACKAGE__->register_method ({
    name => 'create_filter',
    path => 'filters',
    protected => 1,
    method => 'POST',
    description => 'Create a new filter',
    protected => 1,
    permissions => {
	check => ['perm', '/mapping/notification', ['Mapping.Modify']],
    },
    parameters => {
	additionalProperties => 0,
	properties => $filter_properties,
    },
    returns => { type => 'null' },
    code => sub {
	my ($param) = @_;

	my $name = extract_param($param, 'name');
	my $min_severity = extract_param($param, 'min-severity');
	my $mode = extract_param($param, 'mode');
	my $invert_match = extract_param($param, 'invert-match');
	my $comment = extract_param($param, 'comment');

	eval {
	    PVE::Notify::lock_config(sub {
		my $config = PVE::Notify::read_config();

		$config->add_filter(
		    $name,
		    $min_severity,
		    $mode,
		    $invert_match,
		    $comment,
		);

		PVE::Notify::write_config($config);
	    });
	};

	raise_api_error($@) if $@;
	return;
    }
});

__PACKAGE__->register_method ({
    name => 'update_filter',
    path => 'filters/{name}',
    protected => 1,
    method => 'PUT',
    description => 'Update existing filter',
    permissions => {
	check => ['perm', '/mapping/notification/{name}', ['Mapping.Modify']],
    },
    parameters => {
	additionalProperties => 0,
	properties => {
	    %{ make_properties_optional($filter_properties) },
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
	my $min_severity = extract_param($param, 'min-severity');
	my $mode = extract_param($param, 'mode');
	my $invert_match = extract_param($param, 'invert-match');
	my $comment = extract_param($param, 'comment');
	my $digest = extract_param($param, 'digest');
	my $delete = extract_param($param, 'delete');

	eval {
	    PVE::Notify::lock_config(sub {
		my $config = PVE::Notify::read_config();

		$config->update_filter(
		    $name,
		    $min_severity,
		    $mode,
		    $invert_match,
		    $comment,
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
    name => 'delete_filter',
    protected => 1,
    path => 'filters/{name}',
    method => 'DELETE',
    description => 'Remove filter',
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
		$config->delete_filter($name);
		PVE::Notify::write_config($config);
	    });
	};

	raise_api_error($@) if $@;
	return;
    }
});

1;
