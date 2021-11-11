package PVE::API2::Cluster::Jobs;

use strict;
use warnings;

use PVE::RESTHandler;
use PVE::CalendarEvent;

use base qw(PVE::RESTHandler);

__PACKAGE__->register_method({
    name => 'index',
    path => '',
    method => 'GET',
    description => "Index for jobs related endpoints.",
    parameters => {
	additionalProperties => 0,
	properties => {},
    },
    returns => {
	type => 'array',
	description => 'Directory index.',
	items => {
	    type => "object",
	    properties => {
		subdir => {
		    type => 'string',
		    description => 'API sub-directory endpoint',
		},
	    },
	},
	links => [ { rel => 'child', href => "{subdir}" } ],
    },
    code => sub {
	return [
	   { subdir => 'schedule-analyze' },
	];
    }});

__PACKAGE__->register_method({
    name => 'schedule-analyze',
    path => 'schedule-analyze',
    method => 'GET',
    description => "Returns a list of future schedule runtimes.",
    permissions => { user => 'all' },
    parameters => {
	additionalProperties => 0,
	properties => {
	    schedule => {
		description => "Backup schedule. The format is a subset of `systemd` calendar events.",
		type => 'string', format => 'pve-calendar-event',
		maxLength => 128,
	    },
	    starttime => {
		description => "UNIX timestamp to start the calculation from. Defaults to the current time.",
		optional => 1,
		type => 'integer',
	    },
	    number => {
		description => "Number of timestamps to return.",
		optional => 1,
		type => 'integer',
		minimum => 1,
		maximum => 100,
		default => 10,
	    },
	},
    },
    returns => {
	type => 'array',
	description => 'Contains the guest objects.',
	items => {
	    type => 'object',
	    properties => {
		timestamp => {
		    type => 'integer',
		    description => 'UNIX timestamp for the run.',
		},
		utc => {
		    type => 'string',
		    description => "UTC timestamp for the run.",
		},
	    },
	},
    },
    code => sub {
	my ($param) = @_;

	my $starttime = $param->{starttime} // time();
	my $number = $param->{number} // 10;
	my $schedule = $param->{schedule};

	my $result = [];

	my $event = PVE::CalendarEvent::parse_calendar_event($schedule);

	for (my $count = 0; $count < $number; $count++) {
	    my $next = PVE::CalendarEvent::compute_next_event($event, $starttime);
	    push @$result, {
		timestamp => $next,
		utc => scalar(gmtime($next)),
	    };
	    $starttime = $next;
	}

	return $result;
    }});
