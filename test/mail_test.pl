#!/usr/bin/perl

use strict;
use warnings;

use lib '..';

use Test::More tests => 5;
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
    print TEST_FILE "a" x (1024*1024/2);
    close(TEST_FILE);
}

my ($result_text, $result_html);

my $mock_tools_module = Test::MockModule->new('PVE::Tools');
$mock_tools_module->mock('sendmail', sub {
    my (undef, undef, $text, $html, undef, undef) = @_;
    $result_text = $text;
    $result_html = $html;
});

my $mock_cluster_module = Test::MockModule->new('PVE::Cluster');
$mock_cluster_module->mock('cfs_read_file', sub {
    my $path = shift;

    if ($path eq 'datacenter.cfg') {
	return {};
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
    $result_text = $result_html = undef;
    $task->{tmplog} = shift;
    $tasklist = [ $task ];
}

{
    prepare_test($TEST_FILE_WRONG_PATH);
    PVE::VZDump::sendmail($SELF, $tasklist, 0, undef, undef, undef);
    like($result_text, $NO_LOGFILE, "Missing logfile is detected");
}
{
    prepare_test($TEST_FILE_PATH);
    prepare_mail_with_status();
    PVE::VZDump::sendmail($SELF, $tasklist, 0, undef, undef, undef);
    unlike($result_text, $STATUS, "Status are not in text part of mails");
    unlike($result_html, $STATUS, "Status are not in HTML part of mails");
}
{
    prepare_test($TEST_FILE_PATH);
    prepare_long_mail();
    PVE::VZDump::sendmail($SELF, $tasklist, 0, undef, undef, undef);
    like($result_text, $LOG_TOO_LONG, "Text part of mails gets shortened");
    like($result_html, $LOG_TOO_LONG, "HTML part of mails gets shortened");
}
unlink $TEST_FILE_PATH;
