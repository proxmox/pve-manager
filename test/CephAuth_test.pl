#!/usr/bin/perl

use strict;
use warnings;

use lib ('.', '..');

use Test::More;
use JSON qw(encode_json);
use PVE::Ceph::Services;
use PVE::CLI::pveceph;

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

my $ok = $verdicts->(entities => { service => {}, client => {}, complete => 1 });
is(
    scalar(grep { /Every reported Ceph daemon version supports aes256k/ } @$ok),
    1,
    'the verdict states the reported cipher capability, not staged-key readiness',
);

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
        return $self->{dump} // { data => { secrets => [] } } if $prefix eq 'auth dump-keys';
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
ok(!$nokeys->{entities}->{'pending-keys-known'}, 'the pending-key inventory is also unknown');
is(
    scalar(grep { m/No service key left/ } $nokeys->{conclusion}->@*),
    0,
    'an unreadable key list does not read as an all-clear',
);

my $secret = 'AQ-this-must-not-be-displayed';
my $with_pending = PVE::Ceph::Services::get_cephx_auth_status(bless(
    {
        fail => {},
        dump => {
            data => {
                secrets => [
                    {
                        entity => { type_str => 'client', id => 'store' },
                        auth => {
                            key => { type_str => 'aes', secret => $secret },
                            pending_key => { type_str => 'aes256k', secret => $secret },
                        },
                    },
                    {
                        entity => { type_str => 'osd', id => '0' },
                        auth => { key => { type_str => 'aes256k', secret => $secret } },
                    },
                ],
            },
        },
    },
    'FakeRados',
));
is_deeply(
    $with_pending->{entities}->{details}->{'client.store'},
    { class => 'client', 'current-cipher' => 'aes', 'pending-cipher' => 'aes256k' },
    'the safe entity detail names both current and pending ciphers',
);
ok($with_pending->{entities}->{'pending-keys-known'}, 'the pending-key inventory is known');
is($with_pending->{entities}->{'pending-keys'}, 1, 'the pending-key count remains compatible');
unlike(encode_json($with_pending), qr/\Q$secret\E/, 'the status response retains no key material');
like(
    join("\n", $with_pending->{conclusion}->@*),
    qr/pending key.*workflow that staged it is known/s,
    'pending-key advice does not assume that the migration helper owns it',
);

my $old_kernel = $verdicts->(
    entities => { service => {}, client => { aes => ['client.bootstrap-osd'] }, complete => 1 },
    nodes => {
        due => {
            kernel => '6.14.11-1-pve',
            source => 'ceph daemon metadata',
            'supports-aes256k' => 0,
        },
    },
);
my $old_kernel_text = join("\n", @$old_kernel);
like(
    $old_kernel_text,
    qr/Kernel compatibility constrains only keys read by kernel RBD or CephFS clients/,
    'an old kernel does not block every client key',
);
like(
    $old_kernel_text,
    qr/metadata can be stale.*Verify 'uname -r'/s,
    'remote daemon metadata carries its freshness caveat',
);
unlike($old_kernel_text, qr/Client keys have to stay/, 'the old categorical verdict is gone');

my $current_kernel = $verdicts->(
    entities => { service => {}, client => { aes => ['client.admin'] }, complete => 1 },
    nodes => {
        due => {
            kernel => '7.0.14-2-pve',
            source => 'ceph daemon metadata',
            'supports-aes256k' => 1,
        },
    },
);
my $current_kernel_text = join("\n", @$current_kernel);
unlike(
    $current_kernel_text,
    qr/metadata can be stale/,
    'supported metadata avoids a routine caveat',
);
like(
    $current_kernel_text,
    qr/pve-cephx-rotate-service-keys --rotate-all-storage-keys --rotate-admin-key/,
    'status prints the concrete documented client-key preview',
);
unlike(
    $current_kernel_text,
    qr/appropriate option/,
    'status does not send readers to infer an option',
);

my $first_step = $verdicts->(
    entities => { service => { aes => ['osd.0'] }, client => {}, complete => 1 },
);
like(
    join("\n", @$first_step),
    qr{/pve-cephx-rotate-service-keys --rotate-cluster-keys},
    'the first migration preview selects all cluster-owned keys',
);
unlike(join("\n", @$first_step), qr/then again with '--apply'/, 'it does not suggest bare apply');

my @users = map { sprintf('client.storage%02d', $_) } 1 .. 50;
my $formatted = '';
{
    open(my $stdout, '>', \$formatted) or die $!;
    local *STDOUT = $stdout;
    PVE::CLI::pveceph::format_auth_status(
        {
            conclusion => ["50 client keys still need migration. Preview the selected action."],
            quorum => {},
            monmap => {},
            daemons => {},
            entities => {
                source => 'auth dump-keys',
                complete => 1,
                client => { aes => \@users },
                service => {},
                details => {
                    map {
                        $_ => {
                            class => 'client',
                            'current-cipher' => 'aes',
                            (
                                $_ eq 'client.storage01'
                                ? ('pending-cipher' => 'aes256k')
                                : ()
                            ),
                        }
                    } @users
                },
                'pending-keys-known' => 1,
                'pending-keys' => 1,
            },
            nodes => {},
            checks => {},
        },
        {},
        { 'output-format' => 'text' },
    );
}
like(
    $formatted,
    qr/^Cephx key cipher status\n\nCurrent state and next step\n/s,
    'the text formatter leads with conclusions and actions',
);
like(
    $formatted,
    qr/Pending key ciphers\n  'ceph auth ls' omits pending keys;/,
    'the text formatter explains why auth status has a separate pending-key inventory',
);
like(
    $formatted,
    qr/client\.storage01: current aes, pending aes256k/,
    'the text formatter names the cipher identity of a pending key',
);
like(
    $formatted,
    qr/client on aes \(50\):.*\.\.\. 26 more/s,
    'a 50-user current-cipher inventory is bounded but keeps its exact count',
);
cmp_ok(
    (sort { $b <=> $a } map { length($_) } split(/\n/, $formatted))[0],
    '<=',
    100,
    'the synthetic 50-user text output stays within 100 columns',
);

my $fallback_output = '';
{
    open(my $stdout, '>', \$fallback_output) or die $!;
    local *STDOUT = $stdout;
    PVE::CLI::pveceph::format_auth_status(
        { %$nokeys, conclusion => [] },
        {},
        { 'output-format' => 'text' },
    );
}
like(
    $fallback_output,
    qr/Pending key ciphers.*unavailable because 'auth dump-keys' could not be read/s,
    'fallback text says that pending-cipher knowledge is unavailable',
);

done_testing();
