package PVE::SourceFilter;

use Filter::Util::Call;
use Data::Dumper;

$Data::Dumper::Indent = 0; 

sub import
{
    my($type, @arguments) = @_;

    my $stat = {};
    filter_add ($stat) ;
}

sub filter
{
    my($self) = @_ ;
    my($status) ;

    $status = filter_read();
    if ($status <= 0) {
	return $status;
    }

    if (m/^package\s+(\S+);/) {
	foreach my $k (keys %$self) {delete $self->{$k}; }
	$self->{packagename} = $1;
    }

    if (m/^\s*\#\#FILTER_DATA\#\#/) {
	my $dtxt = Data::Dumper->Dump ([{%$self}], [qw(stats)]);
	$_ = "sub filter_data { my $dtxt; die \"PVE::SourceFilter - internal error\" if \$stats->{packagename} ne __PACKAGE__; return \$stats; }\n";
    }

    if (m/^sub\s+(\w+)\s.*\#\#SOAP_EXPORT\#\#/) {
	$self->{soap_exports}->{$1} = 1;
    }

    $self->{lines}++;

    $status ;
}

1;
