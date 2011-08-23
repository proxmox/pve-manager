package PVE::HTMLTable;

use strict;
use vars qw(@ISA);

sub new {
	my ($type, $width) = @_;

	my $self = {};

	$self->{rowcount} = 0;
	$self->{link_edit} = '';
	$self->{width} = $width;
	bless($self);
	
	return $self;
}
sub link_edit {
	my ($self, $v) = @_;
	if (defined($v)) {
		$self->{link_edit} = $v;
	}
	$self->{link_edit};
}

sub add_headline {
	my ($self,$headinfo) = @_;
	$self->{headline} = $headinfo;
}

sub set_param {
	my ($self, $v) = @_;
	if (defined($v)) {
		$self->{rowdata}->{$self->{rowcount}}->{param} = $self->{rowdata}->{$self->{rowcount}}->{param} . "&" . $v;
	}
	return "";
}
sub get_param {
	my ($self, $row) = @_;
	if (defined($row)) {
		return $self->{rowdata}->{$row}->{param};
	} else {
		return "";
	}	
}
sub set_row_link {
	my ($self,$lnk,$row) = @_;
	my $i;
	if (!(defined($row))) { $row = $self->{rowcount}; }
	$self->{rowdata}->{$row}->{lnk} = $lnk;
	return $self;
}

sub set_col_span {
        my ($self,$span,$row) = @_;
        if (!(defined($row))) { $row = $self->{rowcount}; }
        $self->{rowdata}->{$row}->{span} = $span;
        return $self;
}

sub add_row {
	my ($self,$id,@row) = @_;
	my $i;
	
	$self->{rowdata}->{$self->{rowcount}}->{len} = $#row;
	$self->{rowdata}->{$self->{rowcount}}->{id}  = $id;
	
	for $i (0 .. $#row)  {
		$self->{rowdata}->{$self->{rowcount}}->{"$i"} = $row[$i]; 
	}
	$self->{rowcount} = $self->{rowcount} + 1;
	return $self;
}

sub out_header {
	my ($self, $width) = @_;

	# NOTE: width = 100% if not specified
	# but you can also pass 0 or '' to avoid that behaviour

	if (!defined ($width)) { $width='100%'; }

	my $htmlout = "<table class='normal' cellspacing=0 cellpadding=3";

	$htmlout .= " style='width:$width;'" if $width;

	$htmlout .= ">";

	return $htmlout;	
}

sub out_headline {
	my ($self) = @_;

	return "" if !$self->{headline};

	my @headinfo = @{$self->{headline}};
	
	my $htmlout = "<thead><tr>";
	for my $i (0 .. ($#headinfo/3)) {
	    my ($span, $width, $text) = ($headinfo[$i*3], $headinfo[($i*3)+1],$headinfo[($i*3)+2]);
	    $htmlout .= "<th colspan=$span ";
	    $htmlout .=	" style='width:$width;'" if $width;
	    $htmlout .= ">$text</th>";
	}
	$htmlout .= "</tr></thead>";
	return $htmlout;
}


sub out_footer {
	my ($self) = @_;
	
	return "</table>";	
}

sub out_celldata {
	my ($self,$row,$col) = @_;
	my $data = $self->{rowdata}->{"$row"}->{"$col"};
	return $data;
}

sub out_table {
	my ($self, $width, $sel) = @_;
	
	my $htmlout = "";
	my $col1 = "#EDEDED";
	my $col2 = "#FFFFFF";
	my $col3 = "#FFF3BF";
	# Tableheader
	$htmlout .= $self->out_header($width);
	
	# Tableheadline
	$htmlout .= $self->out_headline ();
	
	$htmlout .= "<tbody>";

	#Tablecontent
	for my $i (0 .. ($self->{rowcount}-1)) {
	    my $col = $i % 2 ? $col2 : $col1;

	    $col = $col3 if defined ($sel) && $sel == $i;
		
	    $htmlout .= "<tr style='background-color:$col;'";

	    my $rid =  $self->{rowdata}->{$i}->{id};
	    $htmlout .= " id='$rid'" if $rid;

	    if (defined($self->{rowdata}->{$i}->{lnk})) {
		$htmlout .= " class='link' onClick='goTo(\"$self->{rowdata}->{$i}->{lnk}\");'";
	    }

	    $htmlout .= ">";
		
	    my @wa = @{$self->{width}};
	    my $span = $self->{rowdata}->{$i}->{span};
	    for my $c (0 .. $self->{rowdata}->{"$i"}->{len}) {
		my $sw = "";
		if (defined ($span) && (@$span[$c] > 1)) {
		    $sw = "colspan=@$span[$c]";
		}
		my $wtxt = $wa[$c] ? "width:$wa[$c];" : '';
		$htmlout .= "<td $sw style='$wtxt'>".$self->out_celldata($i, $c)."</td>";
		    
		$c += @$span[$c] - 1 if $sw;
	    }
	    $htmlout .= "</tr>\n";
	}
	
	$htmlout .= "</tbody>";

	# Tablefooter
	$htmlout .= $self->out_footer();

	return $htmlout;
}

1;
