package PVE::CLI::pvenode;

use strict;
use warnings;

use PVE::API2::ACME;
use PVE::API2::ACMEAccount;
use PVE::API2::Certificates;
use PVE::API2::NodeConfig;

use PVE::CertHelpers;
use PVE::Certificate;
use PVE::Exception qw(raise_param_exc raise);
use PVE::JSONSchema qw(get_standard_option);
use PVE::NodeConfig;
use PVE::RPCEnvironment;

use Term::ReadLine;

use base qw(PVE::CLIHandler);

my $nodename = PVE::INotify::nodename();

sub setup_environment {
    PVE::RPCEnvironment->setup_default_cli_env();
}

my $upid_exit = sub {
    my $upid = shift;
    my $status = PVE::Tools::upid_read_status($upid);
    print "Task $status\n";
    exit($status eq 'OK' ? 0 : -1);
};

sub param_mapping {
    my ($name) = @_;

    my $mapping = {
	'upload_custom_cert' => [
	    'certificates',
	    'key',
	],
    };

    return $mapping->{$name};
}

__PACKAGE__->register_method({
    name => 'acme_register',
    path => 'acme_register',
    method => 'POST',
    description => "Register a new ACME account with a compatible CA.",
    parameters => {
	additionalProperties => 0,
	properties => {
	    name => get_standard_option('pve-acme-account-name'),
	    contact => get_standard_option('pve-acme-account-contact'),
	    directory => get_standard_option('pve-acme-directory-url', {
		optional => 1,
	    }),
	},
    },
    returns => { type => 'null' },
    code => sub {
	my ($param) = @_;

	if (!$param->{directory}) {
	    my $directories = PVE::API2::ACMEAccount->get_directories({});
	    print "Directory endpoints:\n";
	    my $i = 0;
	    while ($i < @$directories) {
		print $i, ") ", $directories->[$i]->{name}, " (", $directories->[$i]->{url}, ")\n";
		$i++;
	    }
	    print $i, ") Custom\n";

	    my $term = Term::ReadLine->new('pvenode');
	    my $get_dir_selection = sub {
		my $selection = $term->readline("Enter selection:\n");
		if ($selection =~ /^(\d+)$/) {
		    $selection = $1;
		    if ($selection == $i) {
			$param->{directory} = $term->readline("Enter URL:\n");
			return;
		    } elsif ($selection < $i && $selection >= 0) {
			$param->{directory} = $directories->[$selection]->{url};
			return;
		    }
		}
		print "Invalid selection.\n";
	    };

	    my $attempts = 0;
	    while (!$param->{directory}) {
		die "Aborting.\n" if $attempts > 3;
		$get_dir_selection->();
		$attempts++;
	    }
	}
	print "\nAttempting to fetch Terms of Service from '$param->{directory}'..\n";
	my $tos = PVE::API2::ACMEAccount->get_tos({ directory => $param->{directory} });
	if ($tos) {
	    print "Terms of Service: $tos\n";
	    my $term = Term::ReadLine->new('pvenode');
	    my $agreed = $term->readline('Do you agree to the above terms? [y|N]');
	    die "Cannot continue without agreeing to ToS, aborting.\n"
		if ($agreed !~ /^y$/i);

	    $param->{tos_url} = $tos;
	} else {
	    print "No Terms of Service found, proceeding.\n";
	}
	print "\nAttempting to register account with '$param->{directory}'..\n";

	$upid_exit->(PVE::API2::ACMEAccount->register_account($param));
    }});

my $print_cert_info = sub {
    my ($cert) = @_;

    print "Certificate '$cert->{filename}'\n";
    print "\tFP: '$cert->{fingerprint}'\n" if $cert->{fingerprint};
    print "\tSubject: '$cert->{subject}'\n" if $cert->{subject};
    print "\tIssuer: '$cert->{issuer}'\n" if $cert->{issuer};
    print "\tnotBefore: " . localtime($cert->{notbefore}) . "\n" if $cert->{notbefore};
    print "\tnotAfter: " . localtime($cert->{notafter}) . "\n" if $cert->{notafter};
    if (scalar(@{$cert->{san}})) {
	print "\tSubjectAlternativeNames:\n";
	for my $name (@{$cert->{san}}) {
	    print "\t\t-$name\n";
	}
    }
    print "\n";
};

my $print_acme_account = sub {
    my ($account) = @_;

    print "Directory URL: $account->{directory}\n" if $account->{directory};
    print "Account URL: $account->{location}\n" if $account->{location};
    print "Terms Of Service: $account->{tos}\n" if $account->{tos};

    my $data = $account->{account};
    if ($data) {
	print "\nAccount information:\n";
	print "ID: $data->{id}\n" if $data->{id};
	if ($data->{contact}) {
	    print "Contact:\n";
	    for my $contact (@{$data->{contact}}) {
		print "\t- $contact\n";
	    }
	}
	print "Creation date: $data->{createdAt}\n" if $data->{createdAt};
	print "Initial IP: $data->{initialIp}\n" if $data->{initialIp};
	print "Status: $data->{status}\n" if $data->{status};
    }
};

our $cmddef = {
    config => {
	get => [ 'PVE::API2::NodeConfig', 'get_config', [], { node => $nodename }, sub {
	    my ($res) = @_;
	    print PVE::NodeConfig::write_node_config($res);
	}],
        set => [ 'PVE::API2::NodeConfig', 'set_options', [], { node => $nodename } ],
    },

    cert => {
	info => [ 'PVE::API2::Certificates', 'info', [], { node => $nodename }, sub {
	    my ($res) = @_;
	    for my $cert (@$res) { $print_cert_info->($cert); }
	}],
	set => [ 'PVE::API2::Certificates', 'upload_custom_cert', ['certificates', 'key'], { node => $nodename }, $print_cert_info ],
	delete => [ 'PVE::API2::Certificates', 'remove_custom_cert', ['restart'], { node => $nodename } ],
    },

    acme => {
	account => {
	    list => [ 'PVE::API2::ACMEAccount', 'account_index', [], {}, sub {
		my ($res) = @_;
		for my $acc (@$res) {
		    print "$acc->{name}\n";
		}
	    }],
	    register => [ __PACKAGE__, 'acme_register', ['name', 'contact'], {}, $upid_exit ],
	    deactivate => [ 'PVE::API2::ACMEAccount', 'deactivate_account', ['name'], {}, $upid_exit ],
	    info => [ 'PVE::API2::ACMEAccount', 'get_account', ['name'], {}, $print_acme_account],
	    update => [ 'PVE::API2::ACMEAccount', 'update_account', ['name'], {}, $upid_exit ],
	},
	cert => {
	    order => [ 'PVE::API2::ACME', 'new_certificate', [], { node => $nodename }, $upid_exit ],
	    renew => [ 'PVE::API2::ACME', 'renew_certificate', [], { node => $nodename }, $upid_exit ],
	    revoke => [ 'PVE::API2::ACME', 'revoke_certificate', [], { node => $nodename }, $upid_exit ],
	},
    },
};

1;
