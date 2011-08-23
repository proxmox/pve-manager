package PVE::HTMLGrid;

use strict;

# define some symbolic names for standard widths used
my $col_widths = {
    fw  => 735, # overall form width

    fw1 => 150, # col1
    fw2 => 205, # col2
    fw4 => 205, # col4
};

# compute width of col3
$col_widths->{fw3} = $col_widths->{fw} - 
    $col_widths->{fw1} - $col_widths->{fw2} - $col_widths->{fw4};

$col_widths->{fw3to4} = $col_widths->{fw3} + $col_widths->{fw4};
$col_widths->{fw2to4} = $col_widths->{fw2} + 
    $col_widths->{fw3} + $col_widths->{fw4};
 
sub get_width {
    my $name = shift;

    die "internal error" if !defined ($col_widths->{$name});
    return $col_widths->{$name};
}

sub new {
    my ($type, @wa) = @_;

    my $self = {};

    $self->{rowcount} = 0;
    $self->{colums} = scalar (@wa);
    $self->{data} = [];

    my @awidth;
    my @aalign;
    foreach my $wd (@wa) {
	my ($w, $align) = split (/:/, $wd);

	my $rw = $col_widths->{$w};
	$w = $rw if defined ($rw);

	push @awidth, $w;
	push @aalign, $align;
    }

    $self->{widths} = [ @awidth ];
    $self->{aligns} = [ @aalign ];


    bless($self);
	
    return $self;
}

sub add_row {
    my ($self, @cols) = @_;

    push @{$self->{data}}, [ @cols ];
}

sub html {
    my ($self) = @_;

    my $out = "<table class=grid border=0 cellspacing=0 cellpadding=2>";
    my $widths = $self->{widths};
    my $aligns = $self->{aligns};
    for (my $i = 0; $i < $self->{colums}; $i++) {
	$out .= "<COL width='@$widths[$i]'>";
    }

    foreach my $ca (@{$self->{data}}) {
	$out .= "<tr>";

	for (my $i = 0; $i < $self->{colums}; $i++) {

	    my $align = @$aligns[$i] ? "align='@$aligns[$i]'" : '';
	    $out .= "<td $align>@$ca[$i]</td>"
	}
	
	$out .= "</tr>";
    }
    $out .= "</table>";

    $self->{rowcount} = 0;
    $self->{data} = [];

    return $out;
}

1;
