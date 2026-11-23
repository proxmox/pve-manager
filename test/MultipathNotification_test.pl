#!/usr/bin/perl

use v5.36;

use File::Temp qw(tempdir);
use Test::More;

use PVE::MultipathNotification;

my $dir = tempdir(CLEANUP => 1);
my $file = "$dir/notified.json";
my $tracker = PVE::MultipathNotification->new($file);
my $accept = 1;

my sub event($row) {
    my $state = $row->{gone} ? 'gone' : $row->{state};
    my $marker = $row->{cleared} ? ', cleared' : '';
    return "$row->{wwid}:$state$marker";
}

my sub recorder($events) {
    return sub($severity, $rows) {
        push @$events, [$severity, map { event($_) } @$rows];
        return ref($accept) ? $accept->($severity) : $accept;
    };
}

sub report_with($report, $expected, $description) {
    my @events;
    $tracker->update($report, recorder(\@events));
    is_deeply(\@events, $expected, $description);
}

sub flush_with($expected, $description) {
    my @events;
    $tracker->flush(recorder(\@events));
    is_deeply(\@events, $expected, $description);
}

sub pass_with($states, $expected, $description, $complete = 1) {
    my $luns = [
        map {
            ref($states->{$_})
                ? { wwid => $_, $states->{$_}->%* }
                : { wwid => $_, state => $states->{$_} }
        } keys %{ $states // {} }
    ];
    my $report = defined($states) ? { luns => $luns } : undef;
    $report->{'vgs-unknown'} = 1 if $report && !$complete;
    report_with($report, $expected, $description);
}

my $degraded = { a => 'degraded' };
my $optimal = { a => 'optimal' };
pass_with($degraded, [], 'degraded at boot');
pass_with($optimal, [], 'one bad pass does not trigger recovery');
pass_with($degraded, [], 'first bad pass after blip');
pass_with(undef, [], 'unavailable report');
pass_with($degraded, [], 'unavailable pass interrupted confirmation');
report_with({ error => 'multipathd is not running' }, [], 'a report with an error');
pass_with($degraded, [], 'interrupts confirmation as well');
my $all_maps = { 'scope-unknown' => 1, luns => [{ wwid => 'a', state => 'degraded' }] };
report_with($all_maps, [], 'as does a report of all maps of the node');
pass_with($degraded, [], 'whose rows do not count');
pass_with($degraded, [['warning', 'a:degraded']], 'confirmed degradation');
pass_with($degraded, [], 'no repeated warning');

$tracker = PVE::MultipathNotification->new($file);
pass_with($degraded, [], 'same problem after restart');
pass_with($degraded, [], 'still no duplicate after confirmation');
my $mixed = { a => 'degraded', b => 'degraded', c => 'degraded' };
pass_with($mixed, [], 'two new LUNs lose paths');
$mixed->{a} = $mixed->{b} = 'failed';
pass_with($mixed, [], 'new problems wait while another LUN starts to fail');
pass_with(
    $mixed,
    [['error', 'a:failed', 'b:failed', 'c:degraded']],
    'and share one error with the escalation after its second check',
);
pass_with(undef, [], 'no recovery from an unavailable report');
pass_with({ %$mixed, a => 'degraded' }, [], 'partial improvement stays quiet');
pass_with($mixed, [], 'no repeated escalation before recovery');
pass_with({ %$mixed, a => 'optimal' }, [], 'one good pass');
pass_with($mixed, [], 'recovery blip');

my $changed = { a => 'optimal', b => 'optimal', c => 'degraded', d => 'degraded' };
pass_with($changed, [], 'first pass with new problem and recoveries');
pass_with(
    $changed,
    [['warning', 'd:degraded'], ['info', 'a:optimal', 'b:optimal']],
    'one event of each kind',
);
$tracker = PVE::MultipathNotification->new($file);
pass_with({}, [], 'notified LUNs left the report across a restart');
pass_with({}, [], 'but a report without the hints of LVM does not count', 0);
report_with(
    { luns => [], 'namespaces-unknown' => 1 },
    [['info', 'c:gone', 'd:gone']],
    'one without the NVMe namespaces does for maps, so two reports clear their alerts',
);
pass_with({}, [], 'no duplicate removal');

my $namespace = { n => { state => 'degraded', native => 1 } };
pass_with($namespace, [], 'a namespace degrades');
pass_with($namespace, [['warning', 'n:degraded']], 'which is notified');
report_with({ luns => [], 'namespaces-unknown' => 1 }, [], 'a report without it does not count');
report_with({ luns => [], 'namespaces-unknown' => 1 }, [], 'also not a second one');
pass_with({}, [], 'but one without the hints of LVM does', 0);
pass_with({}, [['info', 'n:gone']], 'and with another one its alert is cleared');

my sub without_multipathd($state) {
    return {
        error => 'multipathd is not running',
        luns => [{ wwid => 'm', state => $state, native => 1 }],
    };
}
report_with(without_multipathd('failed'), [], 'without multipathd, a namespace fails');
report_with(without_multipathd('failed'), [['error', 'm:failed']],
    'which is notified all the same');
report_with(without_multipathd('optimal'), [], 'it recovers');
report_with(without_multipathd('optimal'), [['info', 'm:optimal']], 'which is notified too');

pass_with($degraded, [], 'new incident');
$accept = 0;
pass_with($degraded, [['warning', 'a:degraded']], 'enqueue fails');
$accept = 1;
pass_with($degraded, [['warning', 'a:degraded']], 'retry still relevant warning');
pass_with($optimal, [], 'first healthy pass');
$tracker = PVE::MultipathNotification->new($file);
pass_with($optimal, [], 'pending confirmation does not survive restart');
pass_with($optimal, [['info', 'a:optimal']], 'confirmed recovery after restart');
pass_with($degraded, [], 'another blip');
pass_with({}, [], 'no removal for an unnotified LUN');

$tracker = PVE::MultipathNotification->new("$dir/next-boot.json");
my $half = { a => { state => 'degraded', 'paths-active' => 1, 'paths-total' => 2 } };
pass_with($half, [], 'fresh boot starts confirmation');
pass_with($half, [['warning', 'a:degraded']], 'problem present at boot is notified');
pass_with({ a => 'missing' }, [], 'a missing map does not clear the alert');
pass_with({ a => 'missing' }, [], 'nor in the next check');
my $lone = { a => { state => 'optimal', 'paths-active' => 1, 'paths-total' => 1 } };
pass_with($lone, [], 'a map shrunk to its last path');
pass_with($lone, [], 'is not restored redundancy');
my $expected = { a => { %{ $lone->{a} }, 'paths-expected' => 1 } };
pass_with($expected, [], 'a single expected path');
pass_with($expected, [['info', 'a:optimal, cleared']], 'is all the map should have now');

$tracker = PVE::MultipathNotification->new("$dir/single.json");
my $single = { a => { state => 'optimal', 'paths-active' => 1, 'paths-total' => 1 } };
my $none = { a => { state => 'failed', 'paths-active' => 0, 'paths-total' => 1 } };
pass_with($single, [], 'a LUN with a single path');
pass_with($none, [], 'loses it');
pass_with($none, [['error', 'a:failed']], 'and is notified');
pass_with($single, [], 'the path is back');
pass_with($single, [['info', 'a:optimal, cleared']], 'which clears the alert');
pass_with($none, [], 'the path fails again');
pass_with($none, [['error', 'a:failed']], 'which is notified again');

$tracker = PVE::MultipathNotification->new("$dir/shrink.json");
my $three = { a => { state => 'degraded', 'paths-active' => 2, 'paths-total' => 3 } };
pass_with($three, [], 'a LUN loses one of three paths');
pass_with($three, [['warning', 'a:degraded']], 'and is notified');
my $two = { a => { state => 'optimal', 'paths-active' => 2, 'paths-total' => 2 } };
pass_with($two, [], 'the kernel removed the failed path');
pass_with($two, [], 'which is no recovery without an expected count');
my $all = { a => { state => 'optimal', 'paths-active' => 3, 'paths-total' => 3 } };
pass_with($all, [], 'the path is back');
pass_with($all, [['info', 'a:optimal']], 'which is the recovery');

$tracker = PVE::MultipathNotification->new("$dir/expected.json");
my $three_of_two = { a => { %{ $three->{a} }, 'paths-expected' => 2 } };
pass_with($three_of_two, [], 'a LUN expected to have two paths loses one of three');
pass_with($three_of_two, [['warning', 'a:degraded']], 'and is notified');
my $two_of_two = { a => { %{ $two->{a} }, 'paths-expected' => 2 } };
pass_with($two_of_two, [], 'the kernel removed the failed path');
pass_with(
    $two_of_two,
    [['info', 'a:optimal, cleared']],
    'which meets the expected count but has fewer paths than notified',
);

$tracker = PVE::MultipathNotification->new("$dir/lowered.json");
my $short = { a => { %{ $two_of_two->{a} }, state => 'degraded', 'paths-expected' => 3 } };
pass_with($short, [], 'a map has two of three expected paths');
pass_with($short, [['warning', 'a:degraded']], 'and is notified');
pass_with($two_of_two, [], 'the expected count is lowered to two');
pass_with(
    $two_of_two,
    [['info', 'a:optimal, cleared']],
    'which clears the alert without a path coming back',
);

$tracker = PVE::MultipathNotification->new("$dir/escalate-expected.json");
pass_with($short, [], 'a map has two of three expected paths');
pass_with($short, [['warning', 'a:degraded']], 'and is notified');
my $none_of_two = { a => { %{ $two_of_two->{a} }, state => 'failed', 'paths-active' => 0 } };
pass_with($none_of_two, [], 'it loses all paths while two are expected');
pass_with($none_of_two, [['error', 'a:failed']], 'which escalates');
pass_with($two_of_two, [], 'both paths are back');
pass_with(
    $two_of_two,
    [['info', 'a:optimal, cleared']],
    'which are still fewer than the three of the first notification',
);

$tracker = PVE::MultipathNotification->new("$dir/escalate-rejected.json");
pass_with($degraded, [], 'a LUN loses a path');
pass_with($degraded, [['warning', 'a:degraded']], 'and is notified');
$accept = sub($severity) { return $severity ne 'error' };
pass_with({ a => 'failed' }, [], 'then all paths');
pass_with({ a => 'failed' }, [['error', 'a:failed']], 'the escalation cannot be queued');
pass_with($optimal, [['error', 'a:failed']], 'nor while the LUN recovers');
pass_with($optimal, [['error', 'a:failed']], 'and the recovery waits for it');
$accept = 1;
pass_with($optimal, [['error', 'a:failed']], 'until it is sent');
pass_with($optimal, [['info', 'a:optimal']], 'followed by the recovery');

$tracker = PVE::MultipathNotification->new("$dir/escalate-gone.json");
pass_with($degraded, [], 'a LUN loses a path');
pass_with($degraded, [['warning', 'a:degraded']], 'and is notified');
$accept = sub($severity) { return $severity ne 'error' };
pass_with({ a => 'failed' }, [], 'then all paths');
pass_with({ a => 'failed' }, [['error', 'a:failed']], 'the escalation cannot be queued');
pass_with({}, [['error', 'a:failed']], 'nor once the LUN is gone');
pass_with({}, [['error', 'a:failed']], 'whose removal waits for it');
$accept = 1;
pass_with({}, [['error', 'a:failed']], 'until it is sent');
pass_with({}, [['info', 'a:gone']], 'followed by the removal');

$tracker = PVE::MultipathNotification->new("$dir/escalate.json");
my $lost1 = { a => { state => 'degraded', 'paths-active' => 2, 'paths-total' => 3 } };
pass_with($lost1, [], 'one of three paths lost');
pass_with($lost1, [['warning', 'a:degraded']], 'notified');
my $lostall = { a => { state => 'failed', 'paths-active' => 0, 'paths-total' => 2 } };
pass_with($lostall, [], 'all paths lost, one of them removed by the kernel');
pass_with($lostall, [['error', 'a:failed']], 'escalated');
pass_with($two, [], 'two paths back');
pass_with($two, [], 'are fewer than the three of the first notification');
pass_with($all, [], 'all three back');
pass_with($all, [['info', 'a:optimal']], 'is the recovery');

$tracker = PVE::MultipathNotification->new("$dir/group.json");
pass_with({ a => 'optimal', b => 'optimal' }, [], 'two LUNs fine');
pass_with({ a => 'degraded', b => 'optimal' }, [], 'one loses a path');
pass_with({ a => 'degraded', b => 'degraded' }, [], 'the other one check later');
pass_with(
    { a => 'degraded', b => 'degraded' },
    [['warning', 'a:degraded', 'b:degraded']],
    'one notification for both',
);
pass_with({ a => 'optimal', b => 'degraded' }, [], 'one recovers');
pass_with({ a => 'optimal', b => 'optimal' }, [], 'the other one check later');
pass_with(
    { a => 'optimal', b => 'optimal' },
    [['info', 'a:optimal', 'b:optimal']],
    'one recovery for both',
);
my $rolling = { a => 'degraded', b => 'optimal', c => 'optimal' };
pass_with($rolling, [], 'a rolling fault starts');
pass_with({ %$rolling, b => 'degraded' }, [], 'reaches the next LUN');
pass_with(
    { %$rolling, b => 'degraded', c => 'degraded' },
    [['warning', 'a:degraded', 'b:degraded']],
    'and waits only once for the LUNs that change',
);

$tracker = PVE::MultipathNotification->new("$dir/held.json");
pass_with({ a => 'failed', b => 'optimal' }, [], 'a LUN loses all paths');
pass_with({ a => 'failed', b => 'degraded' }, [], 'which waits while another one starts to');
pass_with(
    { a => 'optimal', b => 'optimal' },
    [['error', 'a:failed']],
    'and is notified also if it recovered in the meantime',
);
pass_with({ a => 'optimal', b => 'optimal' }, [['info', 'a:optimal']], 'followed by its recovery');

$tracker = PVE::MultipathNotification->new("$dir/held-failed.json");
pass_with({ a => 'failed', b => 'optimal' }, [], 'a LUN loses all paths');
pass_with({ a => 'failed', b => 'degraded' }, [], 'which waits while another one starts to');
pass_with(
    { a => 'degraded', b => 'optimal' },
    [['error', 'a:failed']],
    'and is notified as failed also if it got a path back meanwhile',
);

$tracker = PVE::MultipathNotification->new("$dir/held-unusable.json");
pass_with({ a => 'failed', b => 'optimal' }, [], 'a LUN loses all paths');
pass_with({ a => 'failed', b => 'degraded' }, [], 'which waits while another one starts to');
pass_with(undef, [['error', 'a:failed']], 'and does not wait for a usable report');

$tracker = PVE::MultipathNotification->new("$dir/held-shrunk.json");
my $half_of_four = { a => { state => 'degraded', 'paths-active' => 2, 'paths-total' => 4 } };
pass_with({ %$half_of_four, b => 'optimal' }, [], 'a LUN loses two of four paths');
pass_with({ %$half_of_four, b => 'degraded' }, [], 'which waits while another one starts to');
my $rest_failed = { a => { state => 'failed', 'paths-active' => 0, 'paths-total' => 2 } };
pass_with(
    { %$rest_failed, b => 'degraded' },
    [['error', 'a:failed', 'b:degraded']],
    'the kernel removed the failed paths when the rest fail',
);
pass_with({ %$two, b => 'degraded' }, [], 'two paths are back');
pass_with({ %$two, b => 'degraded' }, [], 'which are fewer than the LUN had');
pass_with({ %$two, b => 'optimal' }, [], 'the other LUN recovers');
my $all_of_four = { a => { state => 'optimal', 'paths-active' => 4, 'paths-total' => 4 } };
pass_with({ %$all_of_four, b => 'optimal' }, [], 'which waits as all paths of the first come back');
pass_with(
    { %$all_of_four, b => 'optimal' },
    [['info', 'a:optimal', 'b:optimal']],
    'one recovery for both',
);

$tracker = PVE::MultipathNotification->new("$dir/held-stop.json");
pass_with({ a => 'failed', b => 'optimal' }, [], 'a LUN loses all paths');
pass_with({ a => 'failed', b => 'degraded' }, [], 'which waits while another one starts to');
flush_with([['error', 'a:failed']], 'and is notified when the daemon stops');
flush_with([], 'only once');
$tracker = PVE::MultipathNotification->new("$dir/held-stop.json");
pass_with({ a => 'optimal', b => 'optimal' }, [], 'the restarted daemon');
pass_with({ a => 'optimal', b => 'optimal' }, [['info', 'a:optimal']], 'notifies its recovery');

$tracker = PVE::MultipathNotification->new("$dir/held-rejected.json");
pass_with({ a => 'failed', b => 'optimal' }, [], 'a LUN loses all paths');
pass_with({ a => 'failed', b => 'degraded' }, [], 'which waits while another one starts to');
$accept = 0;
pass_with({ a => 'optimal', b => 'optimal' }, [['error', 'a:failed']], 'the notification fails');
$accept = 1;
pass_with(
    { a => 'optimal', b => 'optimal' },
    [['error', 'a:failed']],
    'and is retried although the LUN recovered',
);
pass_with({ a => 'optimal', b => 'optimal' }, [['info', 'a:optimal']], 'followed by its recovery');

open(my $fh, '>', "$dir/broken.json") or die $!;
print {$fh} '{"truncated';
close($fh);
{
    my $warning;
    local $SIG{__WARN__} = sub { $warning = $_[0] };
    $tracker = PVE::MultipathNotification->new("$dir/broken.json");
    like($warning, qr/ignoring unreadable/, 'an unreadable state file is reported');
}
pass_with($degraded, [], 'and monitoring starts over');
pass_with($degraded, [['warning', 'a:degraded']], 'with alerts as on a fresh boot');

done_testing();
