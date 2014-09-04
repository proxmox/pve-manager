#!/usr/bin/perl -T

use strict;
use warnings;
use PVE::Tools;
use PVE::SafeSyslog;
use PVE::AccessControl;
use PVE::Cluster qw (cfs_read_file);

# NOTE: we need to run this with setgid www-data
# else we cant read /etc/pve/user.cfg

$( = $); # $GID = $EGID

$ENV{'PATH'} = '/sbin:/bin:/usr/sbin:/usr/bin';

initlog('pvemailforward');


PVE::Cluster::cfs_update();

eval {
    my $usercfg = cfs_read_file("user.cfg");
    my $rootcfg = $usercfg->{users}->{'root@pam'} || {};
    my $mailto = $rootcfg->{email};

    my $dcconf = cfs_read_file('datacenter.cfg');
    my $mailfrom = $dcconf->{email_from} || "root";

    die "user 'root\@pam' does not have a email address\n" if !$mailto;

    syslog("info", "forward mail to <$mailto>");

    # we never send DSN (avoid mail loops)
    open(CMD, "|sendmail -bm -N never -f $mailfrom $mailto") ||
	die "can't exec sendmail - $!\n";
    while (<>) { print CMD $_; }
    close(CMD);
};
if (my $err = $@) {
    syslog('err', "mail forward failed: $err");
}

exit(0);
