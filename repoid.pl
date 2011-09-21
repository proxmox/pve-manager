#!/usr/bin/perl -w

# use use the first 8 characters from the master commit ID

# git status --porcelain

use strict;
use lib qw(.);
use PVE::Tools qw(run_command);

my $gitdir = shift;
die "no repository" if !$gitdir;

my $path = "$gitdir/refs/heads/master";
die "master branch does not exists" if ! -f $path;

my $arg1 = shift;

if ($arg1) {
    die "unknown parameter '$arg1'" if $arg1 ne 'check';

    my $testfunc = sub {
	my $line = shift;
	return if $line =~ m/^#/;
	return if $line =~ m/^\?\?/;

	die "detected modified content: $line\n";
    };

    my $cmd = ['git', '--git-dir', $gitdir ,'status', '--porcelain'];
    run_command($cmd, outfunc => $testfunc);
}

my $repoid = `cat $path`;
chomp $repoid;

die "invalid commit format" if $repoid !~ m/^[0-9a-f]{40}$/;

my $res = substr $repoid, 0, 8;
print "$res\n";
