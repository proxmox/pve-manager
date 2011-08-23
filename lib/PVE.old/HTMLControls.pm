package PVE::HTMLControls;

use strict;
use JSON;

my $uidcount = 0;

my %jsesc = ( "\n" => '\n',
	   "\r" => '\r',
	   "\t" => '\t',
	   "\f" => '\f',
	   "\b" => '\b',
	   "\"" => '\"',
	   "\\" => '\\\\',
	   );

sub string_to_js {
    my $str = shift;
    $str =~ s/([\\\"\n\r\t\f\b])/$jsesc{$1}/eg;
    $str =~ s/([\x00-\x07\x0b\x0e-\x1f])/'\\u00' . unpack('H2',$1)/eg;
    return '"' . $str . '"';
}

sub get_uid {
    my $prefix = shift || 'uid';

    $uidcount++;

    return $prefix . '_' . $$. '_' .$uidcount;
}

# Ajax controls

sub create_log_viewer {
    my ($lvid, $service, $serviceid, $filterid, $statusid, $trackid) = @_;

    $service = '' if !$service;

    # trackid format: UID:$pid:/path/to/executable

    $trackid = '' if !$trackid;

    my $myupdater = get_uid ($lvid);

    my $out = "<script type='text/javascript'><!--\n";
    $out .= <<__EOJS;

    var $myupdater = new logViewer ('$lvid', '$service', '$serviceid', '$filterid', '$statusid', '$trackid');

    $myupdater.start();

__EOJS

    $out .= "--></script>\n";

    return $out;
}

sub create_wsviewer {
    my ($lvid, $statusid, $url, $args, $period) = @_;

    my $myupdater = get_uid ($lvid);

    $period = 10 if !$period;

    $statusid = '' if !$statusid;

    my $jsargs = to_json ($args); 
    my $out = "<script type='text/javascript'><!--\n";
    $out .= <<__EOJS;

    var $myupdater = new wsViewer ('$lvid', '$statusid', $period, '$url', $jsargs);

    $myupdater.start();

__EOJS

    $out .= "--></script>\n";

    return $out;
}

sub create_periodic_updater {
    my ($lvid, $url, $args, $period) = @_;

    $period = 10 if !$period;

    my $jsargs = to_json ($args); 

    $lvid = 'noautoupdate' if !$lvid;

    my $out = "<script type='text/javascript'><!--\n";
    $out .= <<__EOJS;

    new Ajax.PeriodicalUpdater ('$lvid', '$url', { 
	frequency: $period, 
	parameters: $jsargs
    });

__EOJS

    $out .= "--></script>\n";
    return $out;
}

# vzlist viewer

sub create_vzlist_viewer {
    my ($lvid, $statusid, $cid) = @_;

    my $myupdater = get_uid ($lvid);

    my $out = "<script type='text/javascript'><!--\n";
    $out .= <<__EOJS;

    var $myupdater = new vzlistViewer ('$lvid', '$statusid', '$cid');

    $myupdater.start();

__EOJS

    $out .= "--></script>\n";

    return $out;
}

# server time viewer

sub create_time_viewer {
    my ($uid) = @_;

    my $out = "\n<script type='text/javascript'><!--\n";
    $out .= <<__EOJS;
	
    new timeViewer ('$uid');
 
__EOJS
    $out .= "--></script>\n";

    return $out;
}

sub create_command_viewer {
    my ($lvid, $statusid, $abortid, $upid) = @_;

    my $jsvar = get_uid($lvid);

    return '' if !defined ($upid);
    return '' if !defined ($abortid);

    my $out = "\n<script type='text/javascript'><!--\n";
    $out .= <<__EOJS;

    var $jsvar = new commandViewer ('$jsvar', '$lvid', '$upid', '$statusid', '$abortid');

    $jsvar.start ();

__EOJS

    $out .= "--></script>\n";

    return $out;
}
 
1;
