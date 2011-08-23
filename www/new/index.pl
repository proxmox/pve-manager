#!/usr/bin/perl -w

use strict;
use mod_perl2 '1.9922';
use Encode;
use CGI;
use PVE::pvecfg;
use PVE::JSONSchema;
use PVE::AccessControl;
use PVE::REST;

sub send_output {
    my ($r, $data) = @_;

    my $encdata = encode('UTF-8', $data);
    $r->no_cache (1);
    my $x = length ($encdata);
    $r->content_type ("text/html;charset=UTF-8");
    $r->headers_out->set ("Content-length", "$x");
    $r->headers_out->set ("Pragma", "no-cache");

    $r->print ($encdata);
}

# NOTE: Requests to this page are not authenticated
# so we must be very careful here 

my $r = Apache2::RequestUtil->request();
my $username;
my $token = 'null';
if (my $cookie = $r->headers_in->{Cookie}) {
    my $ticket = PVE::REST::extract_auth_cookie($cookie);
    if (($username = PVE::AccessControl::verify_ticket($ticket, 1))) {
	$token = PVE::AccessControl::assemble_csrf_prevention_token($username);
    }
}
my $version = PVE::pvecfg::version() . "/" . PVE::pvecfg::repoid();
$username = '' if !$username;

my $cgi = CGI->new($r);
my %args =  $cgi->Vars();

my $workspace = defined($args{console}) ?
    "PVE.ConsoleWorkspace" : "PVE.StdWorkspace";

my $jssrc = <<_EOJS;
if (!PVE) PVE = {};
PVE.GUIVersion = '$version';
PVE.UserName = '$username';
PVE.CSRFPreventionToken = '$token';

Ext.require(['*', '$workspace']);

// we need this (the java applet ignores the zindex)
Ext.useShims = true;

Ext.History.fieldid = 'x-history-field';

Ext.onReady(function() { Ext.create('$workspace');});

_EOJS

$jssrc .= "";

my $page = <<_EOD;
<html>
  <head>
    <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />

    <title>Proxmox Virtual Environment</title>
 
    <link rel="stylesheet" type="text/css" href="/pve2/ext4/resources/css/ext-all.css" />
    <link rel="stylesheet" type="text/css" href="/pve2/css/ext-pve.css" />
 
    <script type="text/javascript" src="/pve2/ext4/ext-all-debug.js"></script>
    <script type="text/javascript" src="/pve2/ext4/pvemanagerlib.js"></script>
    
    <script type="text/javascript">$jssrc</script>
    
  </head>
  <body>
    <!-- Fields required for history management -->
    <form id="history-form" class="x-hidden">
    <input type="hidden" id="x-history-field"/>
    </form>
  </body>
</html>
_EOD

send_output ($r, $page);
exit (0);
