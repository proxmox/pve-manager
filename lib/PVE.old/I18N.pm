package PVE::I18N;

use strict;
require Exporter;
use vars qw(@ISA @EXPORT);
use Encode;
use HTML::Entities;
use Locale::Messages qw (:libintl_h dgettext);

@ISA = qw(Exporter);
@EXPORT = qw( __ );

my $nlsinited;
my $language = 'C';
my $lang_is_utf8 = 0;

my %textdomains = ();


sub import
{
    my ($self, $textdomain) = @_;

    # like Locale/TextDomain.pm 
    # usage: use PVE::I18N qw(<textdomain>)

    $textdomain = 'pve-manager' if !$textdomain;

    # Check our caller.
    my $package = caller;
    return if exists $textdomains{$package};

    # Remember the textdomain of that package.
    $textdomains{$package} = $textdomain;

    PVE::I18N->export_to_level (1, $package, @EXPORT);
}

sub get_lang {
    
    my $section = 'default';
    my $lang = 'C';

    open (SYSCFG, "</etc/pve/pve.cfg") || return $lang;
    while (my $line = <SYSCFG>) {
	chomp $line;
	if ($line =~ m/\s*language\s*:\s*(\S+)\s*$/) {
	    $lang = $1;
	    last;
	}
    } 
    close (SYSCFG);

    return $lang;
}

sub set_lang {
    my $lang = shift;

    $language = $lang;

    $lang_is_utf8 = scalar (grep { $language eq $_ } qw (vi pl ja hu ro ru fr tr zh_CN sr cs sl))
}

if (!$nlsinited) {

    set_lang (get_lang);

    $nlsinited = 1;
}

sub __ { 
    my $msgid = shift;
    my $oldlang = $ENV{LANGUAGE};
    my $oldlc_all = $ENV{LC_ALL};
    $ENV{LANGUAGE} = $language;

    my $package = caller;    
    my $textdomain = $textdomains{$package};

    my $res = dgettext($textdomain, $msgid);
 
    if ($lang_is_utf8) {
	$res = decode('UTF-8', $res) ;
    } else {
	$res = decode('iso-8859-1', $res) ;
    }

    $ENV{LANGUAGE} = $oldlang || '';
    $ENV{LC_ALL} = $oldlc_all || '';
    return $res;
}

1;
