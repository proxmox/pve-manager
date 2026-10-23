#!/usr/bin/perl

use v5.36;

use lib ('.', '..');

use Fcntl qw(:flock);
use File::Temp qw(tempdir);
use JSON;
use Test::More;
use Test::MockModule;

use PVE::API2::AccessLog;
use PVE::API2::Nodes;

my $dir = tempdir(CLEANUP => 1);
my $path = "$dir/access.log";
open my $log, '>', $path or die $!;
print {$log} <<'LOG';
192.0.2.1 - root@pam [22/10/2026:12:00:00 +0000] "GET /first?password=SECRET HTTP/1.1 padding" 200 5
192.0.2.2 - root@pam!token [22/10/2026:12:00:01 +0000] "GET /second HTTP/1.1" 403 0
192.0.2.3 - alice@pve [22/10/2026:12:00:02 +0000] "GET /third HTTP/1.1 [-] "GET /other HTTP/1.1" 500 9
LOG
close $log or die $!;

$PVE::API2::AccessLog::SCAN_LOCK = "$dir/scan.lck";
$PVE::API2::AccessLog::LOG_DIR = $dir;

my $user = 'auditor@pve';
my $rpcenv = Test::MockModule->new('PVE::RPCEnvironment');
$rpcenv->mock(get => sub { bless {}, 'PVE::RPCEnvironment' });
$rpcenv->mock(get_user => sub { $user });

my $binding = Test::MockModule->new('Proxmox::RS::AccessLog');
my $binding_error;
for my $name (qw(query query_newer)) {
    my $native = Proxmox::RS::AccessLog->can($name);
    $binding->mock(
        $name => sub {
            die 'unexpected log path' if $_[0] ne $path;
            die $binding_error if $binding_error;
            return $native->(@_);
        },
    );
}

sub invoke($name, $params) {
    my $info = PVE::API2::AccessLog->map_method_by_name($name);
    return PVE::API2::AccessLog->handle($info, { node => 'localhost', %$params }, 1);
}

subtest 'paging and redaction' => sub {
    my $info = PVE::API2::AccessLog->map_method_by_name('access_log');
    is($info->{path}, '', 'page owns the subtree root');
    my (undef, $routed) = PVE::API2::Nodes::Nodeinfo->find_handler('GET', 'access-log', {});
    is($routed, $info, 'routed below the node');
    is($info->{proxyto}, 'node', 'node proxying');
    ok($info->{protected}, 'protected worker');
    is_deeply(
        $info->{permissions}->{check},
        ['perm', '/nodes/{node}', ['Sys.Syslog']],
        'permissions',
    );
    for my $identity ('root@pam', 'root@pam!token', 'auditor@pve') {
        $user = $identity;
        my $first = invoke('access_log', { limit => '2', since => '0' });
        is(scalar($first->{entries}->@*), 2, "$identity page limit");
        ok(!exists($first->{entries}->[0]->{status}), 'unknown status omitted');
        ok(!exists($first->{entries}->[0]->{size}), 'unknown size omitted');
        is($first->{entries}->[1]->{status}, 403, 'known status remains numeric');
        my $last = invoke('access_log', { cursor => $first->{'next-cursor'} });
        ok($last->{complete}, 'continuation reaches the end');
        is(scalar($last->{entries}->@*), 1, 'continuation has the remaining entry');
        is(!!(encode_json($last) =~ /SECRET/), $identity eq 'root@pam', 'query redaction');
        is(
            !!exists($last->{entries}->[0]->{'request-line'}),
            $identity eq 'root@pam',
            'raw-region redaction',
        );
        my $newer = invoke('access_log', { after => $first->{'head-cursor'} });
        is_deeply($newer->{entries}, [], 'follow mode has no new entries');
        ok($newer->{complete}, 'follow mode covers the append range');
    }
    for my $case (
        [{ cursor => 'bad' }, undef, 400],
        [{ cursor => 'bad', after => 'bad' }, undef, 400],
        [{}, { code => 400, message => 'invalid request' }, 400],
        [{}, { code => 500, message => 'read failed' }, 500],
    ) {
        my ($params, $error, $status) = @$case;
        $binding_error = $error;
        eval { invoke('access_log', $params); };
        isa_ok($@, 'PVE::Exception');
        is($@->{code}, $status, 'error classification');
    }
    $binding_error = undef;
};

subtest 'date-named copies' => sub {
    my $dated = "$dir/access.log-20261021";
    open(my $copy, '>', $dated) or die $!;
    close($copy) or die $!;
    utime(1000, 1000, $dated) or die $!;

    my $page = invoke('access_log', {});
    is_deeply($page->{'dated-copies'}, ['access.log-20261021'], 'named on the last page');
    ok(!$page->{complete}, 'the history is not complete');
    my $later = invoke('access_log', { since => '2000' });
    ok(!$later->{'dated-copies'}, 'not if modified before the time range');
    my $newer = invoke('access_log', { after => $page->{'head-cursor'} });
    ok(!$newer->{'dated-copies'}, 'not when following the log');
    ok($newer->{complete}, 'following the log stays complete');

    unlink($dated) or die $!;
};

subtest 'one scan at a time' => sub {
    open(my $lock, '>', $PVE::API2::AccessLog::SCAN_LOCK) or die $!;
    chmod(0644, $lock) or die $!;
    close($lock) or die $!;
    ok(invoke('access_log', {}), 'scan with an existing lock file');
    is((stat($PVE::API2::AccessLog::SCAN_LOCK))[2] & 07777, 0600,
        'only root can open the lock');

    open(my $held, '>>', $PVE::API2::AccessLog::SCAN_LOCK) or die $!;
    flock($held, LOCK_EX) or die $!;
    for my $name (qw(access_log)) {
        eval { invoke($name, {}); };
        isa_ok($@, 'PVE::Exception');
        is($@->{code}, 503, "$name refused while another scan runs");
    }
    close($held);

    $binding_error = { code => 500, message => 'read failed' };
    eval { invoke('access_log', {}); };
    is($@->{code}, 500, 'failing scan');
    $binding_error = undef;
    ok(invoke('access_log', {}), 'a failed scan released its slot');
};

done_testing();
