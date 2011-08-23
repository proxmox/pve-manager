package PVE::URLRewrite;

use strict;
use Apache2::Const qw(DECLINED);
use PVE::HTMLUtils;

sub handler {
    my $r = shift;
  
    my $uri = $r->uri;

    if ($uri =~ m!^/(qemu|openvz)/(\d+)-(\d+)/(.*)$!) { 
	my $vmtype = $1;
	my $newuri = "/$1/$4";
	my $cid = $2;
	my $veid = $3;

	$r->uri ("$newuri");

	$r->pnotes ("PVE_VMINFO", { cid => $cid, veid => $veid,
				    vmtype => $vmtype, uri => $uri});
    }    

    return DECLINED;
}

1;
