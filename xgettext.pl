#!/usr/bin/perl

use strict;
use Locale::Maketext::Extract;
use Cwd;
use Getopt::Long;
use Time::Local;

sub help {
    die "unknown option";
}

my %opts;
Getopt::Long::Configure("no_ignore_case");
Getopt::Long::GetOptions( \%opts,
			  'f|files-from:s@',
			  'D|directory:s',
			  'd|default-domain:s',
			  'c|add-comments:s',
			  'v|version',
			  'msgid-bugs-address:s',
			  'copyright-holder:s',
			  'h|help',
			  ) or help();
help() if $opts{h};

if ($opts{v}) {
    print "xgettext pve\n";
    exit 0;
}

my $sources = [];

my $cwd = getcwd();

my $dir = $opts{D} || $cwd;

foreach my $file (@{$opts{f}||[]}) {
    open FILE, $file or die "Cannot open $file: $!";
    while (<FILE>) {
	chomp;
	s/\s+$//;
	s/^\s+//;
	next if !$_;
	next if m/^#/;
	push @$sources, $_;
    }
}

my $filename = "messages.pot";

$filename = "$opts{d}.pot" if $opts{d};

my $Ext = Locale::Maketext::Extract->new();

my $ctime = scalar localtime;

my $header = << '.';
# SOME DESCRIPTIVE TITLE.
# Copyright (C) 2011 Proxmox Server Solutions GmbH
# This file is distributed under the same license as the pve-manager package.
# Proxmox Support Team <support@proxmox.com>, 2011.
#
msgid ""
msgstr ""
"Project-Id-Version: pve-manager 2\n"
.

$header .= "\"Report-Msgid-Bugs-To: $opts{'msgid-bugs-address'}\\n\"\n" if  $opts{'msgid-bugs-address'};
$header .= "\"POT-Creation-Date: $ctime\\n\"\n";

$header .= << '.';
"Last-Translator: FULL NAME <EMAIL@ADDRESS>\n"
"Language-Team: LANGUAGE <support@proxmox.com>\n"
"MIME-Version: 1.0\n"
"Content-Type: text/plain; charset=CHARSET\n"
"Content-Transfer-Encoding: 8bit\n"
.

$Ext->set_header ($header);

#$Ext->read_po($po, $opts{u}) if -r $po;

chdir $dir;

foreach my $s (@$sources) {
    $Ext->extract_file($s);

}

#$Ext->compile($opts{u});
$Ext->compile() or die "compile error";

#$Ext->write_po($filename, $opts{g});

chdir $cwd;

$Ext->write_po($filename);

