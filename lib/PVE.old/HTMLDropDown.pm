package PVE::HTMLDropDown;

use strict;
use vars qw(@ISA);

my $umenuid = 0;

sub new {
	my ($class) = @_;

	my $self = {};
	$self->{count}=0;
	$self->{links}=0;
	$self->{uid} = "pvemenu_" . ++$umenuid;
	bless($self);	
	return $self;
}

sub add_item {
	my ($self,$name,$link,$text,$img) = @_;
	if (!(defined($self->{$name}->{count}))) { $self->{$name}->{count}=0; }
	$self->{$name}->{$self->{$name}->{count}}->{link} = $link;
	$self->{$name}->{$self->{$name}->{count}}->{text} = $text;
	$self->{$name}->{$self->{$name}->{count}}->{image} = $img;
	$self->{$name}->{count} = $self->{$name}->{count} + 1;
	$self->{$name}->{menuid} = $self->{uid} . "_" . $name;
}

sub out_dropdown_menu {

	my ($self,$name) = @_;
	my $i;
	my $br=0;

	my $image = "/images/iarrdown.png";

	my $menuid = $self->{$name}->{menuid};

	my $html = "";
	$html .= "<div id=\"$menuid\" onMouseOut =\"dropdown('$menuid',0);\" onMouseOver=\"dropdown('$menuid',1);\" style=\"position:absolute; top:0px; left:0px; visibility: hidden;\">";

	$html .= "<span style='width:15px; color:#FFFFFF;'><img alt='' src='$image' border=0></span><br>";

	$html .= "<div class='dropdown'>";
	for $i (0 .. ($self->{$name}->{count}-1)) {
	
		
		if ($self->{$name}->{$i}->{text} eq "-" ) {
			$html = $html . "<hr width='175'>";
			$br=0;
		} else {
			if ($br == 1) {$html = $html . "<br>"; }
			my $img = $self->{$name}->{$i}->{image};
			my $imgtxt .= $img ? "<img alt='' src='$img' style='border:0px; vertical-align:text-bottom;'>&nbsp;&nbsp;" : '';
			my $txt = $self->{$name}->{$i}->{text};
			$txt =~ s/ /&nbsp;/g;
			$html .= "<a style='white-space:nowrap;' class='dropdown' id='${menuid}_ddlnk_$i' href='$self->{$name}->{$i}->{link}'>$imgtxt$txt</a>";
			$br=1;
		}	
	}

	$html .= "</div><br></div>";

	return $html;
}

sub out_symbol {
	my ($self,$name,$shape,$elink) = @_;
	my $html;

	my $image = "/images/tarrdown.png";
	if ($shape) {
	    $image = "/images/$shape.png";
	}

	my $menuid = $self->{$name}->{menuid};

	my $lnk_name = $menuid . "_lnk_" . $self->{links};
	if (defined($elink)) { $elink = ",'$elink'"; }
	$html = "<img alt='' style='cursor:pointer;' name='$lnk_name' src='$image' border=0 " .
	    "onMousedown=\"javascript:dropdown('$menuid',1,'$lnk_name'$elink);\">";
	$self->{links} = $self->{links} + 1;
	return $html;
}

1;

