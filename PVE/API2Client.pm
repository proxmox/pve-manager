package PVE::API2Client;

use strict;
use warnings;
use URI;
use HTTP::Cookies;
use LWP::UserAgent;
use JSON;
use Data::Dumper; # fixme: remove
use HTTP::Request::Common;

sub get {
    my ($self, $path, $param) = @_;

    return $self->call('GET', $path, $param);
}

sub post {
    my ($self, $path, $param) = @_;

    return $self->call('POST', $path, $param);
}

sub put {
    my ($self, $path, $param) = @_;

    return $self->call('PUT', $path, $param);
}

sub delete {
    my ($self, $path, $param) = @_;

    return $self->call('DELETE', $path, $param);
}

sub update_ticket {
    my ($self, $ticket) = @_;

    my $domain = "$self->{host}.local" unless  $self->{host} =~ /\./;
    $self->{cookie_jar}->set_cookie(0, 'PVEAuthCookie', $ticket, '/', $domain);
}

sub login {
    my ($self) = @_;

    my $uri = URI->new();
    $uri->scheme($self->{protocol});
    $uri->host($self->{host});
    $uri->port($self->{port});
    $uri->path('/api2/json/access/ticket');

    my $ua = $self->{useragent};

    my $response = $ua->post($uri, { 
	username => $self->{username} || 'unknown',
	password => $self->{password} || ''});

    if (!$response->is_success) {
	die $response->status_line . "\n";
    }

    my $data = from_json($response->decoded_content, {utf8 => 1, allow_nonref => 1});

    $self->update_ticket($data->{data}->{ticket});
    $self->{csrftoken} = $data->{data}->{CSRFPreventionToken};
 
    return $data;
}

sub call {
    my ($self, $method, $path, $param) = @_;
	
    #print "wrapper called\n";

    my $ticket;

    my $ua = $self->{useragent};
    my $cj = $self->{cookie_jar};

    $cj->scan(sub {
	my ($version, $key, $val) = @_;
	$ticket = $val if $key eq 'PVEAuthCookie';
    });
    
    if (!$ticket && $self->{username} && $self->{password}) {
	$self->login();
    }

    my $uri = URI->new();
    $uri->scheme($self->{protocol});
    $uri->host($self->{host});
    $uri->port($self->{port});
    $uri->path($path);

    # print $ua->{cookie_jar}->as_string;

    #print "CALL $method : " .  $uri->as_string() . "\n";

    if ($self->{csrftoken}) {
	$self->{useragent}->default_header('CSRFPreventionToken' => $self->{csrftoken});
    }

    my $response;
    if ($method eq 'GET') {
	$uri->query_form($param);
	$response = $ua->request(HTTP::Request::Common::GET($uri));			   
    } elsif ($method eq 'POST') {
	$response = $ua->request(HTTP::Request::Common::POST($uri, Content => $param));
    } elsif ($method eq 'PUT') {
	# We use another temporary URI object to format
	# the application/x-www-form-urlencoded content.

	my $tmpurl = URI->new('http:');
	$tmpurl->query_form(%$param);
	my $content = $tmpurl->query;

	$response = $ua->request(HTTP::Request::Common::PUT($uri, 'Content-Type' => 'application/x-www-form-urlencoded', Content => $content));

    } elsif ($method eq 'DELETE') {
	$response = $ua->request(HTTP::Request::Common::DELETE($uri));
    } else {
	die "method $method not implemented\n";
    }
			      
    #print "RESP: " . Dumper($response) . "\n";

    my $ct = $response->header('Content-Type') || '';
    
    if ($response->is_success) {

	die "got unexpected content type" if $ct !~ m|application/json|;

	return from_json($response->decoded_content, {utf8 => 1, allow_nonref => 1});

    } else {

	my $msg = $response->status_line . "\n";
	eval {
	    return if $ct !~ m|application/json|;
	    my $res = from_json($response->decoded_content, {utf8 => 1, allow_nonref => 1});
	    if (my $errors = $res->{errors}) {
		foreach my $key (keys %$errors) {
		    my $m = $errors->{$key};
		    chomp($m);
		    $m =~s/\n/ -- /g;
		    $msg .= " $key: $m\n";
		}
	    }
	};
	die $msg;

    }
}

sub new {
    my ($class, %param) = @_;

    my $default_ca = "/etc/pve/pve-root-ca.pem";

    my $ssl_default_opts = {  verify_hostname => 0 };
    $ssl_default_opts->{SSL_ca_file} = $default_ca
	if -f $default_ca;

    my $self = { 
	ticket => $param{ticket},
	csrftoken => $param{csrftoken},
	username => $param{username},
	password => $param{password},
	host => $param{host} || 'localhost',
	port => $param{port},
	protocol => $param{protocol},
	ssl_opts => $param{ssl_opts} || $ssl_default_opts,
	timeout => $param{timeout} || 60,
    };
    bless $self;

    if (!$self->{port}) {
	$self->{port} = $self->{host} eq 'localhost' ? 85 : 8006;
    }
    if (!$self->{protocol}) {
	$self->{protocol} = $self->{host} eq 'localhost' ? 'http' : 'https';
    }

    $self->{cookie_jar} = HTTP::Cookies->new (ignore_discard => 1);

    $self->update_ticket($self->{ticket}) if $self->{ticket};

    $self->{useragent} = LWP::UserAgent->new(
	cookie_jar => $self->{cookie_jar},
	protocols_allowed => [ 'http', 'https'],
	ssl_opts => $self->{ssl_opts},
	timeout => $self->{timeout},
	);

    $self->{useragent}->default_header('Accept-Encoding' => 'gzip'); # allow gzip
  
    return $self;
}

1;
