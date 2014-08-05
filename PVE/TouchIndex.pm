package PVE::TouchIndex;

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
 
    <link rel="stylesheet" type="text/css" href="/pve2/touch/resources/css/sencha-touch.css" />
    <link rel="stylesheet" type="text/css" href="/pve2/touch/resources/css/pve.css" />
_EOD

    my $langfile = "/usr/share/pve-manager/locale/pve-lang-${lang}.js";
    if (-f $langfile) {
	$page .= "<script type='text/javascript' src='/pve2/locale/pve-lang-${lang}.js'></script>";
    } else {
	$page .= '<script type="text/javascript">function gettext(buf) { return buf; }</script>';
    }

    $page .= <<_EOD;
    <script type="text/javascript" src="/pve2/touch/sencha-touch-all-debug.js"></script>
    <script type="text/javascript" src="/pve2/touch/pvemanager-mobile.js"></script>
    <script type="text/javascript">
if (typeof(PVE) === 'undefined') PVE = {};
PVE.UserName = '$username'
PVE.CSRFPreventionToken = '$csrftoken';
    </script>    
  </head>
  <body>
  </body>
</html>
_EOD
  
    return $page;

}

1;
