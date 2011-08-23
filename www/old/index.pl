#!/usr/bin/perl -w

use strict;
use mod_perl2 '1.9922';
use Encode;
use CGI;
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

my $token = 'null';
if (my $cookie = $r->headers_in->{Cookie}) {
    my $ticket = PVE::REST::extract_auth_cookie($cookie);
    if (PVE::AccessControl::verify_ticket($ticket, 1)) {
	$token = PVE::AccessControl::assemble_csrf_prevention_token($ticket);
    }
}

my $cgi = CGI->new($r);
my %args =  $cgi->Vars();

my $console = $args{console};

my $title = "Proxmox Virtual Environment";
if (defined($console)) {
    if ($console eq 'kvm' && $args{vmid}) {
	my $name = "VM $args{vmid}"; # fixme: use real VM name
	$title = "$name - Proxmox Console";
    } elsif ($console eq 'shell' && $args{node}) {
	$title = "node $args{node} - Proxmox Console";
    }
}

my $jssrc = <<_EOJS;
PVECSRFPreventionToken = '$token';
Ext.onReady(PVE.Workspace.init, PVE.Workspace);
_EOJS


my $page = <<_EOD;
<html>
  <head>
    <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />

    <title id='title'>$title</title>
 
    <link rel="stylesheet" type="text/css" href="/ext/ext-all.css" />
    <link rel="stylesheet" type="text/css" href="/css/ext-pve.css" />
 
    <script type="text/javascript" src="/ext/ext-base-debug.js"></script>
    <script type="text/javascript" src="/ext/ext-all-debug.js"></script>
    <script type="text/javascript" src="/ext/pvemanagerlib.js"></script>
    
    <script type="text/javascript">
      Ext.BLANK_IMAGE_URL = '/images/default/s.gif';
    </script>
    
    <script type="text/javascript">$jssrc</script>
    
  </head>
  <body>
    <!-- Fields required for history management -->
    <form id="history-form" class="x-hidden">
    <input type="hidden" id="x-history-field"/>
    <iframe id="x-history-frame"></iframe>
    </form>
  </body>
</html>
_EOD

send_output ($r, $page);
exit (0);
