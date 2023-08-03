#!/usr/bin/perl

use strict;
use warnings;

use lib '..';

use Test::More tests => 3;
use Test::MockModule;

use PVE::VZDump;

my $STATUS = qr/.*status.*/;
my $NO_LOGFILE = qr/.*Could not open log file.*/;
my $LOG_TOO_LONG = qr/.*Log output was too long.*/;
my $TEST_FILE_PATH       = '/tmp/mail_test';
my $TEST_FILE_WRONG_PATH = '/tmp/mail_test_wrong';

sub prepare_mail_with_status {
    open(TEST_FILE, '>', $TEST_FILE_PATH); # Removes previous content
    print TEST_FILE "start of log file\n";
    print TEST_FILE "status: 0\% this should not be in the mail\n";
    print TEST_FILE "status: 55\% this should not be in the mail\n";
    print TEST_FILE "status: 100\% this should not be in the mail\n";
    print TEST_FILE "end of log file\n";
    close(TEST_FILE);
}

sub prepare_long_mail {
    open(TEST_FILE, '>', $TEST_FILE_PATH); # Removes previous content
    # 0.5 MB * 2 parts + the overview tables gives more than 1 MB mail
    print TEST_FILE "a" x (1024*1024);
    close(TEST_FILE);
}

my $result_text;
my $result_properties;

my $mock_notification_module = Test::MockModule->new('PVE::Notify');
$mock_notification_module->mock('send_notification', sub {
    my ($channel, $severity, $title, $text, $properties) = @_;

    $result_text = $text;
    $result_properties = $properties;
});

my $mock_cluster_module = Test::MockModule->new('PVE::Cluster');
$mock_cluster_module->mock('cfs_read_file', sub {
    my $path = shift;

    if ($path eq 'datacenter.cfg') {
        return {};
    } elsif ($path eq 'notifications.cfg' || $path eq 'priv/notifications.cfg') {
        return '';
    } else {
	die "unexpected cfs_read_file\n";
    }
});

my $MAILTO = ['test_address@proxmox.com'];
my $SELF = {
    opts => { mailto => $MAILTO },
    cmdline => 'test_command_on_cli',
};

my $task = { state => 'ok', vmid => '100', };
my $tasklist;
sub prepare_test {
    $result_text = undef;
    $task->{tmplog} = shift;
    $tasklist = [ $task ];
}

{
    prepare_test($TEST_FILE_WRONG_PATH);
    PVE::VZDump::send_notification($SELF, $tasklist, 0, undef, undef, undef);
    like($result_properties->{logs}, $NO_LOGFILE, "Missing logfile is detected");
}
{
    prepare_test($TEST_FILE_PATH);
    prepare_mail_with_status();
    PVE::VZDump::send_notification($SELF, $tasklist, 0, undef, undef, undef);
    unlike($result_properties->{"status-text"}, $STATUS, "Status are not in text part of mails");
}
{
    prepare_test($TEST_FILE_PATH);
    prepare_long_mail();
    PVE::VZDump::send_notification($SELF, $tasklist, 0, undef, undef, undef);
    like($result_properties->{logs}, $LOG_TOO_LONG, "Text part of mails gets shortened");
}
unlink $TEST_FILE_PATH;
