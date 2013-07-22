#!/usr/bin/perl -w

use strict;

use PVE::APLInfo;


my $pkglist = PVE::APLInfo::load_data();

my $err = 0;

foreach my $k (keys %{$pkglist->{'all'}}) {
    next if $k eq 'pve-web-news';
    my $res = $pkglist->{'all'}->{$k};

    my $template = "$res->{os}-$res->{package}_$res->{version}_ARCH.tar.gz";
    $template =~ s/$res->{os}-$res->{os}-/$res->{os}-/;
    
    $k =~ s/_amd64\.tar\.gz$/_ARCH.tar.gz/;
    $k =~ s/_i386\.tar\.gz$/_ARCH.tar.gz/;

    if ($k ne $template) {
	print "ERROR: $k != $template\n";
	$err = 1;
    }
}

$err ? exit (-11) : exit (0);

