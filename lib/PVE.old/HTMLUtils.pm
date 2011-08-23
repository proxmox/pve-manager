package PVE::HTMLUtils;

use strict;
require Exporter;
use vars qw(@ISA @EXPORT);
use Socket;
use PVE::I18N;
use HTML::Entities;
use PVE::HTMLDropDown;
use PVE::HTMLTable;
use PVE::HTMLGrid;
use PVE::HTMLControls;
use PVE::APLInfo;
use PVE::Storage;
use Data::Dumper;

@ISA = qw(Exporter);
@EXPORT = qw(check_field check_range check_write_mode);


# useful for debugging 
sub var_to_html {
    my $v = shift;

    return "<pre>" . Dumper ($v) . "</pre>";
}

sub format_size {
    my $size = shift;

    my $kb = $size / 1024;

    if ($kb < 1024) {
	return int ($kb) . "KB";
    }

    my $mb = $size / (1024*1024);

    if ($mb < 1024) {
	return int ($mb) . "MB";
    } else {
	my $gb = $mb / 1024;
	return sprintf ("%.2fGB", $gb);
    } 
}

# HTML encode/decode text to store in config files (single line encoding) 
sub encode_description {
    my $desc = shift;

    $desc = encode_entities ($desc);

    $desc =~ s|\r?\n|<br>|gm;

    return $desc;
}

sub decode_description {
    my $desc = shift;

    $desc =~ s|<br>|\n|g;

    return decode_entities ($desc);
}

# html field checks

sub check_range {
    my ($name, $value, $min, $max) = @_;

    if ($min && ($value < $min)) {
	die sprintf(__("Field '%s' is below minimum ($value < $min)") . "\n", $name);
    }
    if ($max && ($value > $max)) {
	die sprintf(__("Field '%s' is above maximum ($value > $max)") . "\n", $name);
    }
}

sub check_field {
    my ($name, $value, @checks) = @_;

    foreach my $c (@checks) {
	if ($c eq 'NOTEMPTY') {
	    die sprintf(__("Field '%s' must not be empty") . "\n", $name)  if !defined ($value) || ($value eq '');
	} elsif ($c eq 'NATURAL') {
	    die sprintf(__("Field '%s' contains invalid characters") . "\n", $name) if $value !~ m/^\d+$/;
	} elsif ($c eq 'FLOAT') {
	    die sprintf(__("Field '%s' contains invalid characters") . "\n", $name) if $value !~ m/^\d+(\.\d+)?$/;
	} elsif ($c eq 'NOWHITESPACES') {
	    die sprintf(__("Field '%s' must not contain white spaces") . "\n", $name) if $value =~ m/\s/;
	} elsif ($c eq 'HTMLCOLOR') {
	    die sprintf(__("Field '%s' is no valid html color (required format: #XXXXXX)") . "\n", $name) if $value !~ m/^\s*\#[a-f0-9A-F]{6}\s*$/;
	} elsif ($c eq 'EMAIL') {
	    if ($value !~ m/^\S+\@\S+\.\S+$/) {
		die sprintf(__("Field '%s' does not look like a valid email address") . "\n", $name);
	    }
	} elsif ($c eq 'IPADDRESS') {
	    if ($value !~ m/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/) {
		die sprintf (__("Field '%s' does not look like a valid IP address") . "\n", $name);
	    } 
	} elsif ($c eq 'MAC') {
	    if ($value !~ m/^([a-f0-9A-F]{2}:){5}[a-f0-9A-F]{2}$/) {
		die sprintf(__("Field '%s' does not look like no valid MAC address (required format: XX:XX:XX:XX:XX:XX)") . "\n", $name);
	    }
	} elsif ($c eq 'SERVER') { # resolves server name
	    my $packed_ip = gethostbyname($value);
	    if (!defined $packed_ip) {
		die sprintf(__("Field '%s' does not look like a valid server address") . "\n", $name);
	    }
	    $value = inet_ntoa($packed_ip);
	} elsif ($c eq 'PORTAL') { # resolves iscsi portal name

	    if ($value =~ m/^([^:]+)(:(\d+))?$/) {
		my $server = $1;
		my $port = $3;

		my $packed_ip = gethostbyname($server);
		if (defined $packed_ip) {
		    $server = inet_ntoa($packed_ip);
		    $value = $port ? "$server:$port" : $server;
		    next;
		}
	    }
	    die sprintf(__("Field '%s' does not look like a valid ISCSI portal") . "\n", $name);
	} elsif ($c =~ m/^CHAREXCL:(.*)$/) {
	    die sprintf(__("Field '%s' must not contain special characters") . "\n", $name) if $value =~ m/$1/;
	} elsif ($c =~ m/^REGMATCH:(.*)$/) {
	    die sprintf(__("Field '%s' must not contain special characters") . "\n", $name) if $value !~ m/$1/;
	} else {
	    die "unimplemente check '$c' - internal error";
	}
    }

    return $value;
}

sub msg {
    my $id = shift;

    return __('You do not have write access.') if $id eq 'nowr';

    return __('This information is only available on the master node.') if $id eq 'infoatmaster';

    return __("Are you sure you want to remove VM %s? This will permanently erase all VM data.") if $id eq 'confirm_remove';

}

sub check_write_mode {
    my ($perm) = @_;

    if ($perm ne 'w') {
	die msg('nowr') . "\n";
    }
}

sub modify_url {
  my ($uri, %args, %mod) = @_;

  my $qstring = "";

  $args{action} = undef if !defined ($args{action});
  $args{aa} = undef if !defined ($args{aa});

  foreach my $p (keys (%args)) {
    next if defined ($mod{$p}) || !defined ($args{$p});
    $qstring .= $qstring ? "&" : "?";
    $qstring .= "$p=$args{$p}";
  }
  foreach my $p (keys (%mod)) {
    $qstring .= $qstring ? "&" : "?";
    $qstring .= "$p=$mod{$p}";
  }

  return $uri . $qstring;
}

sub parse_args {
    my ($string) = @_;
    return () unless defined $string and $string;

    return map {
        tr/+/ /;
        s/%([0-9a-fA-F]{2})/pack("C",hex($1))/ge;
        $_;
    } split /[=&;]/, $string, -1;
}

# |----------------------------|
# |<b>$title</b>: $msg         |
# |----------------------------|
sub create_noteframe {
    my ($title, $msg) = @_;
    my $html = "<div class='menubg lightcolbd' style='width:741px;border:1px solid;padding:2px;'>";
   $html .= "<b>$title:</b> $msg</div>";
    return $html;
}

# create a nice box
#
# |----------------------------|
# |$left                 $right|
# |----------------------------|
# |$content                    |
# |----------------------------|

sub create_statusframe {
    my ($id, $left, $right, $content, $height) = @_;

    $left = '&nbsp;' if !$left;
    $right = '&nbsp;' if !$right;

    my $idtxt = $id ? "id='$id'" : '';
    my $idtxtleft = $id ? "id='${id}left'" : '';
    my $idtxtright = $id ? "id='${id}right'" : '';

    my $out .= "<table border=0 cellspacing=0 cellpadding=0 class='menubg lightcolbd' style='width:747px; border: 1px solid;border-bottom:0px;padding:2px;padding-left:5px;padding-right:5px;'>";
    $out .= "<tr><td $idtxtleft>$left</td>";

    $out .= "<td $idtxtright align=right>$right</td></tr></table>";

    my $hs = $height ? "height:${height}px;" : '';

    my $ovfl = $height ? 'auto' : 'visible';
    $out .= "<div $idtxt class=lightcolbd style='border: 1px solid; width:735px; $hs overflow:$ovfl; white-space: nowrap;padding:5px;'>$content</div>";

    return $out;
}

sub create_vmops_frame {
    my ($vmid, $upid) = @_;


    if (!$upid) {
	my $filename = "/tmp/vmops-$vmid.out";
	if (my $fh = IO::File->new ($filename, "r")) {
	    $upid = <$fh>;
	    close ($fh);
	    chomp $upid;
	}
    }

    my $out = '';

    if ($upid) {
	my $href = "javascript:command_abort(\"$upid\");";
	my $abort = "<a class='frmsubmit' id='abortbutton' href='$href'></a>";

	$out .= create_statusframe ('logview', undef, $abort, undef, 450, 1);
	$out .= PVE::HTMLControls::create_command_viewer ('logview',  'logviewleft', 'abortbutton', $upid);
    }else {
	$out .= __("Nothing to view");
    }

    return $out;
}

sub create_apldownload_frame {
    my ($userid, $upid) = @_;

    if (!$upid) {
	my $filename = "/tmp/apldownload-$userid.out";
	if (my $fh = IO::File->new ($filename, "r")) {
	    $upid = <$fh>;
	    close ($fh);
	    chomp $upid;
	}
    }

    my $out = '';

    if ($upid) {
	my $href = "javascript:command_abort(\"$upid\");";
	my $abort = "<a class='frmsubmit' id='abortbutton' href='$href'></a>";

	$out .= create_statusframe ('logview', undef, $abort, undef, 100);
	$out .= PVE::HTMLControls::create_command_viewer ('logview',  'logviewleft', 'abortbutton', $upid);
    }else {
	$out .= __("Nothing to view");
    }

    return $out;
}

sub create_cpubar {
    my ($width, $abs, $rel) = @_;

    my $dvrel = $rel > 100 ? 100 : $rel;
    my $dvabs = $abs > 100 ? 100 : $abs;

    my $hwidth1 = sprintf ("%dpx", $width);
    my $hwidth2 = sprintf ("%dpx", int (($width * $dvrel)/100));
    my $hwidth3 = sprintf ("%dpx", int (($width * $dvabs)/100));

    my $per = sprintf ("%0.2f%", $rel);

    return "<div style='padding:0px;background-color:#C0C0C0;border:1px solid #000000;width:$hwidth1;height:14px;position:relative;'><div style='position:absolute;top:0px;left:0px;background-color:#00C000;border:0px;width:$hwidth2;height:14px;'></div><div style='position:absolute;top:11px;left:0px;background-color:#00F000;border:0px;width:$hwidth3;height:3px;'></div><div align=center style='width:100%;position:absolute;top:1px;left:0px;font-size:10px;'>$per</div></div>";    
}

sub create_bar {
    my ($width, $max, $value, $text) = @_;

    if (!$max || ($max <= 0)) {
	$max = 1;
	$value = 0;
    }

    my $dv = $value > $max ? $max : $value;

    my $hwidth1 = sprintf ("%dpx", $width);

    my $hwidth2 = sprintf ("%dpx", int (($width * $dv)/$max));
 
    my $per =  $text ? $text : sprintf ("%0.2f%", ($value*100)/$max);
    return "<div style='padding:0px;background-color:#C0C0C0;border:1px solid #000000;width:$hwidth1;height:14px;position:relative;'><div style='position:absolute;top:0px;left:0px;background-color:#00C000;border:0px;width:$hwidth2;height:14px;'></div><div align=center style='width:100%;position:absolute;top:1px;left:0px;font-size:10px;'>$per</div></div>";
}

sub uptime_to_str {
    my ($ut, $long) = @_;

    if (!$ut) {
	return '-';
    }

    if ($long) {
	my $days = int ($ut / 86400);
	$ut -= $days*86400;
	my $hours = int ($ut / 3600);
	$ut -= $hours*3600;
	my $mins = int ($ut / 60);
	$ut -= $mins*60;

	if ($days) {
	    my $ds = $days > 1 ? __('days') : __('day');
	    return sprintf "%d $ds %02d:%02d:%02d", $days, $hours, $mins, $ut;
	} else {
	    return sprintf "%02d:%02d:%02d", $hours, $mins, $ut;
	}
    }

    if ($ut < 60) {
	return "${ut}s";
    } elsif ($ut < 3600) {
	my $mins = int ($ut / 60);
	return "${mins}m";
    } elsif ($ut < 86400) {
	my $hours = int ($ut / 3600);
	return "${hours}h";
    } else { 
	my $days = int ($ut / 86400);
	return "${days}d";	
    }
}
 
sub create_vzlist_table {
    my ($cid, $vzlist) = @_;

    my $table = PVE::HTMLTable->new ([]);

    my $out = '';

    my @header = ('1', '20px', '&nbsp;',
		  '1', '50px', __('VMID'),
		  '1', '70px', __('Status'),
		  '1', '235px', __('Name'),
		  '1', '50px', __('Uptime'),
		  '1', '100px', __('Disk'),
		  '1', '100px', __('Memory'),
		  '1', '100px', __('CPU'),
		  );

    $table->add_headline (\@header);

    my $ddown = PVE::HTMLDropDown->new ();
    $ddown->add_item ("menu${cid}_0", "?action=start", __('Start'));
    $ddown->add_item ("menu${cid}_0", "?confirmdestroy=1", __('Remove'));
    $ddown->add_item ("menu${cid}_0", "/vmlist/migrate.htm?online=0", __('Migrate'));

    $ddown->add_item ("menu${cid}_1", "?action=restart", __('Restart'));
    $ddown->add_item ("menu${cid}_1", "?action=shutdown", __('Shutdown'));
    $ddown->add_item ("menu${cid}_1", "?action=stop", __('Stop'));
    $ddown->add_item ("menu${cid}_1", "javascript:pve_console()", __('Console'));
    $ddown->add_item ("menu${cid}_1", "/vmlist/migrate.htm?online=0", __('Migrate'));

    $ddown->add_item ("menu${cid}_2", "?action=start", __('Start'));
    $ddown->add_item ("menu${cid}_2", "?action=umount", __('Unmount'));

    my $found = 0;

    foreach my $vkey (sort keys %$vzlist) {
	next if $vkey !~ m/^VEID_(\d+)$/;
	my $veid = $1;
	my $d = $vzlist->{$vkey};

	$found = 1;

	my $type = $d->{type};

	if ($d->{status} eq 'running' || $d->{status} eq 'stopped' || 
	    $d->{status} eq 'shutdown' || $d->{status} eq 'stop' || 
	    $d->{status} eq 'start' || $d->{status} eq 'mounted') {

	    my $mlabel = "menu${cid}_1";

	    if ($d->{status} eq 'stopped') {
		$mlabel = "menu${cid}_0";
	    } elsif ($d->{status} eq 'mounted') {
		$mlabel = "menu${cid}_2";
	    }

	    my $menu = $ddown->out_symbol ($mlabel, '', "&amp;cid=$cid&amp;veid=$veid&amp;type=$type");

	    $table->set_row_link ("/$type/$cid-$veid/index.htm");
	   
	    my $membar;
	    my $diskbar;
	
	    my $cpubar = create_cpubar (100, $d->{pctcpu}, $d->{relcpu});
	    if ($d->{type} eq 'openvz') {
		$membar = create_bar (100, $d->{maxmem}, $d->{mem}, 
				      format_size ($d->{mem}*1024*1024));

		if ($d->{status} ne 'stopped') { 
		    $diskbar = create_bar (100, $d->{maxdisk}, $d->{disk},
                                      format_size ($d->{disk}*1024*1024));
                } else {
		    my $ds = format_size ($d->{maxdisk}*1024*1024);
		    $diskbar = "<div width=100 align=right>$ds</div>";
                }
	    } elsif ($d->{type} eq 'qemu') {
		$membar = create_bar (100, $d->{maxmem}, $d->{mem},
                                      format_size ($d->{mem}*1024*1024));
		my $ds = format_size ($d->{maxdisk}*1024*1024);
		$diskbar = "<div width=100 align=right>$ds</div>";
	    }

            # add soft hyphenation (in case someone has a very long hostname)
            $d->{name} =~ s/\./\.&shy;/g;

	    if ($d->{status} eq 'stopped' || $d->{status} eq 'mounted') {
		$membar = '';
		$cpubar = '';
	    }
	    $table->add_row ('', $menu, $veid, $d->{status}, $d->{name},
			     uptime_to_str ($d->{uptime}), $diskbar, $membar, $cpubar);
	} elsif ($d->{status} eq 'create') {
	    $table->set_row_link ("/logs/index.htm?cid=$cid&amp;veid=$veid");
	    $table->add_row ('', '', $veid, $d->{status}, '', '', '', '', '');
	} else {
	    $table->add_row ('', '', $veid, $d->{status}, '', '', '', '', '');
	}
    }

    return __("Node has no VMs") if !$found;

    $out .= $ddown->out_dropdown_menu("menu${cid}_0");
    $out .= $ddown->out_dropdown_menu("menu${cid}_1");
    $out .= $ddown->out_dropdown_menu("menu${cid}_2");

    $out .= $table->out_table ();

    return $out;
}

sub create_vmops_table {
    my ($vmops, $inactive) = @_;

    my $table = PVE::HTMLTable->new ([]);

    my $out = '';

    my @header;

    if ($inactive) {
	@header = ('1', '120px', __('Command'),
		   '1', '200px', __('Start time'),
		   '1', '100px', __('User'),
		   '1', '100px', __('CID'),
		   '1', '100px', __('VMID'),
		   );
     } else {
	@header = ('1', '20px', '&nbsp;',
		   '1', '100px', __('Command'),
		   '1', '200px', __('Start time'),
		   '1', '100px', __('User'),
		   '1', '100px', __('CID'),
		   '1', '100px', __('VMID'),
		   );
   }

    $table->add_headline (\@header);

    my $ddown = PVE::HTMLDropDown->new ();
    $ddown->add_item ('menu0', "?action=stop", __('Stop'));

    my $tlist;

    
    PVE::Utils::foreach_vmrec ($vmops, sub {
	my ($cid, $vmid, $d) = @_;

	# command still running
	my $running = PVE::Utils::check_process ($d->{pid}, $d->{pstart});

	if (!$inactive && $running) {
	    my $menu = $ddown->out_symbol ('menu0', '', "&amp;cid=$cid&amp;veid=$vmid");
	    push @$tlist, {
		cid => $cid,
		veid => $vmid,
		starttime => $d->{starttime},
		menu => $menu,
		command => $d->{command},
		user => $d->{user},
	    };
	} elsif ($inactive && !$running) {
	    push @$tlist, {
		cid => $cid,
		veid => $vmid,
		starttime => $d->{starttime},
		command => $d->{command},
		user => $d->{user}
	    };
	}
    });

    if (!$tlist) {
	return __('Nothing to view');	
    } else {
	foreach my $ref (sort {$b->{starttime} <=> $a->{starttime}} @$tlist) {
	    $table->set_row_link ("/logs/index.htm?cid=$ref->{cid}&amp;veid=$ref->{veid}");
	    my $ct = localtime ($ref->{starttime});
	    if ($inactive) {
		$table->add_row ('', $ref->{command}, $ct, $ref->{user}, 
				 $ref->{cid}, $ref->{veid});		
	    } else {
		$table->add_row ('', $ref->{menu}, $ref->{command}, $ct, 
				 $ref->{user}, $ref->{cid}, $ref->{veid});
	    }
	}
    }

    $out .= $ddown->out_dropdown_menu("menu0");
    $out .= $table->out_table ();

    return $out;
}

sub html_table_ressource {
    my ($table, $barwidth, $name, $max, $cur, $text) = @_;
    
    my $rmax = defined ($max) ? $max : 1;

    my $bar = defined ($max) ? create_bar ($barwidth, $rmax, $cur, $text) : '&nbsp';

    my $maxtext = defined ($max) ? $max : "-";

    $table->add_row ('', $name, $cur, $maxtext, $bar);
}

sub action_button {
    my ($text, $action, $disabled) = @_;

    my $dtext = $disabled ? 'disabled' : '';
    my $loc = "?action=$action";
    return "<button $dtext type=button onclick='location=\"$loc\"'>$text</button>";
}

sub href_button {
    my ($text, $href, $disabled) = @_;

    $href = '' if !defined ($href);

    my $dtext = $disabled ? 'disabled' : '';
    return "<button $dtext type=button onclick='location=\"$href\"'>$text</button>";
}

sub create_confirmframe {
    my ($msg, $action, $href1, $href2) = @_;
 
    my $html .= "<br><div align=center>$msg</div><br>";

    my $b1 = PVE::HTMLUtils::href_button($action, $href1);
    my $b2 = PVE::HTMLUtils::href_button(__("Cancel"), $href2 || '');

    $html .= "<div align=center>$b1$b2</div><br>";

    return create_statusframe (undef, __("Confirm"), undef, $html);
}

  
sub create_vmstatus {
    my ($cid, $veid, $type, $vzinfo) = @_;

    my $status = $vzinfo->{vzlist}->{"VEID_$veid"}->{status};
    my $ip = $vzinfo->{vzlist}->{"VEID_$veid"}->{ip};
    my $name = $vzinfo->{vzlist}->{"VEID_$veid"}->{name};

    my $uptime = uptime_to_str ($vzinfo->{vzlist}->{"VEID_$veid"}->{uptime}, 1);

    my $veconf = $vzinfo->{config};
    my $ni =  $vzinfo->{ni};
    my $html = '';

    my $pkglist = PVE::APLInfo::load_data();
    my $tmpl = $veconf->{ostemplate}->{value};
    my $pkginfo = $pkglist->{'all'}->{"$tmpl\.tar\.gz"};

    my $manageurl;
    if ($ip && (my $url = $pkginfo->{manageurl})) {
	$manageurl = $url;
	$manageurl =~ s/__IPADDRESS__/$ip/i;
    }

    my $vmops = PVE::Config::read_file ("vmops");
    
    my $op;
    if (defined($vmops->{"CID_$cid"}) && defined ($vmops->{"CID_$cid"}->{"VEID_$veid"})) {
	my $d = $vmops->{"CID_$cid"}->{"VEID_$veid"};
	if (PVE::Utils::check_process ($d->{pid}, $d->{pstart})) { # still running
	    $op = $d->{command};
	}
    }

    my $grid = PVE::HTMLGrid->new ('fw1', 'fw2', "fw3to4:right");

    my $cmds = "<div>";

    if ($status eq 'running') {
	$cmds .= action_button ($type eq 'openvz' ? __("Restart") : __("Reset"), 
				'restart', defined ($op));
    } else {
	$cmds .= action_button (__("Start"), 'start',  defined ($op));
    }
    $cmds .= action_button (__("Shutdown"), 'shutdown',  defined ($op) || ($status ne 'running'));
    if ($status eq 'mounted') {
	$cmds .= action_button (__("Unmount"), 'umount',  defined ($op));
    } else {
	$cmds .= action_button (__("Stop"), 'stop',  defined ($op) || ($status eq 'stopped'));
    }
    $cmds .= href_button (__("Remove"), '?confirmdestroy=1',  defined ($op) || ($status ne 'stopped'));
    $cmds .= "</div>";

    $grid->add_row (__('Status') . ':', 
		    "<b>" . (defined ($op) ? "executing task '$op'" : $status),
		    $cmds);

    if ($type eq 'openvz') {
	my $iptext;
	
	if ($ip && $ip ne '-') {
	    if ($manageurl && ($status eq 'running')) {
		$iptext = "<a class=cmd target=top href='$manageurl'>$ip</a>";
	    } else {
		$iptext = $ip;
	    } 
	} else {
	    $iptext = __('unknown');
	}


	$grid->add_row (__('Hostname') . ':', $name,
			$uptime eq '-' ? '' : __('Uptime') . ": $uptime");


	my $clink;
	if ($status ne 'stopped') {
	    my $href = "javascript:pve_openvz_console($cid, $veid)";
	    $clink .= "<a class=cmd href='$href'>" . __("Open VNC console") . "</a>";
	}

	$grid->add_row (__('IP Address') . ':', $iptext, $clink);
    } else {
	if ($uptime ne '-') {
	    $grid->add_row (undef, undef, __('Uptime') . ": $uptime");
	}

	if ($status ne 'stopped') {
	    my $href = "javascript:pve_qemu_console($cid, $veid)";
	    $grid->add_row (undef, undef, "<a class=cmd href='$href'>Open VNC console</a>");
	}
    }

    $html .= $grid->html();

    $html .= "<br><br>";

    my $table = PVE::HTMLTable->new ([]);

    my $barwidth = 300;
    my $fw2 = int ((PVE::HTMLGrid::get_width ('fw') - $barwidth -
		    PVE::HTMLGrid::get_width ('fw1'))/2);

    my @header = ('1', PVE::HTMLGrid::get_width ('fw1') . 'px', __('Resource'),
		  '1', "${fw2}px", __('Current'),
		  '1', "${fw2}px",  __('Maximum'),
		  '1', "${barwidth}px",  '&nbsp',
		  );
    $table->add_headline (\@header);

    my $relcpu = $vzinfo->{vzlist}->{"VEID_$veid"}->{relcpu};
    html_table_ressource ($table, $barwidth, __('CPU Utilization') . ':', 100, $relcpu);

    if ($type eq 'openvz') {
	my $curmem = int ($vzinfo->{vzlist}->{"VEID_$veid"}->{mem});
	my $maxmem = int ($vzinfo->{vzlist}->{"VEID_$veid"}->{maxmem});

	html_table_ressource ($table, $barwidth, __("Memory/Swap") . ' (MB):', $maxmem, $curmem,
			      format_size ($curmem*1024*1024));
	my $curdisk = sprintf ("%0.2f", $vzinfo->{vzlist}->{"VEID_$veid"}->{disk} / 1024);
	my $maxdisk = sprintf ("%0.2f", $vzinfo->{vzlist}->{"VEID_$veid"}->{maxdisk} / 1024);
	html_table_ressource ($table, $barwidth, __("Disk space") . ' (GB):', $maxdisk, $curdisk);
    } else {
	my $curmem = int ($vzinfo->{vzlist}->{"VEID_$veid"}->{mem});
	my $maxmem = int ($vzinfo->{vzlist}->{"VEID_$veid"}->{maxmem});

	html_table_ressource ($table, $barwidth, __("Memory") . ' (MB):', $maxmem, $curmem,
                              format_size ($curmem*1024*1024));
    }


    $html .= $table->out_table ();

    return $html;
}

sub create_host_status {
    my ($cinfo, $status, $verbose) = @_;

    my @cellwidth = ('290px', '450px');

    my $table = PVE::HTMLTable->new (\@cellwidth);

    $table->add_row ('', __("Uptime"), $status->{uptime}->{uptimestr});

    $table->add_row ('', "CPU(s)", "$status->{cpuinfo}->{cpus} x $status->{cpuinfo}->{model}");

    my $stat = create_bar (300, 1, $status->{cpu});
    $table->add_row ('', __('CPU Utilization'), $stat);

    my $iowait = create_bar (300, 1, $status->{wait});
    $table->add_row ('', __('IO Delays'), $iowait);

    my $f1 = format_size ($status->{meminfo}->{mbmemtotal}*1024*1024);
    my $f2 = format_size ($status->{meminfo}->{mbmemused}*1024*1024);
    my $txt = __("Physical Memory") . " ($f1/$f2)";
    $stat = create_bar (300, $status->{meminfo}->{mbmemtotal},
			$status->{meminfo}->{mbmemused}, 
			format_size ($status->{meminfo}->{mbmemused}*1024*1024));
    $table->add_row ('', $txt, $stat);

    if ($status->{meminfo}->{mbswaptotal}) {

	$f1 = format_size ($status->{meminfo}->{mbswaptotal}*1024*1024);
	$f2 = format_size ($status->{meminfo}->{mbswapused}*1024*1024);
	$txt = __("Swap Space") . " ($f1/$f2)";
	$stat = create_bar (300, $status->{meminfo}->{mbswaptotal},
			    $status->{meminfo}->{mbswapused},
			    format_size ($status->{meminfo}->{mbswapused}*1024*1024));
	$table->add_row ('', $txt, $stat);
    }

    $f1 = format_size ($status->{hdinfo}->{root}->{total}*1024*1024);
    $f2 = format_size ($status->{hdinfo}->{root}->{used}*1024*1024);
    $txt = __("HD Space root") . " ($f1/$f2)";
    $stat = create_bar (300, $status->{hdinfo}->{root}->{avail},
			$status->{hdinfo}->{root}->{used});
    $table->add_row ('', $txt, $stat);

    $table->add_row ('', __("Version") . " (package/version/build)", $status->{cpuinfo}->{proxversion});

    $table->add_row ('', __("Kernel Version"), $status->{cpuinfo}->{kversion});

    my $out = $table->out_table();
    
    return $out if !$verbose || (scalar (@{$cinfo->{nodes}}) <= 1);

    $out .= "<br>";

    $table = PVE::HTMLTable->new ([]);

    my @header_sync = ('1', '150px', __('Synchronized Nodes'),
		       '1', '150px', __('IP Address'),
		       '1', '100px', __('Sync Status'),
		       '1', '200px', __('Last succesfull sync'),
		       '1', '100px', __('Delay (minutes)'),
		   );
    $table->add_headline (\@header_sync);

    foreach my $ni (@{$cinfo->{nodes}}) {
	my $lastsync = $status->{"lastsync_$ni->{cid}"};

	$table->set_row_link ("/cluster/index.htm?cid=$ni->{cid}");

	my $diff;
	if (defined ($lastsync)) {
	    $diff = time() - $lastsync;
	    $diff = 0 if $diff < 0;
	} else {
	    $table->add_row ('', $ni->{name}, $ni->{ip}, '-', '-', '-');
	    next;
	}
	my $sstatus = 'OK';
	my $dstatus = '-';

	if ($diff > (60*3)) {
	    $sstatus = '<blink><font color=red>nosync</font></blink>';
	    $dstatus =  int (($diff + 59)/60);
	}

	my $synctime = localtime ($lastsync);

	$table->add_row ('', $ni->{name}, $ni->{ip}, $sstatus, $synctime, $dstatus);
    }

    $out .= $table->out_table(); 

    return $out;
}

sub create_cluster_status {
    my ($cinfo) = @_;

    my $out = '';

    my $table = PVE::HTMLTable->new ([]);

    my @header = ('1', '100px', __('Hostname'),
		  '1', '100px', __('IP Address'),
		  '1', '50px', __('Role'),
		  '1', '50px', __('State'),
		  '1', '100px', __('Uptime'),
		  '1', '60px', 'Load',
		  '1', '60px', 'CPU',
		  '1', '60px', 'IODelay',
		  '1', '60px', 'Memory',
		  '1', '60px', 'Disk',
		  );

    $table->add_headline (\@header);

    foreach my $ni (@{$cinfo->{nodes}}) {
	my $role = cluster_format_role ($ni->{role});
	$table->set_row_link ("/cluster/index.htm?cid=$ni->{cid}");
	$table->set_col_span ([1,1,1,7]);
	$table->add_row ("rowcid$ni->{cid}", $ni->{name}, $ni->{ip}, $role, '');
    }
    $out .= $table->out_table ();

    foreach my $ni (@{$cinfo->{nodes}}) {
	$out .= PVE::HTMLControls::create_periodic_updater ("rowcid$ni->{cid}", 
							    '/ws/status_update', 
							    { cid => $ni->{cid} }, 5);
    }

    return $out;
}

sub create_pkginfo_frame {
    my ($d, $download) = @_;

    my $html = '<table>';

    $html .= "<tr><td width=100>Description:</td><td width=645><b>$d->{headline}</td>";
    $html .= "<tr><td><td style='white-space:normal;'>$d->{description}</td>" if $d->{description};
    $html .= "<tr><td colspan=2><hr></tr>";
    $html .= "<tr><td>Information:</td><td><a target=top href='$d->{infopage}'>$d->{infopage}</a></td>";

    #$html .= "<tr><td>Appliance:</td><td>$d->{package}</td>";
    $html .= "<tr><td>Version:</td><td>$d->{version}</td>";
    $html .= "<tr><td>Section:</td><td>$d->{section}</td>";
    #$html .= "<tr><td>OS:</td><td>$d->{os}</td>"; # already displayed with filename

    if ($d->{maintainer} =~ m/^\s*(.*\S)\s*\<(\S+\@\S+)\>\s*$/) {
	$html .= "<tr><td>Maintainer:</td><td>$1 <a href='mailto:$2'>&lt;$2&gt;</a></td>";
    }

    $html .= "<tr><td>Filename:</td><td>$d->{template}</td>";
    $html .= "<tr><td>MD5SUM:</td><td>$d->{md5sum}</td>";


    $html .= "<tr><td colspan=2><tr><td colspan=2>";

    if ($download) {
	$html .= "<tr><td><td><a class=cmd href='?action=download&amp;aa=$d->{template}'>start download</a>";
    }

    $html .= "</table>";

    return PVE::HTMLUtils::create_statusframe ('', "Template Information for appliance '$d->{package}'", $d->{type}, $html);
}

sub storage_format_volume_list {
    my ($cfg, $vdisks) = @_;

    my $res = [];

    return $res if !$vdisks;

    PVE::Storage::foreach_volid ($vdisks, sub {
	my ($volid, $sid, $volname, $info) = @_;
       
	my $scfg = PVE::Storage::storage_config ($cfg, $sid);

	# skip used volumes
	return if PVE::Storage::volume_is_used ($cfg, $volid);

	my $stype = $scfg->{type};
	if ($stype eq 'iscsi') {
	    my $size = int ($info->{size} / (1024 *1024));
	    push @$res, [ $volid, sprintf "CH %02d ID %d LUN %d ($size GB)", 
			  $info->{channel}, $info->{id}, $info->{lun} ];
	} else {
	    push @$res, [ $volid, $volname];
	}
    });

    return $res;
}

sub storage_format_volume_list_iscsi {
    my ($cfg, $vdisks) = @_;

    my $res = {
	titles => [ 'CH', 'ID', 'LUN', 'Size (GB)', 'VolumeID' ],
	values => [],
    };

    return $res if !$vdisks;

    PVE::Storage::foreach_volid ($vdisks, sub {
	my ($volid, $sid, $volname, $info) = @_;
	my $scfg = PVE::Storage::storage_config ($cfg, $sid);

	# skip used volumes
	return if PVE::Storage::volume_is_used ($cfg, $volid);

	my $stype = $scfg->{type};
	if ($stype eq 'iscsi') {
	    my $size = int ($info->{size} / (1024 *1024));
	    my $short = sprintf "CH %02d ID %d LUN %d ($size GB)", $info->{channel}, 
	    $info->{id}, $info->{lun}, $size;
	    push @{$res->{values}}, [ $volid, $short, 
				      $info->{channel}, $info->{id}, $info->{lun},
				      $size, $volid ];
	} else {
	    die "wrong storage type";
	}
    });

    return $res;
}

sub storage_format_storage_list {
    my ($stinfo, $sel) = @_;

    my $res = {
	titles => [ 'Storage', 'Type', 'Used (GB)', 'Capacity (GB)', '&nbsp;' ],
	values => [],
    };

    return $res if !$stinfo;

    my $cfg = $stinfo->{cfg};

    $sel = 'images' if !$sel;

    foreach my $sid (sort keys %{$stinfo->{$sel}}) {
	my $scfg = PVE::Storage::storage_config ($cfg, $sid);

	my $used;
	my $avail;
	my $diskbar;

	if ($scfg->{type} eq 'iscsi') {
	    $used = $avail = "n/a";
	    $diskbar = '';
	} else {
	    my $d = $stinfo->{info}->{$sid};
	    $used = int ($d->{used} / (1024*1024));
	    $avail = int ($d->{avail} / (1024*1024));
	    $diskbar = create_bar (200, $d->{avail} , $d->{used});
	}

	push @{$res->{values}}, [ $sid, "$sid ($scfg->{type})", $sid, $scfg->{type}, $used, $avail, $diskbar ];
    }

    return $res;
}

sub storage_format_iso_list {
    my ($cfg, $tlist) = @_;

    my $res = [];

    return $res if !$tlist;

    PVE::Storage::foreach_volid ($tlist, sub {
	my ($volid, $sid, $volname, $info) = @_;
	my (undef, $name) = PVE::Storage::parse_volname_dir ($volname);
	push @$res, [$volid, $name];
    });

    return $res;
}

sub check_vztmpl_name {
    my ($name, $noerr) = @_;

    if ($name =~ m/^([^-]+-[^-]+)-([^_]+)_([^_]+)\_(i386|amd64)\.tar\.gz$/) {
	return [$1, $2, $3, $4];
    }

    return undef if $noerr;

    die sprintf __("name '%s' does not conform to template naming scheme") . 
		   " (<OS>-<OSVERSION>-<NAME>_<VERSION>_(i386|amd64).tar.gz)\n", $name;
}

sub storage_format_vztmpl_list {
    my ($cfg, $tlist) = @_;

    my $default;

    my $res = {
	titles => [__('OS'), __('Name'), __('Version'), __('Arch.')],
	values => [],
    };

    return $res if !$tlist;

    PVE::Storage::foreach_volid ($tlist, sub {
	my ($volid, $sid, $volname, $info) = @_;
	my (undef, $name) = PVE::Storage::parse_volname_dir ($volname);

	$default = $volid if !$default && $volid =~ m|^local:vztmpl/debian-5.0-standard|;

	if (my $td = check_vztmpl_name ($name, 1)) {
	    push  @{$res->{values}}, [$volid, $name, @$td];
	}
    });

    return wantarray ? ($res, $default) : $res;
}

sub storage_format_vgs_list {
    my ($cfg, $tlist) = @_;

    my $res = [];

    return $res if !$tlist;

    foreach my $vgname (sort keys %$tlist) {

	# skip used groups
	next if PVE::Storage::vgroup_is_used ($cfg, $vgname);
	
	my $size = int ($tlist->{$vgname}->{size}/(1024*1024));
	push @$res, [$vgname, "$vgname (${size} GB)"];
    }

    if (!scalar(@$res)) {
	push @$res, [ '', "Found no volume groups"];
    }

    return $res;
}

sub cluster_format_cid_list {
    my ($cinfo, $exclude) = @_;

    my $res = {
	titles => [__('Name'), __('IP Address'), __('Role'), 'CID'],
	values => [],
    };

    return $res if !$cinfo;

    foreach my $ni (@{$cinfo->{nodes}}) {

	next if defined ($exclude) && ($exclude eq  $ni->{cid});

	my $role = cluster_format_role ($ni->{role});
	push @{$res->{values}}, [$ni->{cid}, "$ni->{name} ($ni->{ip})", 
				 $ni->{name}, $ni->{ip}, $role, $ni->{cid}];
    }
    
    return $res;
}

sub cluster_format_vmid_list {
    my ($vzl) = @_;

    my $res = {
	titles => ['VMID', __('Name'), __('Status') ],
	values => [],
	default => '-',
    };

    return $res if !$vzl;

    PVE::Utils::foreach_veid_sorted ($vzl, sub {
	my ($veid, $d) = @_;
	push  @{$res->{values}}, [$veid, "VM $veid ($d->{name})", $veid, 
				  $d->{name}, $d->{status}];
    });
    
    return $res;
}

sub cluster_format_role {
    my $role = shift;

    $role = __('Master') if $role eq 'M';
    $role = __('Node') if $role eq 'N';

    return $role;
}

1;

