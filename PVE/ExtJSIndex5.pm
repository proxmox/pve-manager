package PVE::ExtJSIndex5;

use strict;
use warnings;

sub get_index {
    my ($lang, $username, $csrftoken, $console) = @_;

    my $page = <<_EOD;
<!DOCTYPE html>
<html>
  <head>
    <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
    <title>Proxmox Virtual Environment</title>
 
    <link rel="stylesheet" type="text/css" href="/pve2/ext5/packages/ext-theme-classic/build/resources/ext-theme-classic-all.css" />
    <link rel="stylesheet" type="text/css" href="/pve2/css/ext-pve.css" />
_EOD

    my $langfile = "/usr/share/pve-manager/locale/pve-lang-${lang}.js";
    if (-f $langfile) {
	$page .= "<script type='text/javascript' src='/pve2/locale/pve-lang-${lang}.js'></script>";
    } else {
	$page .= '<script type="text/javascript">function gettext(buf) { return buf; }</script>';
    }

    $page .= <<_EOD;
    <script type="text/javascript" src="/pve2/ext5/ext-all-debug.js"></script>
    <script type="text/javascript" src="/pve2/manager5/Utils.js"></script>
    <script type="text/javascript" src="/pve2/ext5/packages/ext-locale/build/ext-locale-${lang}.js"></script>
_EOD

    my $jssrc = <<_EOJS;
if (typeof(PVE) === 'undefined') PVE = {};
PVE.UserName = '$username'
PVE.CSRFPreventionToken = '$csrftoken';
_EOJS

    my $workspace = defined($console) ?
	"PVE.ConsoleWorkspace" : "PVE.StdWorkspace";

   $jssrc .= <<_EOJS;
// we need this (the java applet ignores the zindex)
Ext.useShims = true;
Ext.History.fieldid = 'x-history-field';
Ext.onReady(function() { 
	console.log(Ext.getVersion().version);
	Ext.create('$workspace');
});
_EOJS

    $page .= <<_EOD;
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
   
    return $page;

}

1;
