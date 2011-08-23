package PVE::HTMLServices;

use strict;
use CGI '3.12';
use mod_perl2;
use Apache2::Const qw(:common);
use HTML::Entities;
use JSON;
use IO::File;
use POSIX qw(tzset strftime);
use Text::Wrap qw(wrap);
use PVE::Config;
use PVE::I18N;
use PVE::ConfigServer;
use PVE::HTMLUtils;
use PVE::HTMLTable;
use PVE::SafeSyslog;

$PVE::HTMLServices::Obj = bless {
    helo => 'Helo',

    methods => {
	index => { proto => "index ()" },
	command => { proto => "command (upid, did)" },
	command_abort => { "command_abort (upid)" },
	status => { proto => "status (cid)" },
	status_update => { proto => "status_update (cid)" },
	vzlist => { proto => "vzlist (cid)" },
	vmops => { proto => "vmops (inactive)" },
	vmlogview => { proto => "vmlogview (cid, veid, service)" },
	viewlog => { proto => "viewlog (service, filter)" },
	vmstatus => { proto => "vmstatus (cid, veid, type)" },
	hello => { proto => "hello ()" },
	servertime => { proto => "servertime ()" },
    },
	   
};

sub ws_json_hello {
    my($conn, $args) = @_;

    return {
	name => "A JSON Example",
	value => [ 'a', 'b'],
    };
}

sub ws_servertime {
    
    # trak TZ changes

    POSIX::tzset();
      
    my ($sec, $min, $hour) = localtime (time());

    return sprintf ("%02d:%02d:%02d", $hour, $min, $sec);
}

sub ws_json_vzlist {
    my($conn, $args) = @_;

    my $cid = $args->{"cid"};

    my $html;
    my $status;

    eval {
	my $cvzl = PVE::Cluster::vzlist_update ($cid, $conn->{ticket});
	die "no data" if !$cvzl;
	$html = PVE::HTMLUtils::create_vzlist_table ($cid, $cvzl->{"CID_$cid"});

    };

    my $err = $@;

    if ($err) {
	syslog ('err', $err);
	$html = "Unable to get data for Cluster Node $cid<br>";
	$status = "<blink><font color=red>Unable to load local cluster table</blink>";
    }

    return {
	html => $html,
	status => $status || "Online",
    };
}

sub ws_json_status {
    my($conn, $args) = @_;

    my $cid = $args->{"cid"};
    my $verbose = $args->{"verbose"};

    my $html;

    my $cinfo = PVE::Cluster::clusterinfo ();

    eval {
	my $rcon =  PVE::ConfigClient::connect ($conn->{ticket}, $cinfo, $cid);
	my $status = $rcon->ping()->result;
	$html = PVE::HTMLUtils::create_host_status ($cinfo, $status, $verbose);
    };

    my $err = $@;

    if ($err) {
	syslog ('err', $err);

	return {
	    html => encode_entities ("ERROR: $err"),
	    status => "Unable to get data for Cluster Node $cid<br>",
	};
    }

    return {
	html => $html,
	status => "Online",
    };
}

sub ws_status_update {
    my($conn, $args) = @_;

    my $cid = $args->{"cid"};

    my $html;

    my $cinfo = PVE::Cluster::clusterinfo ();

    my $ni = $cinfo->{"CID_$cid"};

    my $role = '-';
    my $name = "Node $cid";
    my $nodeip = '-';

    eval {

	die "unknown CID '$cid'\n" if !$ni;

	$role = $ni->{role};
	$role = 'Master' if $role eq 'M';
	$role = 'Node' if $role eq 'N';
 	
	$name = $ni->{name};
	$nodeip = $ni->{ip};
	
	my $rcon = PVE::ConfigClient::connect ($conn->{ticket}, $cinfo, $cid);

	my $status = $rcon->ping()->result;

	my $state = $status->{insync} ? 'active' : '<blink><font color=red>nosync</font></blink>';

	my $mem = int (0.5 + ($status->{meminfo}->{mbmemused}*100/$status->{meminfo}->{mbmemtotal}));
	my $disk = int (0.5 + ($status->{hdinfo}->{root}->{used}*100/$status->{hdinfo}->{root}->{avail}));

	my $cpu = int ($status->{cpu}*100);
	my $wait = int ($status->{wait}*100);

	$html = "<td>$name</td><td>$nodeip</td><td>$role</td><td>$state</td>" .
	    "<td>$status->{uptime}->{uptimestrshort}</td>" .
	    "<td>$status->{uptime}->{avg1}</td>" .
	    "<td>$cpu%</td><td>$wait%</td><td>$mem%</td><td>$disk%</td>";
	
    };

    my $err = $@;

    if ($err) {
	syslog ('err', $err);
	my $state = "<blink><font color=red>ERROR: " . encode_entities ($err) .  "</blink>";
	return "<td>$name</td><td>$nodeip</td><td>$role</td><td colspan=7>$state</td>";
    }

    return $html;
}

sub ws_json_vmstatus {
    my($conn, $args) = @_;

    my $cid = $args->{"cid"};
    my $veid = $args->{"veid"};
    my $type = $args->{"type"};

    my $html;
    my $status = '';

    my $cinfo = PVE::Cluster::clusterinfo ();

    eval {
	my $vzinfo = PVE::Cluster::load_vmconfig ($cinfo, $cid, $veid, $type, $conn->{ticket});
	$html = PVE::HTMLUtils::create_vmstatus ($cid, $veid, $type, $vzinfo);
    };

    my $err = $@;

    if ($err) {
	syslog ('err', $err);
	$html = "Unable to get data for VM $veid<br>";
	$status = "<blink><font color=red>Unable to load virtual machine config</blink>";
    }

    return {
	html => $html,
	status => $status,
    };
}

sub ws_json_vmlogview {
    my($conn, $args) = @_;

    my $cid = $args->{"cid"};
    my $veid = $args->{"veid"};
    my $service = $args->{"service"};

    my $html = '';
    my $status;

    my $cinfo = PVE::Cluster::clusterinfo ();

    eval {
	my $ni = $cinfo->{"CID_$cid"} || die "unknown CID '$cid'";

	my $rcon = PVE::ConfigClient::connect ($conn->{ticket}, $cinfo, $cid);
	my $lines = $rcon->vmlogview($cid, $veid, $service)->result;

	foreach my $line (@$lines) {
	    my $el =  encode_entities ($line) . "<br>\n";
	    if ($service eq 'init') {
		$el =~ s/&\#27;\[0;31m(.*)&\#27;\[0;39m/<font color=red>$1<\/font>/g;
		$el =~ s/&\#27;\[31m(.*)&\#27;\[39;49m/<font color=red>$1<\/font>/g;
		$el =~ s/&\#27;\[33m(.*)&\#27;\[39;49m/<font color=yellow>$1<\/font>/g;
		$el =~ s/&\#27;\[0;32m(.*)&\#27;\[0;39m/<font color=green>$1<\/font>/g;
		$el =~ s/&\#27;\[\d+G//g;
	    }
	    $html .=  $el;
	}
    };

    my $err = $@;

    if ($err) {
	syslog ('err', $err);
	$html = "Unable to get data for Cluster Node $cid<br>";
	$status = "<blink><font color=red>Unable to load local cluster table</blink>";
    }

    return {
	html => $html,
	status => $status || "Online",
    };
}

# parse syslog line
sub syslog_parse_line {
    my ($line) = @_;

    my $rec;

    if ($line =~ 
	m/^(\S+\s+\S+\s+\S+)\s+(\S+)\s+([^\s\[:]+)(\[(\S+)\])?([^:]*):\s+(.*)$/) {
	$rec->{date} = $1;
	$rec->{host} = $2;
	$rec->{prog} = $3;
	$rec->{prog} .= " $6" if $6;
	$rec->{pid} = $5;
	$rec->{text} = $7;
    } else {
	if ($line =~ 
	m/^(\S+\s+\S+\s+\S+)\s+(\S+)\s+(last message repeated \d+ times)$/) {
	    $rec->{date} = $1;
	    $rec->{host} = $2;
	    $rec->{prog} = 'syslog';
	    $rec->{pid} = 0;
	    $rec->{text} = $3;
	} else {	
	    # unknown log format 
	    $rec->{date} = "0";
	    $rec->{host} = "unknown";
	    $rec->{prog} = "unknown";
	    $rec->{pid} = "0";
	    $rec->{text} = $line;
	}
    }

    if (lc ($rec->{prog}) eq '/usr/sbin/cron') {
	$rec->{prog} = 'cron';
    }

    return $rec;
}

sub ws_json_viewlog {
     my($conn, $args) = @_;

     my $out = '';

     my $filter = $args->{"filter"};
     my $service = $args->{"service"} || '';
     my $trackid = $args->{"trackid"} || '';

     $filter =~ s|\\|\\\\|g;
     $filter =~ s/\?/\\\?/g;
     $filter =~ s/\(/\\\(/g;
     $filter =~ s/\)/\\\)/g;
     $filter =~ s/\{/\\\{/g;
     $filter =~ s/\}/\\\}/g;
     $filter =~ s/\[/\\\[/g;
     $filter =~ s/\]/\\\]/g;
     $filter =~ s/\./\\\./g;
     $filter =~ s/\*/\\\*/g;
     $filter =~ s/\+/\\\+/g;

     my $filename= "/var/log/syslog";

     my $limit = 100;

     if ($service eq 'apache') {
	 $filename = "/var/log/apache2/access.log";
     }
     
     my $running = 0;

     if ($trackid) {
	 my $rcon = PVE::ConfigClient::connect ($conn->{ticket});
	 $running = $rcon->check_worker ($trackid)->result;
     }

     $out .= "<table border=0 cellspacing=3 cellpadding=0 style='font-family:monospace;'>";

     if ($filename eq '/var/log/syslog') {
	 my $loga;
	 my $needhost;

	 open (TMP, "tail -$limit $filename|");
	 while (my $line = <TMP>) {
	     if (my $rec = syslog_parse_line ($line)) {
		 next if $filter && $line !~ m/$filter/i;
		 next if ($service && ($rec->{prog} !~ m"(^$service\/|\/$service$|^$service$)"));

		 push @$loga, $rec;
	     }
	 }
	 close (TMP);


	 foreach my $rec (@$loga) {
	     $out .= "<tr><td nowrap>" . encode_entities ($rec->{date}) . "&nbsp</td>";
	     if ($needhost) {	     
		 $out .= "<td nowrap>" . encode_entities ($rec->{host}) . "</td>";
	     }

	     $rec->{prog} =~ s|^postfix/||;

	     $out .= "<td nowrap>" . encode_entities ($rec->{prog}) . "</td>";
	     $out .= "<td align=right nowrap>" . $rec->{pid} . "&nbsp</td>";
	     $out .= "<td nowrap>" . encode_entities ($rec->{text}) . "</td>";
	     $out .= "</tr>";
	 }
     } else {
	 open (TMP, "tail -$limit $filename|");
	 while (my $line = <TMP>) {
	     chomp $line;
	     next if $filter && $line !~ m/$filter/i;
	     $line = encode_entities ($line);
	     $out .= "<tr><td nowrap>" . $line . "</td></tr>";
	 }
	 close (TMP);
     }
     $out .= "</table>\n";

     if ($trackid) {
	 return {
	     html => $out,
	     status => $running ? "Update in progress" : "Update finished",
	     running => $running,
	 };
     } else {
	 return {
	     html => $out,
	     status => "Online",
	     running => 1,
	 };
     }
}

sub ws_json_vmops {
    my($conn, $args) = @_;

    my $inactive = $args->{"inactive"};

    my $vmops = PVE::Config::read_file ("vmops");
    my $out = PVE::HTMLUtils::create_vmops_table ($vmops, $inactive);

    return { html => $out, status => 'OK' };
}

sub ws_command_abort {
     my($conn, $args) = @_;

     my $upid = $args->{"upid"};

     my $rcon = PVE::ConfigClient::connect ($conn->{ticket});
     $rcon->check_worker ($upid, 1);
}

sub ws_json_command {
    my($conn, $args) = @_;

    my $out = '';

    my $upid = $args->{"upid"};
    my $jsvar = $args->{"jsvar"};

    my $upid_hash = PVE::Utils::upid_decode ($upid); 

    my $cmdtype = $upid_hash->{type}; # 'vmops', 'apldownload'

    if (!$upid_hash || !$upid_hash->{filename}) {
	return { 
	    html => '', 
	    running => 0, 
	    status => "got strange parameters $upid" 
	    };
    }

    my $filename = $upid_hash->{filename};

    my $fh = new IO::File $filename, "r";
    if (!defined ($fh)) {
	return { 
	    html => '', 
	    running => 1, 
	    status => "unable to open output file '$filename'" };
    }

    my $savedid = <$fh>;
    chomp $savedid;

    if ($savedid ne $upid) {
	return { html => '', running => 0, status => "no data"}; 
    }

    my $out = '';
    my $line;

    while (defined ($line = <$fh>)) {
	chomp $line;

	# skip ssh warning
	next if $line =~ m/^tcgetattr: Inappropriate ioctl for device$/;

	my $stat = '';
	while (defined ($line) && $line =~ m/^rsync\s+status:/) {
	    $stat = $line;
	    if (defined ($line = <$fh>)) {
		chomp $line;
	    }
	}

	$out .=  encode_entities ($stat) . "<br>" if $stat;

	$out .=  encode_entities ($line) . "<br>" if defined ($line);;
    }

    $fh->close;

    my $rcon = PVE::ConfigClient::connect ($conn->{ticket});
    my $running = $rcon->check_worker ($upid)->result;

    my $status;

    if ($cmdtype eq 'apldownload') {
	$status = $running ? "downloading '$upid_hash->{apl}'" : "download finished";
    } else {
	$status = $running ? "executing command" : "command finished";
    }
    return {
	html => $out,
	status => $status,
	running => $running,
    };
}

sub ws_index {
    my($conn, $args) = @_;

    my $obj = $conn->{server};

    my $out = "Proxmox Web Service Description<br><br>";

    foreach my $m (keys %{$obj->{methods}}) {
	my $proto = $obj->{methods}->{$m}->{proto};
	$out .= "METHOD: $proto<br>";
    }

    return $out;
}

sub handler ($$) {
     my($obj, $r) = @_;

     my $auth_type = $r->ap_auth_type;
     my $uri = $r->uri;

     my $cookie_name = $auth_type->cookie_name ($r);
     my $cookie = $auth_type->key ($r);

     my ($username, $group) = split /::/, $cookie;

     my $conn = {
	 server => $obj,
	 request => $r,
	 uri => $uri,
	 user => $username,
	 group => $group,
	 ticket => $cookie,
     };

     my $pvecfg = PVE::Config::read_file ('pvecfg');
     my $language = $pvecfg->{language} || 'C';
     PVE::I18N::set_lang ($language);

     my $path = $r->path_info;
     if ($path =~ m'^/?(\w+)(\.htm|\.pl)?$' && $obj->{methods}->{$1}) {
	 my $name = $1;

	 my $cgi = CGI->new ($r);

	 my $arglist = $cgi->Vars();

	 $r->no_cache (1);

	 if (my $serv = $obj->can ("ws_script_$name")) {
	     my $data = &$serv ($conn, $arglist);
	     my $x = length ($data);
	     $r->content_type ('application/javascript');
	     $r->headers_out->set ("Content-length", "$x");
	     $r->headers_out->set ("Pragma", "no-cache");
	     $r->print ($data);
	     return OK;
	 } elsif (my $serv = $obj->can ("ws_json_$name")) {
	     my $data = &$serv ($conn, $arglist);
	     my $js = to_json($data, {utf8 => 1});
	     my $x = length ($js);
	     $r->content_type ('application/json');
	     $r->headers_out->set ("Content-length", "$x");
	     $r->headers_out->set ("Pragma", "no-cache");
	     $r->print ($js);
	     return OK;
	 } elsif (my $serv = $obj->can ("ws_$name")) {
	     my $data = &$serv ($conn, $arglist);
	     my $x = length ($data);
	     $r->content_type ('text/html');
	     $r->headers_out->set ("Content-length", "$x");
	     $r->headers_out->set ("Pragma", "no-cache");
	     $r->print ($data);
	     return OK;
	 } else {
	     return NOT_FOUND;
	 }
     } else {
	 return NOT_FOUND;
     }

     return OK;
}

1;
