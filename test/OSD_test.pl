#!/usr/bin/perl

use strict;
use warnings;

use lib ('.', '..');

use Errno qw(EACCES ENOENT);
use File::Temp qw(tempdir);
use JSON;
use MIME::Base64 qw(encode_base64);
use Test::More;
use PVE::API2::Ceph::OSD;
use PVE::Tools;

use Data::Dumper;

# NOTE: not exhaustive, reduced to actually required fields!
my $tree = {
    nodes => [
        {
            id => -3,
            name => 'pveA',
            children => [0, 1, 2, 3],
            type => 'host',
        },
        {
            id => -5,
            name => 'pveB',
            children => [4, 5, 6, 7],
            type => 'host',
        },
        {
            id => -7,
            name => 'pveC',
            children => [8, 9, 10, 11],
            type => 'host',
        },
    ],
};

# Check if all the grep and casts are correct
my @belong_to_B = (4, 5);
my @not_belong_to_B = (-1, 1, 10, 15);
foreach (@belong_to_B) {
    is(
        PVE::API2::Ceph::OSD::osd_belongs_to_node($tree, 'pveB', $_),
        1,
        "OSD $_ belongs to node pveB",
    );
}
foreach (@not_belong_to_B) {
    is(
        PVE::API2::Ceph::OSD::osd_belongs_to_node($tree, 'pveB', $_),
        0,
        "OSD $_ does not belong to node pveB",
    );
}

my $double_nodes_tree = {
    nodes => [
        {
            name => 'pveA',
            type => 'host',
        },
        {
            name => 'pveA',
            type => 'host',
        },
    ],
};
eval { PVE::API2::Ceph::OSD::osd_belongs_to_node($double_nodes_tree, 'pveA') };
like($@, qr/duplicate host name found/, "Die if node occurs too often");

is(
    PVE::API2::Ceph::OSD::osd_belongs_to_node(undef),
    0,
    "Early-return false if there's no/empty node tree",
);

# Destroying an OSD has to leave nothing of it behind on the monitors.

{

    package FakeRados;

    sub new {
        my ($class) = @_;
        return bless { commands => [] }, $class;
    }

    sub mon_command {
        my ($self, $cmd) = @_;
        push $self->{commands}->@*, $cmd;
        return {};
    }
}

my $rados = FakeRados->new();
{
    my $out = '';
    open(my $stdout, '>', \$out) or die $!;
    local *STDOUT = $stdout;
    # the API hands over the OSD ID as a string
    PVE::API2::Ceph::OSD::remove_osd_from_monitors($rados, '7');
}

my $commands = $rados->{commands};

# The monitors look up the OSD's UUID in the OSD map to find its lockbox entity and its
# dm-crypt key, so the destroy has to come before the 'osd rm'.
is_deeply(
    [map { $_->{prefix} } @$commands],
    ['osd crush remove', 'auth del', 'osd destroy-actual', 'osd rm', 'config rm', 'config rm'],
    'the monitors drop the CRUSH entry, the keys and the OSD itself, in that order',
);

my ($destroy) = grep { $_->{prefix} eq 'osd destroy-actual' } @$commands;
like(encode_json($destroy), qr/"id":7[,}]/, "'osd destroy-actual' names the OSD as an integer");
ok($destroy->{yes_i_really_mean_it}, 'and confirms, as the monitors refuse it otherwise');

# The bootstrap keyring has to hold a key the monitors accept.

{

    package FakeAuthRados;

    sub new {
        my ($class, %replies) = @_;
        return bless { replies => \%replies }, $class;
    }

    sub mon_cmd {
        my ($self, $cmd, $noerr) = @_;
        my $reply = $self->{replies}->{ $cmd->{prefix} } or die "unexpected '$cmd->{prefix}'\n";
        die "mon_cmd failed - $reply->{status_message}\n" if !$noerr && $reply->{return_code} < 0;
        return $reply;
    }
}

# parse_storage_key() only accepts well-formed keys
sub fake_key {
    my ($fill) = @_;
    return encode_base64(pack('vVVv', 2, 0, 0, 32) . ($fill x 32), '');
}

sub auth_reply {
    my (%entry) = @_;
    return { return_code => 0, data => [{ entity => 'client.bootstrap-osd', %entry }] };
}

my ($active, $pending, $old) = map { fake_key($_) } qw(a p o);
my $keyring = tempdir(CLEANUP => 1) . '/ceph.keyring';

sub keyring_holds {
    my ($key) = @_;
    my $content = PVE::Tools::file_get_contents($keyring);
    return $content =~ m/^\tkey = \Q$key\E$/m ? 1 : 0;
}

sub prepare_keyring {
    my ($key) = @_;
    unlink($keyring);
    return if !defined($key);
    PVE::Tools::file_set_contents($keyring, "[client.bootstrap-osd]\n\tkey = $key\n");
    utime(1, 1, $keyring); # tells an untouched file apart from a rewritten one
}

sub update_keyring {
    my (%replies) = @_;
    return PVE::API2::Ceph::OSD::update_bootstrap_osd_keyring(FakeAuthRados->new(%replies),
        $keyring);
}

prepare_keyring(undef);
my $updated = update_keyring('auth get' => auth_reply(key => $active));
ok(keyring_holds($active) && !$updated, 'a missing keyring is created, which counts as no update');

prepare_keyring($active);
$updated = update_keyring('auth get' => auth_reply(key => $active));
ok(!$updated && (stat($keyring))[9] == 1, 'a keyring with the current key is left alone');

prepare_keyring($old);
$updated = update_keyring('auth get' => auth_reply(key => $active));
ok($updated && keyring_holds($active), 'an outdated key is replaced with the current one');

prepare_keyring($pending);
$updated = update_keyring('auth get' => auth_reply(key => $active, pending_key => $pending));
ok(!$updated && (stat($keyring))[9] == 1, 'a staged key, which also authenticates, is kept');

prepare_keyring(undef);
update_keyring(
    'auth get' => { return_code => -ENOENT, status_message => 'failed to find' },
    'auth get-or-create' => auth_reply(key => $active),
);
ok(keyring_holds($active), 'a missing auth entry is created and its key written');

eval {
    update_keyring('auth get' => { return_code => -EACCES, status_message => 'access denied' });
};
like($@, qr/could not read 'client.bootstrap-osd' - access denied/, 'a failed read is reported');

done_testing();
