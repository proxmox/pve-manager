package PVE::ExtJSIndex;

use strict;
use warnings;

sub get_index {
    my ($lang, $username, $csrftoken, $console, $nodename, $debug) = @_;

    my $page = <<_EOD;
<!DOCTYPE html>
<html>
  <head>
    <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
    <title>$nodename - Proxmox Virtual Environment</title>
    <link rel="icon" sizes="128x128" href="/pve2/images/logo-128.png" />
    <link rel="apple-touch-icon" sizes="128x128" href="/pve2/images/logo-128.png" />
    <link rel="stylesheet" type="text/css" href="/pve2/ext6/theme-crisp/resources/theme-crisp-all.css" />
    <link rel="stylesheet" type="text/css" href="/pve2/ext6/crisp/resources/charts-all.css" />
    <link rel="stylesheet" type="text/css" href="/pve2/css/font-awesome.css" />
    <link rel="stylesheet" type="text/css" href="/pve2/css/ext6-pve.css" />
_EOD

    my $langfile = "/usr/share/pve-manager/locale/pve-lang-${lang}.js";
    if (-f $langfile) {
	$page .= "    <script type='text/javascript' src='/pve2/locale/pve-lang-${lang}.js'></script>\n";
    } else {
	$page .= "    <script type='text/javascript'>function gettext(buf) { return buf; }</script>\n";
    }

    if ($debug) {
	$page .= <<_EOD;
    <script type="text/javascript" src="/pve2/ext6/ext-all-debug.js"></script>
    <script type="text/javascript" src="/pve2/ext6/charts-debug.js"></script>
_EOD
    } else {
	$page .= <<_EOD;
    <script type="text/javascript" src="/pve2/ext6/ext-all.js"></script>
    <script type="text/javascript" src="/pve2/ext6/charts.js"></script>
_EOD
    }

$page .= <<_EOD;
    <script type="text/javascript" src="/pve2/js/pvemanagerlib.js"></script>
    <script type="text/javascript" src="/pve2/ext6/locale/locale-${lang}.js"></script>
_EOD

    my $jssrc = <<_EOJS;
if (typeof(PVE) === 'undefined') PVE = {};
PVE.UserName = '$username'
PVE.CSRFPreventionToken = '$csrftoken';
Ext.History.fieldid = 'x-history-field';
Ext.onReady(function() { Ext.create('PVE.StdWorkspace');});
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
