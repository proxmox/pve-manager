package PVE::MultipathNotification;

use v5.36;

use JSON qw(decode_json encode_json);
use List::Util qw(max);

use PVE::File qw(file_get_contents file_set_contents);

# the fields of a LUN that a notification shows, kept across a restart of the daemon
my @KEEP = qw(wwid name native state paths-active paths-expected paths-total storages vgname);

sub new($class, $file) {
    my $notified = -e $file ? eval { decode_json(file_get_contents($file)) } : {};
    if (ref($notified) ne 'HASH') {
        warn "ignoring unreadable multipath notification state '$file' - $@";
        $notified = {};
    }
    return bless { file => $file, notified => $notified, previous => {}, absent => {} }, $class;
}

my sub problem($lun) {
    return $lun->{state} eq 'degraded' || $lun->{state} eq 'failed';
}

# the paths that a LUN had or should have had when its problem was notified
my sub notified_paths($last) {
    return max($last->{'paths-total'} // 0, $last->{'paths-expected'} // 0);
}

# Without an expected count, a single path does not tell whether the LUN should have more.
my sub single_path($lun) {
    return !defined($lun->{'paths-expected'}) && ($lun->{'paths-total'} // 0) == 1;
}

# Without an expected count, the kernel removing failed paths can leave a map optimal with fewer
# paths than it had when the problem was notified.
my sub shrunk($lun, $last) {
    return 0 if defined($lun->{'paths-expected'});
    return ($lun->{'paths-total'} // 0) < ($last->{'paths-total'} // 0);
}

# A map that the kernel shrank to its last path after a failure is optimal for multipath, but its
# redundancy is not restored, unless the LUN had no other path when it was notified.
my sub healthy($lun, $last) {
    return 0 if $lun->{state} ne 'optimal' || shrunk($lun, $last);
    return !single_path($lun) || notified_paths($last) <= 1;
}

# A problem keeps the most paths that its LUN had, as the kernel can remove some before it recovers.
my sub keep_paths($row, $earlier) {
    for my $key (qw(paths-total paths-expected)) {
        $row->{$key} = $earlier->{$key}
            if defined($earlier->{$key}) && $earlier->{$key} > ($row->{$key} // 0);
    }
}

# One row per LUN, the first one unless a later one shows a failure, which a partial recovery after
# it was confirmed must not hide.
my sub merge_problems(@rows) {
    my %by_wwid;
    for my $row (@rows) {
        my $known = $by_wwid{ $row->{wwid} };
        if (!$known || ($row->{state} eq 'failed' && $known->{state} ne 'failed')) {
            $by_wwid{ $row->{wwid} } = {%$row};
            keep_paths($by_wwid{ $row->{wwid} }, $known) if $known;
        } else {
            keep_paths($known, $row);
        }
    }
    return map { $by_wwid{$_} } sort keys %by_wwid;
}

my sub notify_problems($self, $problem, $notify) {
    my $severity = (grep { $_->{state} eq 'failed' } @$problem) ? 'error' : 'warning';
    if (!$notify->($severity, $problem)) {
        # the LUNs may no longer show the problem in the next check, so keep them for it
        $self->{held}->{problem} = $problem;
        return;
    }
    my $notified = $self->{notified};
    for my $lun (@$problem) {
        my $row = { map { exists($lun->{$_}) ? ($_ => $lun->{$_}) : () } @KEEP };
        # an escalation keeps the paths of the first notification
        keep_paths($row, $notified->{ $lun->{wwid} } // {});
        $notified->{ $lun->{wwid} } = $row;
    }
    $self->{dirty} = 1;
}

# If saving fails after enqueue, retry the write, not the notification, on the next pass.
my sub save($self) {
    return if !$self->{dirty};
    file_set_contents($self->{file}, encode_json($self->{notified}), 0600);
    $self->{dirty} = 0;
}

# Sends the problems that wait for the next check, which a daemon that stops would lose.
sub flush($self, $notify) {
    my $held = delete $self->{held}->{problem};
    notify_problems($self, $held, $notify) if $held;
    save($self);
}

# Takes a multipath report of this node. A change counts once two reports in a row show it.
sub update($self, $report, $notify) {
    my $valid = ref($report) eq 'HASH';
    # Maps need multipathd, the namespaces of native NVMe multipath do not. Each row counts by its
    # own source, so a node without multipathd still notifies on its namespaces.
    my $maps = $valid && !$report->{error} && !$report->{'scope-unknown'};
    my $namespaces = $valid && !$report->{'namespaces-unknown'};
    my $previous = $self->{previous};
    my $current = $self->{previous} = {};
    if (!$maps && !$namespaces) {
        # problems confirmed before do not wait for a report that can confirm others
        flush($self, $notify);
        return;
    }
    my $luns = [grep { $_->{native} ? $namespaces : $maps } ($report->{luns} // [])->@*];

    my $notified = $self->{notified};
    # a problem that is still to be notified comes before the recovery of its LUN
    my %unsent = map { $_->{wwid} => 1 } ($self->{held}->{problem} // [])->@*;
    my (@problem, @recovery, %pending);
    for my $lun (sort { $a->{wwid} cmp $b->{wwid} } @$luns) {
        my $wwid = $lun->{wwid};
        $current->{$wwid} = $lun;
        delete $self->{absent}->{$wwid};
        my $before = $previous->{$wwid};
        my $last = $notified->{$wwid};
        if (problem($lun)) {
            my $escalating = $last && $last->{state} eq 'degraded' && $lun->{state} eq 'failed';
            if (
                $before
                && problem($before)
                && (!$last || ($escalating && $before->{state} eq 'failed'))
            ) {
                push @problem, $lun;
            } elsif (!$last || $escalating) {
                $pending{problem} = 1; # changed in this check, the next one can confirm it
            }
        } elsif ($last && healthy($lun, $last) && !$unsent{$wwid}) {
            if ($before && healthy($before, $last)) {
                # The kernel removes failed paths and the expected count can be lowered, so the
                # alert can be over without the paths being known to be back.
                my $cleared = ($lun->{'paths-active'} // 0) < notified_paths($last)
                    || single_path($lun);
                push @recovery, $cleared ? { %$lun, cleared => 1 } : $lun;
            } else {
                $pending{recovery} = 1;
            }
        }
    }
    # A LUN can be left out of a report that is not complete, which does not mean it is gone:
    # without the hints of LVM, maps known only by their volume group, and after a failed query the
    # NVMe namespaces. Each counts by its own source.
    for my $wwid (sort keys %$notified) {
        next if exists($current->{$wwid});
        next if $notified->{$wwid}->{native} ? !$namespaces : !$maps || $report->{'vgs-unknown'};
        if (++$self->{absent}->{$wwid} < 2) {
            $pending{recovery} = 1;
            next;
        }
        next if $unsent{$wwid};
        my $lun = { $notified->{$wwid}->%*, gone => 1 };
        delete $lun->@{qw(state paths-active paths-expected paths-total)};
        push @recovery, $lun;
    }

    # A fault often reaches several LUNs a few seconds apart. A notification waits one more check
    # while other LUNs of the node change the same way, so that it lists them too.
    if (@problem && $pending{problem} && !$self->{held}->{problem}) {
        $self->{held}->{problem} = [@problem];
        @problem = ();
    } elsif (my $held = delete $self->{held}->{problem}) {
        @problem = merge_problems(@problem, @$held);
    }
    if (@recovery && $pending{recovery} && !$self->{held}->{recovery}) {
        $self->{held}->{recovery} = 1;
        @recovery = ();
    } else {
        $self->{held}->{recovery} = 0;
    }

    notify_problems($self, \@problem, $notify) if @problem;
    if (@recovery && $notify->('info', \@recovery)) {
        for my $lun (@recovery) {
            delete $notified->{ $lun->{wwid} };
            delete $self->{absent}->{ $lun->{wwid} };
        }
        $self->{dirty} = 1;
    }

    save($self);
}

1;
