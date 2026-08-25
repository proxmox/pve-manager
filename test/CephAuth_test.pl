#!/usr/bin/perl

use strict;
use warnings;

use lib ('.', '..');

use Test::More;
use PVE::Ceph::Services;

# The cipher landed mid-release, so $AES256K_MIN_CEPH_RELEASE has to answer per major and
# not just compare against one minimum. Both the full 'ceph versions' string and the bare
# 'ceph_version_short' of the daemon metadata reach ceph_version_supports_aes256k(), which
# is why it accepts either.
my $versions = [
    ['19.2.6', 1, 'the squid release that added the cipher'],
    ['19.2.5', 0, 'the squid release before it'],
    ['19.2.10', 1, 'a later squid, numerically not lexically'],
    ['19.1.9', 0, 'a lower minor in the same major'],
    ['20.2.4', 1, 'the tentacle release that added the cipher'],
    ['20.2.3', 0, 'the tentacle release before it'],
    ['20.3.0', 1, 'a higher minor in the same major'],
    ['18.2.7', 0, 'reef never got the cipher'],
    ['21.0.0', 1, 'a major past every known one always carries it'],
    ['20.2', 0, 'a missing patch level counts as zero'],
    ['ceph version 19.2.6 (0000) squid (stable)', 1, 'the full version string'],
    ['ceph version 19.2.5 (0000) squid (stable)', 0, 'the full string of an older release'],
    ['19.2.6-124-gabcdef', 1, 'a dev build judged by the release in front of the suffix'],
    ['', undef, 'an empty string is unknown, not a no'],
    [undef, undef, 'an undefined version is unknown, not a no'],
    ['garbage', undef, 'an unparsable version is unknown, not a no'],
];

for my $test (@$versions) {
    my ($version, $expected, $name) = @$test;
    is(PVE::Ceph::Services::ceph_version_supports_aes256k($version), $expected, $name);
}

# Only kernel 7.0 and later speak aes256k, and this decides whether client keys may migrate
# at all, so a wrong answer here costs a node its RBD and CephFS access.
my $kernels = [
    ['7.0.14-2-pve', 1, 'the first kernel with support, as uname reports it'],
    ['6.14.11-1-pve', 0, 'a 6.14 kernel, which must not compare as newer than 7.0'],
    ['6.9', 0, 'a single digit minor, which a string compare would get wrong'],
    ['10.1.0', 1, 'a two digit major'],
    ['', undef, 'an empty release is unknown, not a no'],
    [undef, undef, 'an undefined release is unknown, not a no'],
];

for my $test (@$kernels) {
    my ($release, $expected, $name) = @$test;
    is(PVE::Ceph::Services::kernel_supports_aes256k($release), $expected, $name);
}

# The verdicts are what an operator acts on, so pin the branch matrix and not just the
# lookup tables. Two false all-clear bugs came out of these branches: an unreadable key list
# reading as "nothing left", and an unreadable quorum reading as "not supported yet".
my $base = {
    monmap => { auth_service_cipher => 'aes' },
    daemons => { mon => [{ 'supports-aes256k' => 1 }] },
    'daemons-without-aes256k' => [],
    quorum => { 'supports-aes256k' => 1 },
    entities => { service => {}, client => {}, complete => 1 },
    nodes => {},
};
my $verdicts = sub { PVE::Ceph::Services::cephx_migration_verdicts({ $base->%*, @_ }) };

is_deeply(
    [grep { /predates the aes256k cipher/ } $verdicts->(monmap => {})->@*],
    [
        "The monitors report no cipher settings, so either this cluster's Ceph release predates"
            . " the aes256k cipher or 'mon dump' did not answer. Nothing about the key migration"
            . " can be judged before that is resolved."
    ],
    'a release without cipher settings yields one cannot-judge verdict',
);

# an unreadable key list must not read as "nothing is left"
my $incomplete = $verdicts->(entities => { service => {}, client => {}, complete => 0 });
is(scalar(grep { /No service key left/ } @$incomplete), 0, 'no false all-clear for service keys');
is(scalar(grep { /No client key left/ } @$incomplete), 0, 'no false all-clear for client keys');
is(
    scalar(grep { /Cannot tell which service keys/ } @$incomplete),
    1,
    'says the service list is unknown',
);

# an unreadable quorum must not claim the monitors need a restart, nor that keys can move
my $noquorum = $verdicts->(
    quorum => { 'feature-source' => 'unknown, could not read the quorum features' },
    entities => { service => { aes => ['osd.0'] }, client => {}, complete => 1 },
);
is(scalar(grep { /restart the monitors/ } @$noquorum), 0, 'no restart advice on an unknown quorum');
is(
    scalar(grep { /can be migrated now/ } @$noquorum),
    0,
    'no migrate-now advice on an unknown quorum',
);
is(scalar(grep { /quorum features could not be/ } @$noquorum), 1, 'says the quorum is unknown');

# and the healthy path still reads as before
my $ok = $verdicts->(entities => { service => {}, client => {}, complete => 1 });
is(scalar(grep { /No rolling restart needed/ } @$ok), 1, 'a healthy cluster still says so');

# The verdict tests above build their input directly, so they cannot catch a bug in the
# collector. Drive the collector itself with a fake RADOS: a failed 'quorum_status' has to
# leave the feature unknown. Reporting it as unsupported would turn a quorum that cannot be
# read into a confident "restart the monitors".
{

    package FakeRados;

    sub new {
        my ($class, %fail) = @_;
        return bless { fail => \%fail }, $class;
    }

    sub mon_command {
        my ($self, $cmd) = @_;
        my $prefix = $cmd->{prefix};
        die "$prefix unavailable\n" if $self->{fail}->{$prefix};
        return { checks => {} } if $prefix eq 'health';
        return {
            epoch => 9,
            auth_service_cipher => { name => 'aes' },
            auth_preferred_cipher => { name => 'aes' },
            auth_allowed_ciphers => [{ name => 'aes' }, { name => 'aes256k' }],
            }
            if $prefix eq 'mon dump';
        return { mon => { 'ceph version 19.2.6 (0) squid (stable)' => 3 } }
            if $prefix eq 'versions';
        return { quorum_names => ['a'], features => { quorum_mon => ['cephx_auth_aes256k'] } }
            if $prefix eq 'quorum_status';
        return { data => { secrets => [] } } if $prefix eq 'auth dump-keys';
        return [] if $prefix =~ m/metadata$/;
        return {};
    }

    sub mon_cmd { my $self = shift; return $self->mon_command(@_); }
}

my $status = PVE::Ceph::Services::get_cephx_auth_status(FakeRados->new());
is($status->{quorum}->{'supports-aes256k'}, 1, 'a readable quorum reports the feature');

my $blind = PVE::Ceph::Services::get_cephx_auth_status(FakeRados->new('quorum_status' => 1));
ok(
    !exists $blind->{quorum}->{'supports-aes256k'},
    'an unreadable quorum leaves the feature absent rather than reporting it unsupported',
);
is(
    scalar(grep { m/restart the monitors/ } $blind->{conclusion}->@*),
    0,
    'an unreadable quorum does not advise restarting the monitors',
);

my $nokeys = PVE::Ceph::Services::get_cephx_auth_status(FakeRados->new('auth dump-keys' => 1));
is($nokeys->{entities}->{complete}, 0, 'an unreadable key list is marked incomplete');
is(
    scalar(grep { m/No service key left/ } $nokeys->{conclusion}->@*),
    0,
    'an unreadable key list does not read as an all-clear',
);

done_testing();
