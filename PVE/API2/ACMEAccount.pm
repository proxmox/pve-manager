package PVE::API2::ACMEAccount;

use strict;
use warnings;

use PVE::ACME;
use PVE::CertHelpers;
use PVE::Exception qw(raise_param_exc);
use PVE::JSONSchema qw(get_standard_option);
use PVE::RPCEnvironment;
use PVE::Tools qw(extract_param);

use base qw(PVE::RESTHandler);

my $acme_directories = [
    {
	name => 'Let\'s Encrypt V2',
	url => 'https://acme-v02.api.letsencrypt.org/directory',
    },
    {
	name => 'Let\'s Encrypt V2 Staging',
	url => 'https://acme-staging-v02.api.letsencrypt.org/directory',
    },
];

my $acme_default_directory_url = $acme_directories->[0]->{url};

my $account_contact_from_param = sub {
    my ($param) = @_;
    return [ map { "mailto:$_" } PVE::Tools::split_list(extract_param($param, 'contact')) ];
};

my $acme_account_dir = PVE::CertHelpers::acme_account_dir();

__PACKAGE__->register_method ({
    name => 'index',
    path => '',
    method => 'GET',
    permissions => { user => 'all' },
    description => "ACMEAccount index.",
    parameters => {
	additionalProperties => 0,
	properties => {
	},
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

	return [
	    { name => 'account' },
	    { name => 'tos' },
	    { name => 'directories' },
	];
    }});

__PACKAGE__->register_method ({
    name => 'account_index',
    path => 'account',
    method => 'GET',
    permissions => { user => 'all' },
    description => "ACMEAccount index.",
    protected => 1,
    parameters => {
	additionalProperties => 0,
	properties => {
	},
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

	my $accounts = PVE::CertHelpers::list_acme_accounts();
	return [ map { { name => $_ }  } @$accounts ];
    }});

__PACKAGE__->register_method ({
    name => 'register_account',
    path => 'account',
    method => 'POST',
    description => "Register a new ACME account with CA.",
    protected => 1,
    parameters => {
	additionalProperties => 0,
	properties => {
	    name => get_standard_option('pve-acme-account-name'),
	    contact => get_standard_option('pve-acme-account-contact'),
	    tos_url => {
		type => 'string',
		description => 'URL of CA TermsOfService - setting this indicates agreement.',
		optional => 1,
	    },
	    directory => get_standard_option('pve-acme-directory-url', {
		default => $acme_default_directory_url,
		optional => 1,
	    }),
	},
    },
    returns => {
	type => 'string',
    },
    code => sub {
	my ($param) = @_;

	my $account_name = extract_param($param, 'name') // 'default';
	my $account_file = "${acme_account_dir}/${account_name}";

	mkdir $acme_account_dir;

	raise_param_exc({'name' => "ACME account config file '${account_name}' already exists."})
	    if -e $account_file;

	my $directory = extract_param($param, 'directory') // $acme_default_directory_url;
	my $contact = $account_contact_from_param->($param);

	my $rpcenv = PVE::RPCEnvironment::get();

	my $authuser = $rpcenv->get_user();

	my $realcmd = sub {
	    PVE::Cluster::cfs_lock_acme($account_name, 10, sub {
		die "ACME account config file '${account_name}' already exists.\n"
		    if -e $account_file;

		my $acme = PVE::ACME->new($account_file, $directory);
		print "Generating ACME account key..\n";
		$acme->init(4096);
		print "Registering ACME account..\n";
		eval { $acme->new_account($param->{tos_url}, contact => $contact); };
		if ($@) {
		    warn "$@\n";
		    unlink $account_file;
		    die "Registration failed!\n";
		}
		print "Registration successful, account URL: '$acme->{location}'\n";
	    });
	    die $@ if $@;
	};

	return $rpcenv->fork_worker('acmeregister', undef, $authuser, $realcmd);
    }});

my $update_account = sub {
    my ($param, $msg, %info) = @_;

    my $account_name = extract_param($param, 'name') // 'default';
    my $account_file = "${acme_account_dir}/${account_name}";

    raise_param_exc({'name' => "ACME account config file '${account_name}' does not exist."})
	if ! -e $account_file;


    my $rpcenv = PVE::RPCEnvironment::get();

    my $authuser = $rpcenv->get_user();

    my $realcmd = sub {
	PVE::Cluster::cfs_lock_acme($account_name, 10, sub {
	    die "ACME account config file '${account_name}' does not exist.\n"
		if ! -e $account_file;

	    my $acme = PVE::ACME->new($account_file);
	    $acme->load();
	    $acme->update_account(%info);
	    if ($info{status} && $info{status} eq 'deactivated') {
		my $deactivated_name;
		for my $i (0..100) {
		    my $candidate = "${acme_account_dir}/_deactivated_${account_name}_${i}";
		    if (! -e $candidate) {
			$deactivated_name = $candidate;
			last;
		    }
		}
		if ($deactivated_name) {
		    print "Renaming account file from '$account_file' to '$deactivated_name'\n";
		    rename($account_file, $deactivated_name) or
			warn ".. failed - $!\n";
		} else {
		    warn "No free slot to rename deactivated account file '$account_file', leaving in place\n";
		}
	    }
	});
	die $@ if $@;
    };

    return $rpcenv->fork_worker("acme${msg}", undef, $authuser, $realcmd);
};

__PACKAGE__->register_method ({
    name => 'update_account',
    path => 'account/{name}',
    method => 'PUT',
    description => "Update existing ACME account information with CA. Note: not specifying any new account information triggers a refresh.",
    protected => 1,
    parameters => {
	additionalProperties => 0,
	properties => {
	    name => get_standard_option('pve-acme-account-name'),
	    contact => get_standard_option('pve-acme-account-contact', {
		optional => 1,
	    }),
	},
    },
    returns => {
	type => 'string',
    },
    code => sub {
	my ($param) = @_;

	my $contact = $account_contact_from_param->($param);
	if (scalar @$contact) {
	    return $update_account->($param, 'update', contact => $contact);
	} else {
	    return $update_account->($param, 'refresh');
	}
    }});

__PACKAGE__->register_method ({
    name => 'get_account',
    path => 'account/{name}',
    method => 'GET',
    description => "Return existing ACME account information.",
    protected => 1,
    parameters => {
	additionalProperties => 0,
	properties => {
	    name => get_standard_option('pve-acme-account-name'),
	},
    },
    returns => {
	type => 'object',
	additionalProperties => 0,
	properties => {
	    account => {
		type => 'object',
		optional => 1,
		renderer => 'yaml',
	    },
	    directory => get_standard_option('pve-acme-directory-url', {
		optional => 1,
	    }),
	    location => {
		type => 'string',
		optional => 1,
	    },
	    tos => {
		type => 'string',
		optional => 1,
	    },
	},
    },
    code => sub {
	my ($param) = @_;

	my $account_name = extract_param($param, 'name') // 'default';
	my $account_file = "${acme_account_dir}/${account_name}";

	raise_param_exc({'name' => "ACME account config file '${account_name}' does not exist."})
	    if ! -e $account_file;

	my $acme = PVE::ACME->new($account_file);
	$acme->load();

	my $res = {};
	$res->{account} = $acme->{account};
	$res->{directory} = $acme->{directory};
	$res->{location} = $acme->{location};
	$res->{tos} = $acme->{tos};

	return $res;
    }});

__PACKAGE__->register_method ({
    name => 'deactivate_account',
    path => 'account/{name}',
    method => 'DELETE',
    description => "Deactivate existing ACME account at CA.",
    protected => 1,
    parameters => {
	additionalProperties => 0,
	properties => {
	    name => get_standard_option('pve-acme-account-name'),
	},
    },
    returns => {
	type => 'string',
    },
    code => sub {
	my ($param) = @_;

	return $update_account->($param, 'deactivate', status => 'deactivated');
    }});

__PACKAGE__->register_method ({
    name => 'get_tos',
    path => 'tos',
    method => 'GET',
    description => "Retrieve ACME TermsOfService URL from CA.",
    permissions => { user => 'all' },
    parameters => {
	additionalProperties => 0,
	properties => {
	    directory => get_standard_option('pve-acme-directory-url', {
		default => $acme_default_directory_url,
		optional => 1,
	    }),
	},
    },
    returns => {
	type => 'string',
	description => 'ACME TermsOfService URL.',
    },
    code => sub {
	my ($param) = @_;

	my $directory = extract_param($param, 'directory') // $acme_default_directory_url;

	my $acme = PVE::ACME->new(undef, $directory);
	my $meta = $acme->get_meta();

	return $meta ? $meta->{termsOfService} : undef;
    }});

__PACKAGE__->register_method ({
    name => 'get_directories',
    path => 'directories',
    method => 'GET',
    description => "Get named known ACME directory endpoints.",
    permissions => { user => 'all' },
    parameters => {
	additionalProperties => 0,
	properties => {},
    },
    returns => {
	type => 'array',
	items => {
	    type => 'object',
	    additionalProperties => 0,
	    properties => {
		name => {
		    type => 'string',
		},
		url => get_standard_option('pve-acme-directory-url'),
	    },
	},
    },
    code => sub {
	my ($param) = @_;

	return $acme_directories;
    }});

1;
