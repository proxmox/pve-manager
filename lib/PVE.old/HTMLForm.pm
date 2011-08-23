package PVE::HTMLForm;

use strict;
use HTML::Entities;
use PVE::I18N;
use PVE::HTMLTable;

sub new {
    my ($type, $formdata, $name) = @_;
    my $self = {};
    
    $self->{formdata} = $formdata;
    $self->{elements} = 0;# internal element counter
    $self->{submit} = 0;			
    $self->{name} = $name ? $name : "frm";

    bless($self, $type);
	
    $self->{action} = $self->{formdata}->{"form_$self->{name}_submit"};

    $self->postaction;
    
    return $self;
}

sub postaction {
    my ($self) = @_;

    my ($key, %d);
	
    # Rebuild Date for IP, Bool and Time fields
    foreach $key (sort keys (%{$self->{formdata}})) {
	if ($key =~ m/ip_[0-9]+_(.*)/) {
	    if (!(exists ($d{$1})))  {
		$d{$1}=1;
		defined ($self->{formdata}->{"ip_0_$1"}) || 
		    ($self->{formdata}->{"ip_0_$1"} = '0');
		defined ($self->{formdata}->{"ip_1_$1"}) || 
		    ($self->{formdata}->{"ip_1_$1"} = '0');
		defined ($self->{formdata}->{"ip_2_$1"}) || 
		    ($self->{formdata}->{"ip_2_$1"} = '0');
		defined ($self->{formdata}->{"ip_3_$1"}) || 
		    ($self->{formdata}->{"ip_3_$1"} = '0');
		$self->{formdata}->{"$1"} = 	
		    $self->{formdata}->{"ip_0_$1"} . "." .
		    $self->{formdata}->{"ip_1_$1"} . "." .
		    $self->{formdata}->{"ip_2_$1"} . "." . 
		    $self->{formdata}->{"ip_3_$1"};
	    }	
	}
	if ($key =~ m/time_[0-9]+_(.*)/) {
	    if (!(exists ($d{$1})))  {
		$d{$1}=1;
		defined ($self->{formdata}->{"time_0_$1"}) || 
		    ($self->{formdata}->{"time_0_$1"} = '00');
		defined ($self->{formdata}->{"time_1_$1"}) || 
		    ($self->{formdata}->{"time_1_$1"} = '00');
		$self->{formdata}->{"$1"} = 	
		    $self->{formdata}->{"time_0_$1"} . ":" .
		    $self->{formdata}->{"time_1_$1"};
	    }
	}
	if ($key =~ m/cb_n_(.*)/) {
	    if (!(exists ($d{$1})))  {
		my $name = $1;
		$d{$name} = 1;
		my $val = "";
		my $tmp;
		foreach my $k (keys (%{$self->{formdata}})) {
		    if ($k =~ m/cb__(\w+)_$name/) {
			$tmp->{$1} = 1;
		    }
		}
		foreach my $k (keys (%$tmp)) {
		    $val .= " " if $val;
		    $val .= $k;
	        }
		$self->{formdata}->{"$1"} = $val;
	    }
	}
	if ($key =~ m/bool_n_(.*)/) {
	    if (!(exists ($d{$1})))  {
		$d{$1}=1;
		my $val = "0";
		if ($self->{formdata}->{"bool_$1"}) {
		    $val = "1";
		}
		$self->{formdata}->{"$1"} = $val;
	    }
	}
    }
}

sub action {
    my ($self) = @_;
    return $self->{action};
}

sub create_element {
    my ($self, $name, $type, $value, $opt, $width) = @_;

    my $out = '';

    my $class = 'normal';

    my $encvalue = encode_entities ($value);

    $width = 200 if !$width;
    
    my $innerwidth = $width - 5; # width - margin - border - padding

    my $widthstr = "style='width:${innerwidth}px;'";

    # normal text
    if ($type eq "text") {
	$out .= "<input $widthstr class='$class' type='text' name=$name value='$encvalue'/>";
    } 
    elsif ($type eq "textarea") {
	my $rows = $opt || 4;
	my $rh = int ($rows*int(1.2*12+1));
	$out .= "<textarea class='$class' name=$name style='width:${innerwidth}px;height:${rh}px;' ROWS=$rows>$value</textarea>";
    } 
    elsif ($type eq "viewonly") {
	$out .= "<input $widthstr disabled class='$class' readonly type='text' value='$encvalue'></input>";
    }
    # read only text
    elsif ($type eq "rotext") {
	$out .= "<input readonly $widthstr class='$class rotext' type='text' " .
	    "name=${name} title='$encvalue' value='$encvalue'/>";
    }
    # server time
    elsif ($type eq "rotime") {
	my $uid = PVE::HTMLControls::get_uid('mytimer'); 
	$out .= "<div $widthstr class='bool input' id='$uid'>$encvalue</div>";
	$out .= PVE::HTMLControls::create_time_viewer ($uid);
    }
    # time of day
    elsif ($type eq "time") {
    	my @tmp = split(/:/, $value);
    	for my $i (0..1) {
	    $out .= "<input type=text name=time_${i}_$name class='$class time' value='$tmp[$i]' />";
	    $out .= " : " if !$i;
        }
    }
    # password
    elsif ($type eq "password") {
	$out .= "<input $widthstr class='$class' type='password' name=$name value='$encvalue'/>";
    }
    # number
    elsif ($type eq "number") {
	$out .= "<input $widthstr class='$class' type='text' id='$name' name='$name' value='$encvalue'/>";
    }
    # float
    elsif ($type eq "float") {
	$out .= "<input $widthstr class='$class' type='text' id='$name' name='$name' value='$encvalue'/>";
    }
    # boolean value (0, 1)
    elsif ($type eq "bool" || $type eq "robool" || $type eq 'dynamicbool' || $type eq "nbool") {
	my $checked = $value ? 'checked' : '';
	my $id = "bool_$name";

	$out .= "<label><div class='$class bool' style='width:${innerwidth}px;text-align:center;vertical-align:bottom;'>";
	$out .= "&nbsp;";
	if ($type eq 'dynamicbool') {  
	    $out .= "<input type='checkbox' name='$id' id='$id' $checked " . 
		"onClick='javascript:pve_form_save(\"$self->{name}\", \"post\");'/>";
	} elsif ($type eq "robool") {
	    $out .= "<input type='checkbox' disabled name='${id}_ro' $checked/>";
	} else {
	    $out .= "<input type='checkbox' name='$id' id='$id' $checked/>";
	}
    
	$out .= "&nbsp;";
	$out .= "</div></label>";
	if ($type eq "robool") {
	    $out .= "<input type='hidden' name='$id' id='$id' $checked/>";
	}
	$out .= "<input type='hidden' name='bool_n_$name' id='bool_n_$name' value='1'/>";
    }
    # dropdown
    elsif ($type eq "dropdown" || $type eq "dynamicdropdown") {

	my $table = PVE::HTMLTable->new ([]);

	my $titles;
	my $values;
	my $defvalue;
	if (ref($opt) eq 'ARRAY') {
	    $values = $opt;
	} else {
	    $values = $opt->{values};
	    $defvalue = $opt->{default};
	    foreach my $head (@{$opt->{titles}}) {
		push @$titles, 1, undef, $head;
	    }
	}

	$table->add_headline ($titles) if $titles;

	if (defined($value)) {
	    my $found;
	    my $first;
	    foreach my $elem (@$values) {
		my ($ev, $et, @da);
		if (ref ($elem) eq 'ARRAY') {
		    ($ev, $et, @da) = @$elem;
		} else {
		    $ev = $et = $elem;
		}
		$first = $ev if !$first;
		$found = 1 if $ev eq $value;
	    }
	    if (!$found) {
		$value = defined ($defvalue) ? $defvalue : $first;
	    }
	} 

	foreach my $elem (@$values) {
	    my ($ev, $et, @da);
	    if (ref ($elem) eq 'ARRAY') {
		($ev, $et, @da) = @$elem;
	    } else {
		$ev = $et = $elem;
	    }

	    push @da, $et if !scalar (@da);

	    if (!defined($value)) {
		$value = defined ($defvalue) ? $defvalue : $ev;
	    }

	    my $checked = ($ev eq $value) ? 'checked="checked"' : '';

	    my $inp = "<input type='radio' short='$et' name='$name' value='$ev' $checked />";
	    my @line;
	    foreach my $dv (@da) {
		if ($inp) {
		    push @line, "$inp$dv";
		    $inp = undef;
		} else {
		    push @line, $dv;
		}
	    }
     
	    $table->add_row ('', @line); 
	}		

	my $width1 = $width - 25;
	$out .= "<div class='selectblock' style='width:${width}px;position:relative;' id='selectblock_$name'>";
	$out .= "<div class='$class bool' style='white-space:nowrap;overflow:hidden;'><div style='display:block;float:right;'><img alt='' src='/images/tarrdown.png'></div><div style='width:${width1}px;overflow:hidden;'><span>$value</span></div></div>";

	$out .= "<div class='selectbox'>";
	$out .= $table->out_table();
	$out .= "</div>";
	$out .= "</div>";

	$out .= "<script language='javascript' type='text/javascript'>";
	if ($type eq "dynamicdropdown") {
	    $out .= "new Selectbox('selectblock_$name','$self->{name}');";
	} else {
	    $out .= "new Selectbox('selectblock_$name');";
	}
	$out .= "</script>";
    }
    # checkbox
    elsif ($type eq "checkbox") {
	my ($rows, $elref) = @$opt;
	my $sel;
	my @element = @$elref;
	map { $sel->{$_} = 1; } split ('\s', $value);
	$out .= "<table cellspacing=2 style='width:${width}px;' class='checkbox'>";
	for my $i (0 .. $#element/$rows) {
	    $out .= "<tr>";
	    for (my $j = 0; $j < $rows; $j++) {
		my $ind = $i*$rows + $j;
		last if $ind > $#element;
		my ($ev, $et) = ($element[$ind][0], $element[$ind][1]);
		my $val = $sel->{$ev} ? 'checked=true' : '';	    
		$out .= "<td><label>$et&nbsp;<input $val type=checkbox name='cb__${ev}_$name'></input></label></td>";
	    }
	    $out .= "</tr>";
	}		
	$out .= "</table>";
	$out .= "<input type=hidden name='cb_n_$name' value='$#element'/>";
    }
     # ip address
    elsif ($type eq "ip") {
	my @tmp = split(/\./, $value);
		
	$out .= "<table border=0 cellspacing=0 cellpadding=0><tr>";
	for my $i (0..3) {
	    my $id = "ip_${i}_$name";
	    my $nextid = $i < 3 ? "ip_" . ($i+1) . "_$name" : '';
	    my $float = "style='float:left;";
	    $out .= <<__EOD;
<td><input class='$class ip' type='text' id='$id' name='$id' value='$tmp[$i]'
    onKeyUp="pve_form_validate_natural('$id', 255);" 
    onKeyDown="return pve_form_ip_keyfilter(event,'$id','$nextid');"
/>
__EOD
	    if ($i != 3) { 
		$out .= "<td align=center style='width:8px;font-family:ARIAL;" . 
		    "font-weight:bold; font-size:14px;'>.</td>";
	    }
	}
	$out .= "</tr></table>";

    }
    # file upload 
    elsif ($type eq "file") {
	# most wrowsers (firefox) ignore setting 'width', dont know how to fix
	$out .= "<input $widthstr class='$class' type='file' id='$name' name='$name'/>";
    }
    # hidden input
    elsif ($type eq "hidden") {
	if (defined ($value)) {
	    $out .= "<input type='hidden' id='$name' name=$name value='$encvalue'/>";
	}
    } 
    # Day of week
    elsif ($type eq "dow") {
	my $cl = { mon => '', tue => '', wed => '', thu => '',
		   fri => '', sat => '', sun => '' };
	foreach my $day (split (/\s+/, $value)) {
	    $cl->{$day} = 'checked';
	}
	my @dn = split (/\s+/, __("Mon Tue Wed Thu Fri Sat Sun"));
	my $w='15%';
	$out .= "<div $widthstr class='bool'><table border=0 cellspacing=2 cellpadding=0>";
	$out .= "<tr align=center><td width='$w'>$dn[0]<td width='$w'>$dn[1]<td width='$w'>$dn[2]";
	$out .= "<td width='$w'>$dn[3]<td width='$w'>$dn[4]<td width='$w'>$dn[5]<td width='$w'>$dn[6]</tr>";
	$out .= "<tr align=center>";
	$out .= "<td><input type=checkbox $cl->{mon} name='$name' value=mon>";
	$out .= "<td><input type=checkbox $cl->{tue} name='$name' value=tue>";
	$out .= "<td><input type=checkbox $cl->{wed} name='$name' value=wed>";
	$out .= "<td><input type=checkbox $cl->{thu} name='$name' value=thu>";
	$out .= "<td><input type=checkbox $cl->{fri} name='$name' value=fri>";
	$out .= "<td><input type=checkbox $cl->{sat} name='$name' value=sat>";
	$out .= "<td><input type=checkbox $cl->{sun} name='$name' value=sun>";
	$out .= "</tr></table></div>";
    }
    else {
	die "unknown elemet type '$type'";
    }

    $out .= "\n";

    return $out;
}

sub create_cmdbutton {
    my ($self, $type, $text) = @_;

    my $href = "javascript:pve_form_save(\"$self->{name}\", \"$type\");";

    my $out = "<img alt='' style='vertical-align:text-bottom;width:15px; height:15px;' src='/images/tarrright.png'>&nbsp;";

    $text = $type if !$text;

    if ($type eq "save") {
	$text = __('save');
    } elsif ($type eq "search") {
	$text = __('search');
    } elsif ($type eq "create") {
	$text = __('create');
    } elsif ($type eq "upload") {
	$text = __('upload');
    } 

    $out .= "<a href='$href' class='frmsubmit'>$text</a>";

    return $out;
}

sub create_header {
    my ($self, $action) = @_;
    
    $action = '' if !$action;

    return "<form style='margin:0px;' id='$self->{name}' action='$action' method='POST' ENCTYPE='multipart/form-data' accept-charset='UTF-8'>";
}

sub create_footer {
    my $self = shift;

    my $out = $self->create_element("form_$self->{name}_submit", 'hidden', 'post');
    $out .= "</form>";

    return $out;
}

1;
