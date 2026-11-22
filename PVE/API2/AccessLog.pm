package PVE::API2::AccessLog;

use v5.36;

use Fcntl qw(:flock O_APPEND O_CREAT O_WRONLY);
use HTTP::Status qw(:constants);

use PVE::Exception qw(raise raise_param_exc);
use PVE::JSONSchema qw(get_standard_option);
use PVE::RPCEnvironment;

use Proxmox::RS::AccessLog;

use base qw(PVE::RESTHandler);

# The end of 9999, the last year the four digits of the access log's timestamps can hold
my $LATEST_LOG_TIME = 253402300799;

my $access_log_filter = {
    since => {
        description => "Only requests logged at or after this UNIX epoch.",
        type => 'integer',
        minimum => 0,
        maximum => $LATEST_LOG_TIME,
        optional => 1,
    },
    until => {
        description => "Only requests logged at or before this UNIX epoch.",
        type => 'integer',
        minimum => 0,
        maximum => $LATEST_LOG_TIME,
        optional => 1,
    },
    'auth-id' => {
        description => "Only requests whose user or API token contains this text, ignoring"
            . " case, so a user also matches its own API tokens.",
        type => 'string',
        maxLength => 1024,
        optional => 1,
    },
    client => {
        description => "Only requests from this client address.",
        type => 'string',
        format => 'ip',
        optional => 1,
    },
    method => {
        description => "Only requests with this HTTP method.",
        type => 'string',
        maxLength => 32,
        optional => 1,
    },
    path => {
        description => "Only requests whose path contains this text.",
        type => 'string',
        maxLength => 1024,
        optional => 1,
    },
    search => {
        description => "Only requests whose client address, user or path contains this"
            . " text, ignoring case.",
        type => 'string',
        maxLength => 1024,
        optional => 1,
    },
    'auth-id-exact' => {
        description => "Whether 'auth-id' only matches itself as a whole, so a user does not"
            . " match its API tokens, and '-' matches requests without any.",
        type => 'boolean',
        optional => 1,
    },
    'path-group' => {
        description => "Only requests whose path falls into this group, as the statistics list"
            . " them.",
        type => 'string',
        maxLength => 1024,
        optional => 1,
    },
    'min-status' => {
        description => "Only responses with a known HTTP status code of at least this value.",
        type => 'integer',
        minimum => 100,
        maximum => 999,
        optional => 1,
    },
    'max-status' => {
        description => "Only responses with a known HTTP status code of at most this value.",
        type => 'integer',
        minimum => 100,
        maximum => 999,
        optional => 1,
    },
};

# Converts the filter parameters for the Rust side, which takes integers only as such.
my sub access_log_filter_from_param($param) {
    my $filter = {};
    for my $key (qw(auth-id client method path search path-group)) {
        $filter->{$key} = $param->{$key} if defined($param->{$key});
    }
    for my $key (qw(since until min-status max-status)) {
        $filter->{$key} = int($param->{$key}) if defined($param->{$key});
    }
    $filter->{'auth-id-exact'} = $param->{'auth-id-exact'} ? 1 : 0
        if defined($param->{'auth-id-exact'});
    return $filter;
}

my sub raise_access_log_error($error) {
    die $error if ref($error) ne 'HASH' || !$error->{message} || !$error->{code};
    raise("$error->{message}\n", code => $error->{code});
}

# A scan can read through hundreds of MiB and blocks its pvedaemon worker meanwhile, so the host
# runs one at a time and refuses further ones rather than letting them wait for it in more workers.
our $SCAN_LOCK = '/run/pve-access-log-scan.lck';

my sub scan_access_log($code) {
    # anybody who can open the file can hold its lock and so block all scans
    sysopen(my $lock, $SCAN_LOCK, O_WRONLY | O_CREAT | O_APPEND, 0600)
        or die "unable to open '$SCAN_LOCK' - $!\n";
    chmod(0600, $lock) or die "unable to restrict '$SCAN_LOCK' - $!\n";
    if (!flock($lock, LOCK_EX | LOCK_NB)) {
        die "unable to lock '$SCAN_LOCK' - $!\n" if !$!{EWOULDBLOCK};
        raise(
            "too many requests to the access log at once, try again later\n",
            code => HTTP_SERVICE_UNAVAILABLE,
        );
    }
    my $result = eval { $code->() };
    my $err = $@;
    close($lock);
    raise_access_log_error($err) if $err;
    return $result;
}

our $LOG_DIR = '/var/log/pveproxy';

# With a global dateext, logrotate named rotated copies by date before the access log's own
# configuration set nodateext. They are not read, so name those modified at or after $since, as a
# copy is modified last when rotated, after the requests it holds.
my sub dated_copies($since) {
    opendir(my $dir, $LOG_DIR) or return [];
    my @names;
    while (defined(my $name = readdir($dir))) {
        next if $name !~ /^access\.log-/;
        my $mtime = (lstat("$LOG_DIR/$name"))[9];
        push @names, $name if defined($mtime) && (!defined($since) || $mtime >= $since);
    }
    return [sort @names];
}

my $access_log_gap = {
    type => 'object',
    properties => {
        file => {
            description => "The name of the file.",
            type => 'string',
        },
        reason => {
            description => "Why the part was skipped: reaching it needs decompressing more of a"
                . " compressed copy than one page reads, or the copy is damaged.",
            type => 'string',
            enum => ['too-large', 'damaged'],
        },
        start => {
            description => "Where the skipped part starts, as offset in the uncompressed data.",
            type => 'integer',
        },
        end => {
            description => "Where the skipped part ends, missing if at the end of a compressed"
                . " copy.",
            type => 'integer',
            optional => 1,
        },
    },
};

my $access_log_counts = {
    requests => {
        description => "The number of requests.",
        type => 'integer',
    },
    'client-errors' => {
        description => "The number of requests with a known client-error status, 400 to 499.",
        type => 'integer',
    },
    'server-errors' => {
        description => "The number of requests with a known server-error status, 500 or more.",
        type => 'integer',
    },
    unauthenticated => {
        description => "The number of requests without an authenticated user.",
        type => 'integer',
    },
};

my sub access_log_stats_list($description) {
    return {
        description => $description,
        type => 'object',
        properties => {
            rows => {
                description => "The values with the most requests, most first.",
                type => 'array',
                items => {
                    type => 'object',
                    properties => {
                        key => {
                            description => "The value, missing for requests without one.",
                            type => 'string',
                            optional => 1,
                        },
                        %$access_log_counts,
                        last => {
                            description =>
                                "When the newest of the requests got logged, as UNIX epoch.",
                            type => 'integer',
                        },
                    },
                },
            },
            others => {
                description => "The requests of all other values.",
                type => 'object',
                properties => $access_log_counts,
            },
            tracked => {
                description => "The number of values counted separately.",
                type => 'integer',
            },
            truncated => {
                description => "Whether there were more values than get counted separately, so"
                    . " further ones only count as others, and the rows need not be the values"
                    . " with the most requests of all.",
                type => 'boolean',
            },
        },
    };
}

__PACKAGE__->register_method({
    name => 'access_log',
    path => '',
    method => 'GET',
    description => "Read a page of the API access log of pveproxy and spiceproxy, including its"
        . " rotated copies, newest requests first. A page ends once enough requests matched or"
        . " after reading 512 MiB of log data, also without any match, and the next page continues"
        . " at its 'next-cursor'. The values of query parameters are redacted for all but"
        . " root\@pam.",
    proxyto => 'node',
    permissions => {
        check => ['perm', '/nodes/{node}', ['Sys.Syslog']],
    },
    protected => 1,
    parameters => {
        additionalProperties => 0,
        properties => {
            node => get_standard_option('pve-node'),
            %$access_log_filter,
            limit => {
                description => "The maximum number of requests to return.",
                type => 'integer',
                minimum => 1,
                maximum => 1000,
                default => 500,
                optional => 1,
            },
            cursor => {
                description => "Continue with the requests logged before this position, the"
                    . " 'next-cursor' of the previous page.",
                type => 'string',
                pattern => '[A-Za-z0-9._-]+',
                maxLength => 128,
                optional => 1,
            },
            after => {
                description => "Only the requests logged after this position, the 'head-cursor'"
                    . " of an earlier page, to follow the log. Cannot be combined with 'cursor'.",
                type => 'string',
                pattern => '[A-Za-z0-9._-]+',
                maxLength => 128,
                optional => 1,
            },
        },
    },
    returns => {
        type => 'object',
        properties => {
            entries => {
                description => "The matching requests, from the end of the log and its newest"
                    . " rotated copy on, in reverse order of logging. Their times need not"
                    . " decrease strictly, as requests can get logged late and rotated copies can"
                    . " overlap.",
                type => 'array',
                items => {
                    type => 'object',
                    properties => {
                        time => {
                            description => "When the request was logged, as UNIX epoch.",
                            type => 'integer',
                        },
                        'utc-offset' => {
                            description =>
                                "The offset of the node's local time to UTC, in seconds.",
                            type => 'integer',
                        },
                        client => {
                            description => "The client address.",
                            type => 'string',
                            format => 'ip',
                            optional => 1,
                        },
                        'auth-id' => {
                            description => "The authenticated user or API token.",
                            type => 'string',
                            optional => 1,
                        },
                        method => {
                            description =>
                                "The HTTP method, with special characters escaped as \\xHH since"
                                . " pve-http-server 6.0.6. Omitted if the request was not read or"
                                . " its attribution is ambiguous.",
                            type => 'string',
                            optional => 1,
                        },
                        uri => {
                            description =>
                                "The request target as logged, normally percent-encoded, as sent"
                                . " by the client before pve-http-server 6.0.6. Omitted if the"
                                . " request was not read or its attribution is ambiguous.",
                            type => 'string',
                            optional => 1,
                        },
                        'http-version' => {
                            description =>
                                "The HTTP version, omitted if the request was not read or its"
                                . " attribution is ambiguous.",
                            type => 'string',
                            optional => 1,
                        },
                        'request-line' => {
                            description =>
                                "The raw request region of the log line, if it contains more"
                                . " than method, URI and HTTP version, like text around the"
                                . " request before pve-http-server 6.0.6, or another"
                                . " record after a cut line. Only returned to root\@pam, as it"
                                . " includes query parameter values.",
                            type => 'string',
                            optional => 1,
                        },
                        status => {
                            description =>
                                "The HTTP status code, omitted when the log line leaves"
                                . " the outcome ambiguous.",
                            type => 'integer',
                            optional => 1,
                        },
                        size => {
                            description =>
                                "The size of the response body in bytes, omitted when not"
                                . " logged or when the outcome is ambiguous.",
                            type => 'integer',
                            optional => 1,
                        },
                    },
                },
            },
            'next-cursor' => {
                description => "Where the next page continues, missing if no older requests are"
                    . " left to look at.",
                type => 'string',
                optional => 1,
            },
            'head-cursor' => {
                description => "Where the log ended when this page started, to get the requests"
                    . " logged since with 'after'. Missing on pages continuing at a cursor, and if"
                    . " the log has no complete line yet or ends in an unfinished overlong one.",
                type => 'string',
                optional => 1,
            },
            gaps => {
                description => "The parts of the log this page skipped, as they could not be"
                    . " read.",
                type => 'array',
                items => $access_log_gap,
            },
            complete => {
                description => "Whether this page and the ones before it covered the whole"
                    . " log, without any gap. With 'after', whether this page holds all requests"
                    . " logged since.",
                type => 'boolean',
            },
            'searched-back-to' => {
                description => "The time of the oldest request this page looked at, matching or"
                    . " not, as UNIX epoch. Requests are not strictly ordered in the log, so older"
                    . " ones can still follow.",
                type => 'integer',
                optional => 1,
            },
            'invalid-lines' => {
                description => "The number of lines this page looked at that failed to parse.",
                type => 'integer',
            },
            'dated-copies' => {
                description => "Rotated copies named by date, as logrotate's 'dateext' names"
                    . " them, which are not read but can hold older requests. Only on the last"
                    . " page.",
                type => 'array',
                items => { type => 'string' },
                optional => 1,
            },
        },
    },
    code => sub {
        my ($param) = @_;

        my $filter = access_log_filter_from_param($param);
        my $limit = defined($param->{limit}) ? int($param->{limit}) : undef;

        # Query strings can contain passwords; root@pam can read the unredacted file.
        my $redact = PVE::RPCEnvironment::get()->get_user() ne 'root@pam';
        my $path = "$LOG_DIR/access.log";

        raise_param_exc({ after => "cannot be combined with 'cursor'" })
            if defined($param->{after}) && defined($param->{cursor});
        my $result = scan_access_log(sub {
            if (defined(my $after = $param->{after})) {
                return Proxmox::RS::AccessLog::query_newer($path, $filter, $limit, $after,
                    $redact);
            }
            return Proxmox::RS::AccessLog::query($path, $filter, $limit, $param->{cursor},
                $redact);
        });
        if (!defined($param->{after}) && !defined($result->{'next-cursor'})) {
            my $dated = dated_copies($filter->{since});
            if (@$dated) {
                $result->{'dated-copies'} = $dated;
                $result->{complete} = 0;
            }
        }
        return $result;
    },
});

__PACKAGE__->register_method({
    name => 'access_log_stats',
    path => 'stats',
    method => 'GET',
    description => "Count the requests of the API access log of pveproxy and spiceproxy,"
        . " including its rotated copies, in a time range, which defaults to the last day. As the"
        . " log is not ordered by time, the counting reads through the files like a page of the"
        . " access log does, as much as one page at most, and tells which parts of the files it"
        . " covered.",
    proxyto => 'node',
    permissions => {
        check => ['perm', '/nodes/{node}', ['Sys.Syslog']],
    },
    protected => 1,
    parameters => {
        additionalProperties => 0,
        properties => {
            node => get_standard_option('pve-node'),
            %$access_log_filter,
            top => {
                description => "The number of values with the most requests to list.",
                type => 'integer',
                minimum => 1,
                maximum => 100,
                default => 10,
                optional => 1,
            },
            bucket => {
                description => "The length of a histogram bucket in seconds, chosen for at most"
                    . " 300 buckets if not set.",
                type => 'integer',
                minimum => 1,
                maximum => 9_223_372_036_854_775_807,
                optional => 1,
            },
        },
    },
    returns => {
        type => 'object',
        properties => {
            since => {
                description => "The start of the time range, as UNIX epoch.",
                type => 'integer',
            },
            until => {
                description => "The end of the time range, as UNIX epoch.",
                type => 'integer',
            },
            complete => {
                description =>
                    "Whether all lines of all files got counted. Otherwise, the counts"
                    . " are only those of the covered parts.",
                type => 'boolean',
            },
            stopped => {
                description => "Why the counting stopped before the oldest file ended.",
                type => 'string',
                enum => ['read-budget', 'parse-budget', 'damaged'],
                optional => 1,
            },
            covered => {
                description => "The parts of the files that got counted, newest first.",
                type => 'array',
                items => {
                    type => 'object',
                    properties => {
                        file => {
                            description => "The name of the file.",
                            type => 'string',
                        },
                        start => {
                            description =>
                                "Where the part starts, as offset in the uncompressed data.",
                            type => 'integer',
                        },
                        end => {
                            description => "Where the part ends, as offset in the uncompressed"
                                . " data.",
                            type => 'integer',
                        },
                    },
                },
            },
            'searched-back-to' => {
                description => "The time of the oldest request looked at, matching or not, as"
                    . " UNIX epoch. Requests are not strictly ordered in the log, so this does not"
                    . " bound the covered time.",
                type => 'integer',
                optional => 1,
            },
            'invalid-lines' => {
                description => "The number of lines that failed to parse, of the ones parsed"
                    . " completely. Lines whose first fields already rule them out do not get"
                    . " parsed further.",
                type => 'integer',
            },
            gaps => {
                description => "The damaged compressed copy the counting stopped at.",
                type => 'array',
                items => $access_log_gap,
            },
            'dated-copies' => {
                description => "Rotated copies named by date, as logrotate's 'dateext' names"
                    . " them, which are not counted but can hold requests of the time range.",
                type => 'array',
                items => { type => 'string' },
                optional => 1,
            },
            total => {
                description => "The counts of all matching requests.",
                type => 'object',
                properties => $access_log_counts,
            },
            histogram => {
                description => "The matching requests over the time range.",
                type => 'object',
                properties => {
                    start => {
                        description => "The start of the first bucket, as UNIX epoch.",
                        type => 'integer',
                    },
                    bucket => {
                        description => "The length of a bucket in seconds.",
                        type => 'integer',
                    },
                    counts => {
                        description => "The requests of each bucket.",
                        type => 'array',
                        items => {
                            type => 'object',
                            properties => $access_log_counts,
                        },
                    },
                },
            },
            clients => access_log_stats_list("The client addresses with the most requests."),
            'auth-ids' =>
                access_log_stats_list("The users and API tokens with the most requests."),
            'path-groups' => access_log_stats_list(
                "The path groups with the most requests, which replace the parts of API paths"
                    . " naming objects, like IDs, with placeholders."
            ),
            statuses => access_log_stats_list(
                "The status codes with the most requests. A missing key denotes an unknown"
                    . " status. Error counts include only requests with a known status."
            ),
        },
    },
    code => sub {
        my ($param) = @_;

        my $filter = access_log_filter_from_param($param);
        my $top = defined($param->{top}) ? int($param->{top}) : undef;
        my $bucket = defined($param->{bucket}) ? int($param->{bucket}) : undef;

        my $result = scan_access_log(sub {
            return Proxmox::RS::AccessLog::stats(
                "$LOG_DIR/access.log", $filter, $top, $bucket,
            );
        });
        my $dated = dated_copies($result->{since});
        if (@$dated) {
            $result->{'dated-copies'} = $dated;
            $result->{complete} = 0;
        }
        return $result;
    },
});

1;
