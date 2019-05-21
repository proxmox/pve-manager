#!/usr/bin/perl

use strict;
use warnings;
use PVE::VZDump;
use Test::More tests => 5;
use Test::MockModule;

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
    print TEST_FILE "a" x (1024*1024/2);
    close(TEST_FILE);
}
{
    my $result_text;
    my $result_html;
    my $mock_module = Test::MockModule->new('PVE::Tools');
    $mock_module->mock('sendmail', sub {
	my (undef, undef, $text, $html, undef, undef) = @_;
	$result_text = $text;
	$result_html = $html;
    });
    my $MAILTO = ['test_address@proxmox.com'];
    my $OPTS->{mailto} = $MAILTO;
    my $SELF->{opts} = $OPTS;
    $SELF->{cmdline} = 'test_command_on_cli';
    my $task;
    $task->{state} = 'ok';
    $task->{vmid} = '1';
    {
	$result_text = undef;
	$result_html = undef;
	$task->{tmplog} = $TEST_FILE_WRONG_PATH;
	my $tasklist = [$task];
	PVE::VZDump::sendmail($SELF, $tasklist, 0, undef, undef, undef);
	like($result_text, $NO_LOGFILE, "Missing logfile is detected");
    }
    {
	$result_text = undef;
	$result_html = undef;
	$task->{tmplog} = $TEST_FILE_PATH;
	my $tasklist = [$task];
	prepare_mail_with_status();
	PVE::VZDump::sendmail($SELF, $tasklist, 0, undef, undef, undef);
	unlike($result_text, $STATUS, "Status are not in text part of mails");
	unlike($result_html, $STATUS, "Status are not in HTML part of mails");
	unlink $TEST_FILE_PATH;
    }
    {
	$result_text = undef;
	$result_html = undef;
	$task->{tmplog} = $TEST_FILE_PATH;
	my $tasklist = [$task];
	prepare_long_mail();
	PVE::VZDump::sendmail($SELF, $tasklist, 0, undef, undef, undef);
	like($result_text, $LOG_TOO_LONG, "Text part of mails gets shortened");
	like($result_html, $LOG_TOO_LONG, "HTML part of mails gets shortened");
	unlink $TEST_FILE_PATH;
    }
}