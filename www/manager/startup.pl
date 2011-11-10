#!/usr/bin/perl -w

use strict;

use PVE::SafeSyslog;

use ModPerl::Util (); #for CORE::GLOBAL::exit

use Apache2::RequestRec ();
use Apache2::RequestIO ();
use Apache2::RequestUtil ();
use Apache2::Access;
use Apache2::Response;
use Apache2::Util;
  
use Apache2::ServerUtil ();
use Apache2::Connection ();
use Apache2::Log ();
  
use APR::Table ();
  
use ModPerl::Registry ();
  
use Apache2::Const -compile => ':common';
use APR::Const -compile => ':common';

initlog ('proxwww', 'daemon');

use PVE::pvecfg;
use PVE::REST;
use PVE::Cluster;
use PVE::INotify;
use PVE::RPCEnvironment;

sub childinit {
    syslog ('info', "Starting new child $$");

    eval {
	PVE::INotify::inotify_init();
	PVE::RPCEnvironment->init('pub');
    };
    my $err = $@;
    syslog('err', $err) if $err;
}

sub childexit {
    # BUG: seems this is not called if we do $r->child_terminate()
    syslog ('info', "Finish child $$");
}

my $s = Apache2::ServerUtil->server;
$s->push_handlers(PerlChildInitHandler => \&childinit);
$s->push_handlers(PerlChildExitHandler => \&childexit);

1;

