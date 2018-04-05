package PVE::VZDump;

use strict;
use warnings;
use Fcntl ':flock';
use PVE::Exception qw(raise_param_exc);
use IO::File;
use IO::Select;
use IPC::Open3;
use File::Path;
use PVE::RPCEnvironment;
use PVE::Storage;
use PVE::Cluster qw(cfs_read_file);
use Time::localtime;
use Time::Local;
use PVE::JSONSchema qw(get_standard_option);
use PVE::HA::Env::PVE2;
use PVE::HA::Config;
use PVE::VZDump::Plugin;

my @posix_filesystems = qw(ext3 ext4 nfs nfs4 reiserfs xfs);

my $lockfile = '/var/run/vzdump.lock';

my $pidfile = '/var/run/vzdump.pid';

my $logdir = '/var/log/vzdump';

my @plugins = qw();

my $confdesc = {
    vmid => {
	type => 'string', format => 'pve-vmid-list',
	description => "The ID of the guest system you want to backup.",
	completion => \&PVE::Cluster::complete_local_vmid,
	optional => 1,
    },
    node => get_standard_option('pve-node', {
	description => "Only run if executed on this node.",
	completion => \&PVE::Cluster::get_nodelist,
	optional => 1,
    }),
    all => {
	type => 'boolean',
	description => "Backup all known guest systems on this host.",
	optional => 1,
	default => 0,
    },
    stdexcludes => {
	type => 'boolean',
	description => "Exclude temporary files and logs.",
	optional => 1,
	default => 1,
    },
    compress => {
	type => 'string',
	description => "Compress dump file.",
	optional => 1,
	enum => ['0', '1', 'gzip', 'lzo'],
	default => '0',
    },
    pigz=> {
	type => "integer",
	description => "Use pigz instead of gzip when N>0.".
	    " N=1 uses half of cores, N>1 uses N as thread count.",
	optional => 1,
	default => 0,
    },
    quiet => {
	type => 'boolean',
	description => "Be quiet.",
	optional => 1,
	default => 0,
    },
    mode => {
	type => 'string',
	description => "Backup mode.",
	optional => 1,
	default => 'snapshot',
	enum => [ 'snapshot', 'suspend', 'stop' ],
    },
    exclude => {
	type => 'string', format => 'pve-vmid-list',
	description => "Exclude specified guest systems (assumes --all)",
	optional => 1,
    },
    'exclude-path' => {
	type => 'string', format => 'string-alist',
	description => "Exclude certain files/directories (shell globs).",
	optional => 1,
    },
    mailto => {
	type => 'string', format => 'string-list',
	description => "Comma-separated list of email addresses that should" .
	    " receive email notifications.",
	optional => 1,
    },
    mailnotification => {
	type => 'string',
	description => "Specify when to send an email",
	optional => 1,
	enum => [ 'always', 'failure' ],
	default => 'always',
    },
    tmpdir => {
	type => 'string',
	description => "Store temporary files to specified directory.",
	optional => 1,
    },
    dumpdir => {
	type => 'string',
	description => "Store resulting files to specified directory.",
	optional => 1,
    },
    script => {
	type => 'string',
	description => "Use specified hook script.",
	optional => 1,
    },
    storage => get_standard_option('pve-storage-id', {
	description => "Store resulting file to this storage.",
	completion => \&complete_backup_storage,
	optional => 1,
    }),
    stop => {
	type => 'boolean',
	description => "Stop runnig backup jobs on this host.",
	optional => 1,
	default => 0,
    },
    size => {
	type => 'integer',
	description => "Unused, will be removed in a future release.",
	optional => 1,
	minimum => 500,
	default => 1024,
    },
    bwlimit => {
	type => 'integer',
	description => "Limit I/O bandwidth (KBytes per second).",
	optional => 1,
	minimum => 0,
	default => 0,
    },
    ionice => {
	type => 'integer',
	description => "Set CFQ ionice priority.",
	optional => 1,
	minimum => 0,
	maximum => 8,
	default => 7,
    },
    lockwait => {
	type => 'integer',
	description => "Maximal time to wait for the global lock (minutes).",
	optional => 1,
	minimum => 0,
	default => 3*60, # 3 hours
    },
    stopwait => {
	type => 'integer',
	description => "Maximal time to wait until a guest system is stopped (minutes).",
	optional => 1,
	minimum => 0,
	default => 10, # 10 minutes
    },
    maxfiles => {
	type => 'integer',
	description => "Maximal number of backup files per guest system.",
	optional => 1,
	minimum => 1,
	default => 1,
    },
    remove => {
	type => 'boolean',
	description => "Remove old backup files if there are more than 'maxfiles' backup files.",
	optional => 1,
	default => 1,
    },
};

# Load available plugins
my @pve_vzdump_classes = qw(PVE::VZDump::QemuServer PVE::VZDump::LXC);
foreach my $plug (@pve_vzdump_classes) {
    my $filename = "/usr/share/perl5/$plug.pm";
    $filename =~ s!::!/!g;
    if (-f $filename) {
	eval { require $filename; };
	if (!$@) {
	    $plug->import ();
	    push @plugins, $plug;
	} else {
	    die $@;
	}
    }
}

# helper functions

sub debugmsg {
    my ($mtype, $msg, $logfd, $syslog) = @_;

    PVE::VZDump::Plugin::debugmsg(@_);
}

sub run_command {
    my ($logfd, $cmdstr, %param) = @_;

    my $logfunc = sub {
	my $line = shift;
	debugmsg ('info', $line, $logfd);
    };

    PVE::Tools::run_command($cmdstr, %param, logfunc => $logfunc);
}

sub storage_info {
    my $storage = shift;

    my $cfg = PVE::Storage::config();
    my $scfg = PVE::Storage::storage_config($cfg, $storage);
    my $type = $scfg->{type};
 
    die "can't use storage type '$type' for backup\n" 
	if (!($type eq 'dir' || $type eq 'nfs' || $type eq 'glusterfs'
	      || $type eq 'cifs'));
    die "can't use storage '$storage' for backups - wrong content type\n" 
	if (!$scfg->{content}->{backup});

    PVE::Storage::activate_storage($cfg, $storage);

    return {
	dumpdir => PVE::Storage::get_backup_dir($cfg, $storage),
	maxfiles => $scfg->{maxfiles},
    };
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

sub format_time {
    my $seconds = shift;

    my $hours = int ($seconds/3600);
    $seconds = $seconds - $hours*3600;
    my $min = int ($seconds/60);
    $seconds = $seconds - $min*60;

    return sprintf ("%02d:%02d:%02d", $hours, $min, $seconds);
}

sub encode8bit {
    my ($str) = @_;

    $str =~ s/^(.{990})/$1\n/mg; # reduce line length

    return $str;
}

sub escape_html {
    my ($str) = @_;

    $str =~ s/&/&amp;/g;
    $str =~ s/</&lt;/g;
    $str =~ s/>/&gt;/g;

    return $str;
}

sub check_bin {
    my ($bin)  = @_;

    foreach my $p (split (/:/, $ENV{PATH})) {
	my $fn = "$p/$bin";
	if (-x $fn) {
	    return $fn;
	}
    }

    die "unable to find command '$bin'\n";
}

sub check_vmids {
    my (@vmids) = @_;

    my $res = [];
    foreach my $vmid (@vmids) {
	die "ERROR: strange VM ID '${vmid}'\n" if $vmid !~ m/^\d+$/;
	$vmid = int ($vmid); # remove leading zeros
	next if !$vmid;
	push @$res, $vmid;
    }

    return $res;
}


sub read_vzdump_defaults {

    my $fn = "/etc/vzdump.conf";

    my $defaults = {
	map {
	    my $default = $confdesc->{$_}->{default};
	     defined($default) ? ($_ => $default) : ()
	} keys %$confdesc
    };

    my $raw;
    eval { $raw = PVE::Tools::file_get_contents($fn); };
    return $defaults if $@;

    my $conf_schema = { type => 'object', properties => $confdesc, };
    my $res = PVE::JSONSchema::parse_config($conf_schema, $fn, $raw);
    if (my $excludes = $res->{'exclude-path'}) {
	$res->{'exclude-path'} = PVE::Tools::split_args($excludes);
    }
    if (defined($res->{mailto})) {
	my @mailto = PVE::Tools::split_list($res->{mailto});
	$res->{mailto} = [ @mailto ];
    }

    foreach my $key (keys %$defaults) {
	$res->{$key} = $defaults->{$key} if !defined($res->{$key});
    }

    return $res;
}

sub sendmail {
    my ($self, $tasklist, $totaltime, $err, $detail_pre, $detail_post) = @_;

    my $opts = $self->{opts};

    my $mailto = $opts->{mailto};

    return if !($mailto && scalar(@$mailto));

    my $cmdline = $self->{cmdline};

    my $ecount = 0;
    foreach my $task (@$tasklist) {
	$ecount++ if $task->{state} ne 'ok';
	chomp $task->{msg} if $task->{msg};
	$task->{backuptime} = 0 if !$task->{backuptime};
	$task->{size} = 0 if !$task->{size};
	$task->{tarfile} = 'unknown' if !$task->{tarfile};
	$task->{hostname} = "VM $task->{vmid}" if !$task->{hostname};

	if ($task->{state} eq 'todo') {
	    $task->{msg} = 'aborted';
	}
    }

    my $notify = $opts->{mailnotification} || 'always';
    return if (!$ecount && !$err && ($notify eq 'failure'));

    my $stat = ($ecount || $err) ? 'backup failed' : 'backup successful';
    if ($err) {
	if ($err =~ /\n/) {
	    $stat .= ": multiple problems";
	} else {
	    $stat .= ": $err";
	    $err = undef;
	}
    }

    my $hostname = `hostname -f` || PVE::INotify::nodename();
    chomp $hostname;

    # text part
    my $text = $err ? "$err\n\n" : '';
    $text .= sprintf ("%-10s %-6s %10s %10s  %s\n", qw(VMID STATUS TIME SIZE FILENAME));
    foreach my $task (@$tasklist) {
	my $vmid = $task->{vmid};
	if  ($task->{state} eq 'ok') {

	    $text .= sprintf ("%-10s %-6s %10s %10s  %s\n", $vmid,
				$task->{state},
				format_time($task->{backuptime}),
				format_size ($task->{size}),
				$task->{tarfile});
	} else {
	    $text .= sprintf ("%-10s %-6s %10s %8.2fMB  %s\n", $vmid,
				$task->{state},
				format_time($task->{backuptime}),
				0, '-');
	}
    }

    $text .= "\nDetailed backup logs:\n\n";
    $text .= "$cmdline\n\n";

    $text .= $detail_pre . "\n" if defined($detail_pre);
    foreach my $task (@$tasklist) {
	my $vmid = $task->{vmid};
	my $log = $task->{tmplog};
	if (!$log) {
	    $text .= "$vmid: no log available\n\n";
	    next;
	}
	open (TMP, "$log");
	while (my $line = <TMP>) { $text .= encode8bit ("$vmid: $line"); }
	close (TMP);
	$text .= "\n";
    }
    $text .= $detail_post if defined($detail_post);

    # html part
    my $html = "<html><body>\n";
    $html .= "<p>" . (escape_html($err) =~ s/\n/<br>/gr) . "</p>\n" if $err;
    $html .= "<table border=1 cellpadding=3>\n";
    $html .= "<tr><td>VMID<td>NAME<td>STATUS<td>TIME<td>SIZE<td>FILENAME</tr>\n";

    my $ssize = 0;

    foreach my $task (@$tasklist) {
	my $vmid = $task->{vmid};
	my $name = $task->{hostname};

	if  ($task->{state} eq 'ok') {

	    $ssize += $task->{size};

	    $html .= sprintf ("<tr><td>%s<td>%s<td>OK<td>%s<td align=right>%s<td>%s</tr>\n",
				$vmid, $name,
				format_time($task->{backuptime}),
				format_size ($task->{size}),
				escape_html ($task->{tarfile}));
	} else {
	    $html .= sprintf ("<tr><td>%s<td>%s<td><font color=red>FAILED<td>%s<td colspan=2>%s</tr>\n",
				$vmid, $name, format_time($task->{backuptime}),
				escape_html ($task->{msg}));
	}
    }

    $html .= sprintf ("<tr><td align=left colspan=3>TOTAL<td>%s<td>%s<td></tr>",
 format_time ($totaltime), format_size ($ssize));

    $html .= "</table><br><br>\n";
    $html .= "Detailed backup logs:<br /><br />\n";
    $html .= "<pre>\n";
    $html .= escape_html($cmdline) . "\n\n";

    $html .= escape_html($detail_pre) . "\n" if defined($detail_pre);
    foreach my $task (@$tasklist) {
	my $vmid = $task->{vmid};
	my $log = $task->{tmplog};
	if (!$log) {
	    $html .= "$vmid: no log available\n\n";
	    next;
	}
	open (TMP, "$log");
	while (my $line = <TMP>) {
	    if ($line =~ m/^\S+\s\d+\s+\d+:\d+:\d+\s+(ERROR|WARN):/) {
		$html .= encode8bit ("$vmid: <font color=red>".
				       escape_html ($line) . "</font>");
	    } else {
		$html .= encode8bit ("$vmid: " . escape_html ($line));
	    }
	}
	close (TMP);
	$html .= "\n";
    }
    $html .= escape_html($detail_post) if defined($detail_post);
    $html .= "</pre></body></html>\n";
    # end html part

    my $subject = "vzdump backup status ($hostname) : $stat";

    my $dcconf = PVE::Cluster::cfs_read_file('datacenter.cfg');
    my $mailfrom = $dcconf->{email_from} || "root";

    PVE::Tools::sendmail($mailto, $subject, $text, $html, $mailfrom, "vzdump backup tool");
};

sub new {
    my ($class, $cmdline, $opts, $skiplist) = @_;

    mkpath $logdir;

    check_bin ('cp');
    check_bin ('df');
    check_bin ('sendmail');
    check_bin ('rsync');
    check_bin ('tar');
    check_bin ('mount');
    check_bin ('umount');
    check_bin ('cstream');
    check_bin ('ionice');

    if ($opts->{mode} && $opts->{mode} eq 'snapshot') {
	check_bin ('lvcreate');
	check_bin ('lvs');
	check_bin ('lvremove');
    }

    my $defaults = read_vzdump_defaults();

    my $maxfiles = $opts->{maxfiles}; # save here, because we overwrite with default

    $opts->{remove} = 1 if !defined($opts->{remove});

    foreach my $k (keys %$defaults) {
	next if $k eq 'exclude-path'; # dealt with separately
	if ($k eq 'dumpdir' || $k eq 'storage') {
	    $opts->{$k} = $defaults->{$k} if !defined ($opts->{dumpdir}) &&
		!defined ($opts->{storage});
	} else {
	    $opts->{$k} = $defaults->{$k} if !defined ($opts->{$k});
	}
    }

    $opts->{dumpdir} =~ s|/+$|| if ($opts->{dumpdir});
    $opts->{tmpdir} =~ s|/+$|| if ($opts->{tmpdir});

    $skiplist = [] if !$skiplist;
    my $self = bless { cmdline => $cmdline, opts => $opts, skiplist => $skiplist };

    my $findexcl = $self->{findexcl} = [];
    if ($defaults->{'exclude-path'}) {
	push @$findexcl, @{$defaults->{'exclude-path'}};
    }

    if ($opts->{'exclude-path'}) {
	push @$findexcl, @{$opts->{'exclude-path'}};
    }

    if ($opts->{stdexcludes}) {
	push @$findexcl, '/tmp/?*',
	                 '/var/tmp/?*',
	                 '/var/run/?*.pid';
    }

    foreach my $p (@plugins) {

	my $pd = $p->new ($self);

	push @{$self->{plugins}}, $pd;
    }

    if (!$opts->{dumpdir} && !$opts->{storage}) {
	$opts->{storage} = 'local';
    }

    my $errors = '';

    if ($opts->{storage}) {
	my $info;
	eval {
	    $info = storage_info ($opts->{storage});
	};
	$errors .= "could not get storage information for '$opts->{storage}': $@"
	    if ($@);
	$opts->{dumpdir} = $info->{dumpdir};
	$maxfiles = $info->{maxfiles} if !defined($maxfiles) && defined($info->{maxfiles});
    } elsif ($opts->{dumpdir}) {
	$errors .= "dumpdir '$opts->{dumpdir}' does not exist"
	    if ! -d $opts->{dumpdir};
    } else {
	die "internal error"; 
    }

    if ($opts->{tmpdir} && ! -d $opts->{tmpdir}) {
	$errors .= "\n" if $errors;
	$errors .= "tmpdir '$opts->{tmpdir}' does not exist";
    }

    if ($errors) {
	eval { $self->sendmail([], 0, $errors); };
	debugmsg ('err', $@) if $@;
	die "$errors\n";
    }

    $opts->{maxfiles} = $maxfiles if defined($maxfiles);

    return $self;

}

sub get_mount_info {
    my ($dir) = @_;

    # Note: df 'available' can be negative, and percentage set to '-'

    my $cmd = [ 'df', '-P', '-T', '-B', '1', $dir];

    my $res;

    my $parser = sub {
	my $line = shift;
	if (my ($fsid, $fstype, undef, $mp) = $line =~
	    m!(\S+.*)\s+(\S+)\s+\d+\s+\-?\d+\s+\d+\s+(\d+%|-)\s+(/.*)$!) {
	    $res = {
		device => $fsid,
		fstype => $fstype,
		mountpoint => $mp,
	    };
	}
    };

    eval { PVE::Tools::run_command($cmd, errfunc => sub {}, outfunc => $parser); };
    warn $@ if $@;

    return $res;
}

sub getlock {
    my ($self, $upid) = @_;

    my $fh;
	    
    my $maxwait = $self->{opts}->{lockwait} || $self->{lockwait};
 
    die "missimg UPID" if !$upid; # should not happen

    if (!open (SERVER_FLCK, ">>$lockfile")) {
	debugmsg ('err', "can't open lock on file '$lockfile' - $!", undef, 1);
	die "can't open lock on file '$lockfile' - $!";
    }

    if (!flock (SERVER_FLCK, LOCK_EX|LOCK_NB)) {

	if (!$maxwait) {
	    debugmsg ('err', "can't aquire lock '$lockfile' (wait = 0)", undef, 1);
	    die "can't aquire lock '$lockfile' (wait = 0)";
	}

	debugmsg('info', "trying to get global lock - waiting...", undef, 1);

	eval {
	    alarm ($maxwait * 60);
	
	    local $SIG{ALRM} = sub { alarm (0); die "got timeout\n"; };

	    if (!flock (SERVER_FLCK, LOCK_EX)) {
		my $err = $!;
		close (SERVER_FLCK);
		alarm (0);
		die "$err\n";
	    }
	    alarm (0);
	};
	alarm (0);
    
	my $err = $@;
	
	if ($err) {
	    debugmsg ('err', "can't aquire lock '$lockfile' - $err", undef, 1);
	    die "can't aquire lock '$lockfile' - $err";
	}

	debugmsg('info', "got global lock", undef, 1);
    }

    PVE::Tools::file_set_contents($pidfile, $upid);
}

sub run_hook_script {
    my ($self, $phase, $task, $logfd) = @_;

    my $opts = $self->{opts};

    my $script = $opts->{script};

    return if !$script;

    my $cmd = "$script $phase";

    $cmd .= " $task->{mode} $task->{vmid}" if ($task);

    local %ENV;

    # set immutable opts directly (so they are available in all phases)
    $ENV{STOREID} = $opts->{storage} if $opts->{storage};
    $ENV{DUMPDIR} = $opts->{dumpdir} if $opts->{dumpdir};

    foreach my $ek (qw(vmtype hostname tarfile logfile)) {
	$ENV{uc($ek)} = $task->{$ek} if $task->{$ek};
    }

    run_command ($logfd, $cmd);
}

sub compressor_info {
    my ($opts) = @_;
    my $opt_compress = $opts->{compress};

    if (!$opt_compress || $opt_compress eq '0') {
	return undef;
    } elsif ($opt_compress eq '1' || $opt_compress eq 'lzo') {
	return ('lzop', 'lzo');
    } elsif ($opt_compress eq 'gzip') {
	if ($opts->{pigz} > 0) {
	    my $pigz_threads = $opts->{pigz};
	    if ($pigz_threads == 1) {
		my $cpuinfo = PVE::ProcFSTools::read_cpuinfo();
		$pigz_threads = int(($cpuinfo->{cpus} + 1)/2);
	    }
	    return ("pigz -p ${pigz_threads}", 'gz');
	} else {
	    return ('gzip', 'gz');
	}
    } else {
	die "internal error - unknown compression option '$opt_compress'";
    }
}

sub get_backup_file_list {
    my ($dir, $bkname, $exclude_fn) = @_;

    my $bklist = [];
    foreach my $fn (<$dir/${bkname}-*>) {
	next if $exclude_fn && $fn eq $exclude_fn;
	if ($fn =~ m!/(${bkname}-(\d{4})_(\d{2})_(\d{2})-(\d{2})_(\d{2})_(\d{2})\.(tgz|((tar|vma)(\.(gz|lzo))?)))$!) {
	    $fn = "$dir/$1"; # untaint
	    my $t = timelocal ($7, $6, $5, $4, $3 - 1, $2);
	    push @$bklist, [$fn, $t];
	}
    }

    return $bklist;
}
 
sub exec_backup_task {
    my ($self, $task) = @_;
	 
    my $opts = $self->{opts};

    my $vmid = $task->{vmid};
    my $plugin = $task->{plugin};

    my $vmstarttime = time ();
    
    my $logfd;

    my $cleanup = {};

    my $vmstoptime = 0;

    eval {
	die "unable to find VM '$vmid'\n" if !$plugin;

	# for now we deny backups of a running ha managed service in *stop* mode
	# as it interferes with the HA stack (started services should not stop).
	if ($opts->{mode} eq 'stop' &&
	    PVE::HA::Config::vm_is_ha_managed($vmid, 'started'))
	{
	    die "Cannot execute a backup with stop mode on a HA managed and".
		" enabled Service. Use snapshot mode or disable the Service.\n";
	}

	my $vmtype = $plugin->type();

	my $tmplog = "$logdir/$vmtype-$vmid.log";

	my $lt = localtime();

	my $bkname = "vzdump-$vmtype-$vmid";
	my $basename = sprintf "${bkname}-%04d_%02d_%02d-%02d_%02d_%02d", 
	$lt->year + 1900, $lt->mon + 1, $lt->mday, 
	$lt->hour, $lt->min, $lt->sec;

	my $maxfiles = $opts->{maxfiles};

	if ($maxfiles && !$opts->{remove}) {
	    my $bklist = get_backup_file_list($opts->{dumpdir}, $bkname);
	    die "only $maxfiles backup(s) allowed - please consider to remove old backup files.\n" 
		if scalar(@$bklist) >= $maxfiles;
	}

	my $logfile = $task->{logfile} = "$opts->{dumpdir}/$basename.log";

	my $ext = $vmtype eq 'qemu' ? '.vma' : '.tar';
	my ($comp, $comp_ext) = compressor_info($opts);
	if ($comp && $comp_ext) {
	    $ext .= ".${comp_ext}";
	}

	if ($opts->{stdout}) {
	    $task->{tarfile} = '-';
	} else {
	    my $tarfile = $task->{tarfile} = "$opts->{dumpdir}/$basename$ext";
	    $task->{tmptar} = $task->{tarfile};
	    $task->{tmptar} =~ s/\.[^\.]+$/\.dat/;
	    unlink $task->{tmptar};
	}

	$task->{vmtype} = $vmtype;

	if ($opts->{tmpdir}) {
	    $task->{tmpdir} = "$opts->{tmpdir}/vzdumptmp$$"; 
	} else {
	    # dumpdir is posix? then use it as temporary dir
	    my $info = get_mount_info($opts->{dumpdir});
	    if ($vmtype eq 'qemu' || 
		grep ($_ eq $info->{fstype}, @posix_filesystems)) {
		$task->{tmpdir} = "$opts->{dumpdir}/$basename.tmp";
	    } else {
		$task->{tmpdir} = "/var/tmp/vzdumptmp$$";
		debugmsg ('info', "filesystem type on dumpdir is '$info->{fstype}' -" .
			  "using $task->{tmpdir} for temporary files", $logfd);
	    }
	}

	rmtree $task->{tmpdir};
	mkdir $task->{tmpdir};
	-d $task->{tmpdir} ||
	    die "unable to create temporary directory '$task->{tmpdir}'";

	$logfd = IO::File->new (">$tmplog") ||
	    die "unable to create log file '$tmplog'";

	$task->{dumpdir} = $opts->{dumpdir};
	$task->{storeid} = $opts->{storage};
	$task->{tmplog} = $tmplog;

	unlink $logfile;

	debugmsg ('info',  "Starting Backup of VM $vmid ($vmtype)", $logfd, 1);

	$plugin->set_logfd ($logfd);

	# test is VM is running
	my ($running, $status_text) = $plugin->vm_status ($vmid);

	debugmsg ('info', "status = ${status_text}", $logfd);

	# lock VM (prevent config changes)
	$plugin->lock_vm ($vmid);

	$cleanup->{unlock} = 1;

	# prepare

	my $mode = $running ? $task->{mode} : 'stop';

	if ($mode eq 'snapshot') {
	    my %saved_task = %$task;
	    eval { $plugin->prepare ($task, $vmid, $mode); };
	    if (my $err = $@) {
		die $err if $err !~ m/^mode failure/;
		debugmsg ('info',  $err, $logfd);
		debugmsg ('info',  "trying 'suspend' mode instead", $logfd);
		$mode = 'suspend'; # so prepare is called again below
		%$task = %saved_task; 
	    }
	}

	$cleanup->{prepared} = 1;

	$task->{mode} = $mode;

   	debugmsg ('info', "backup mode: $mode", $logfd);

	debugmsg ('info', "bandwidth limit: $opts->{bwlimit} KB/s", $logfd)
	    if $opts->{bwlimit};

	debugmsg ('info', "ionice priority: $opts->{ionice}", $logfd);

	if ($mode eq 'stop') {

	    $plugin->prepare ($task, $vmid, $mode);

	    $self->run_hook_script ('backup-start', $task, $logfd);

	    if ($running) {
		debugmsg ('info', "stopping vm", $logfd);
		$vmstoptime = time ();
		$self->run_hook_script ('pre-stop', $task, $logfd);
		$plugin->stop_vm ($task, $vmid);
		$cleanup->{restart} = 1;
	    }
 

	} elsif ($mode eq 'suspend') {

	    $plugin->prepare ($task, $vmid, $mode);

	    $self->run_hook_script ('backup-start', $task, $logfd);

	    if ($vmtype eq 'lxc') {
		# pre-suspend rsync
		$plugin->copy_data_phase1($task, $vmid);
	    }

	    debugmsg ('info', "suspend vm", $logfd);
	    $vmstoptime = time ();
	    $self->run_hook_script ('pre-stop', $task, $logfd);
	    $plugin->suspend_vm ($task, $vmid);
	    $cleanup->{resume} = 1;

	    if ($vmtype eq 'lxc') {
		# post-suspend rsync
		$plugin->copy_data_phase2($task, $vmid);

		debugmsg ('info', "resume vm", $logfd);
		$cleanup->{resume} = 0;
		$self->run_hook_script('pre-restart', $task, $logfd);
		$plugin->resume_vm($task, $vmid);
		$self->run_hook_script('post-restart', $task, $logfd);
		my $delay = time () - $vmstoptime;
		debugmsg('info', "vm is online again after $delay seconds", $logfd);
	    }
	    
	} elsif ($mode eq 'snapshot') {

	    $self->run_hook_script ('backup-start', $task, $logfd);

	    my $snapshot_count = $task->{snapshot_count} || 0;

	    $self->run_hook_script ('pre-stop', $task, $logfd);

	    if ($snapshot_count > 1) {
		debugmsg ('info', "suspend vm to make snapshot", $logfd);
		$vmstoptime = time ();
		$plugin->suspend_vm ($task, $vmid);
		$cleanup->{resume} = 1;
	    }

	    $plugin->snapshot ($task, $vmid);

	    $self->run_hook_script ('pre-restart', $task, $logfd);

	    if ($snapshot_count > 1) {
		debugmsg ('info', "resume vm", $logfd);
		$cleanup->{resume} = 0;
		$plugin->resume_vm ($task, $vmid);
		my $delay = time () - $vmstoptime;
		debugmsg ('info', "vm is online again after $delay seconds", $logfd);
	    }

	    $self->run_hook_script ('post-restart', $task, $logfd);

	} else {
	    die "internal error - unknown mode '$mode'\n";
	}

	# assemble archive image
	$plugin->assemble ($task, $vmid);
	
	# produce archive 

	if ($opts->{stdout}) {
	    debugmsg ('info', "sending archive to stdout", $logfd);
	    $plugin->archive($task, $vmid, $task->{tmptar}, $comp);
	    $self->run_hook_script ('backup-end', $task, $logfd);
	    return;
	}

	debugmsg ('info', "creating archive '$task->{tarfile}'", $logfd);
	$plugin->archive($task, $vmid, $task->{tmptar}, $comp);

	rename ($task->{tmptar}, $task->{tarfile}) ||
	    die "unable to rename '$task->{tmptar}' to '$task->{tarfile}'\n";

	# determine size
	$task->{size} = (-s $task->{tarfile}) || 0;
	my $cs = format_size ($task->{size}); 
	debugmsg ('info', "archive file size: $cs", $logfd);

	# purge older backup

	if ($maxfiles && $opts->{remove}) {
	    my $bklist = get_backup_file_list($opts->{dumpdir}, $bkname, $task->{tarfile});
	    $bklist = [ sort { $b->[1] <=> $a->[1] } @$bklist ];

	    while (scalar (@$bklist) >= $maxfiles) {
		my $d = pop @$bklist;
		debugmsg ('info', "delete old backup '$d->[0]'", $logfd);
		unlink $d->[0];
		my $logfn = $d->[0];
		$logfn =~ s/\.(tgz|((tar|vma)(\.(gz|lzo))?))$/\.log/;
		unlink $logfn;
	    }
	}

	$self->run_hook_script ('backup-end', $task, $logfd);
    };
    my $err = $@;

    if ($plugin) {
	# clean-up

	if ($cleanup->{unlock}) {
	    eval { $plugin->unlock_vm ($vmid); };
	    warn $@ if $@;
	}

	if ($cleanup->{prepared}) {
	    # only call cleanup when necessary (when prepare was executed)
	    eval { $plugin->cleanup ($task, $vmid) };
	    warn $@ if $@;
	}

	eval { $plugin->set_logfd (undef); };
	warn $@ if $@;

	if ($cleanup->{resume} || $cleanup->{restart}) {	
	    eval { 
		$self->run_hook_script ('pre-restart', $task, $logfd);
		if ($cleanup->{resume}) {
		    debugmsg ('info', "resume vm", $logfd);
		    $plugin->resume_vm ($task, $vmid);
		} else {
		    my $running = $plugin->vm_status($vmid);
		    if (!$running) {
			debugmsg ('info', "restarting vm", $logfd);
			$plugin->start_vm ($task, $vmid);
		    }
		}
		$self->run_hook_script ('post-restart', $task, $logfd);
	    };
	    my $err = $@;
	    if ($err) {
		warn $err;
	    } else {
		my $delay = time () - $vmstoptime;
		debugmsg ('info', "vm is online again after $delay seconds", $logfd);
	    }
	}
    }

    eval { unlink $task->{tmptar} if $task->{tmptar} && -f $task->{tmptar}; };
    warn $@ if $@;

    eval { rmtree $task->{tmpdir} if $task->{tmpdir} && -d $task->{tmpdir}; };
    warn $@ if $@;

    my $delay = $task->{backuptime} = time () - $vmstarttime;

    if ($err) {
	$task->{state} = 'err';
	$task->{msg} = $err;
	debugmsg ('err', "Backup of VM $vmid failed - $err", $logfd, 1);

	eval { $self->run_hook_script ('backup-abort', $task, $logfd); };

    } else {
	$task->{state} = 'ok';
	my $tstr = format_time ($delay);
	debugmsg ('info', "Finished Backup of VM $vmid ($tstr)", $logfd, 1);
    }

    close ($logfd) if $logfd;
    
    if ($task->{tmplog} && $task->{logfile}) {
	system {'cp'} 'cp', $task->{tmplog}, $task->{logfile};
    }

    eval { $self->run_hook_script ('log-end', $task); };

    die $err if $err && $err =~ m/^interrupted by signal$/;
}

sub exec_backup {
    my ($self, $rpcenv, $authuser) = @_;

    my $opts = $self->{opts};

    debugmsg ('info', "starting new backup job: $self->{cmdline}", undef, 1);
    debugmsg ('info', "skip external VMs: " . join(', ', @{$self->{skiplist}}))
	if scalar(@{$self->{skiplist}});
 
    my $tasklist = [];

    if ($opts->{all}) {
	foreach my $plugin (@{$self->{plugins}}) {
	    my $vmlist = $plugin->vmlist();
	    foreach my $vmid (sort @$vmlist) {
		next if grep { $_ eq  $vmid } @{$opts->{exclude}};
		next if !$rpcenv->check($authuser, "/vms/$vmid", [ 'VM.Backup' ], 1);
	        push @$tasklist, { vmid => $vmid,  state => 'todo', plugin => $plugin, mode => $opts->{mode} };
	    }
	}
    } else {
	foreach my $vmid (sort @{$opts->{vmids}}) {
	    my $plugin;
	    foreach my $pg (@{$self->{plugins}}) {
		my $vmlist = $pg->vmlist();
		if (grep { $_ eq  $vmid } @$vmlist) {
		    $plugin = $pg;
		    last;
		}
	    }
	    $rpcenv->check($authuser, "/vms/$vmid", [ 'VM.Backup' ]);
	    push @$tasklist, { vmid => $vmid,  state => 'todo', plugin => $plugin, mode => $opts->{mode} };
	}
    }

    # Use in-memory files for the outer hook logs to pass them to sendmail.
    my $job_start_log = '';
    my $job_end_log = '';
    open my $job_start_fd, '>', \$job_start_log;
    open my $job_end_fd, '>', \$job_end_log;

    my $starttime = time();
    my $errcount = 0;
    eval {

	$self->run_hook_script ('job-start', undef, $job_start_fd);

	foreach my $task (@$tasklist) {
	    $self->exec_backup_task ($task);
	    $errcount += 1 if $task->{state} ne 'ok';
	}

	$self->run_hook_script ('job-end', undef, $job_end_fd);
    };
    my $err = $@;

    $self->run_hook_script ('job-abort', undef, $job_end_fd) if $err;

    if ($err) {
	debugmsg ('err', "Backup job failed - $err", undef, 1);
    } else {
	if ($errcount) {
	    debugmsg ('info', "Backup job finished with errors", undef, 1);
	} else {
	    debugmsg ('info', "Backup job finished successfully", undef, 1);
	}
    }

    close $job_start_fd;
    close $job_end_fd;

    my $totaltime = time() - $starttime;

    eval { $self->sendmail ($tasklist, $totaltime, undef, $job_start_log, $job_end_log); };
    debugmsg ('err', $@) if $@;

    die $err if $err;

    die "job errors\n" if $errcount; 

    unlink $pidfile;
}


sub option_exists {
    my $key = shift;
    return defined($confdesc->{$key});
}

# add JSON properties for create and set function
sub json_config_properties {
    my $prop = shift;

    foreach my $opt (keys %$confdesc) {
	$prop->{$opt} = $confdesc->{$opt};
    }

    return $prop;
}

sub verify_vzdump_parameters {
    my ($param, $check_missing) = @_;

    raise_param_exc({ all => "option conflicts with option 'vmid'"})
	if $param->{all} && $param->{vmid};

    raise_param_exc({ exclude => "option conflicts with option 'vmid'"})
	if $param->{exclude} && $param->{vmid};

    $param->{all} = 1 if defined($param->{exclude});

    warn "option 'size' is deprecated and will be removed in a future " .
	 "release, please update your script/configuration!\n"
	if defined($param->{size});

    return if !$check_missing;

    raise_param_exc({ vmid => "property is missing"})
	if !($param->{all} || $param->{stop}) && !$param->{vmid};

}

sub stop_running_backups {
    my($self) = @_;

    my $upid = PVE::Tools::file_read_firstline($pidfile);
    return if !$upid;

    my $task = PVE::Tools::upid_decode($upid);

    if (PVE::ProcFSTools::check_process_running($task->{pid}, $task->{pstart}) && 
	PVE::ProcFSTools::read_proc_starttime($task->{pid}) == $task->{pstart}) {
	kill(15, $task->{pid});
	# wait max 15 seconds to shut down (else, do nothing for now)
	my $i;
	for ($i = 15; $i > 0; $i--) {
	    last if !PVE::ProcFSTools::check_process_running(($task->{pid}, $task->{pstart}));
	    sleep (1);
	}
	die "stoping backup process $task->{pid} failed\n" if $i == 0;
    }
}

sub command_line {
    my ($param) = @_;

    my $cmd = "vzdump";

    if ($param->{vmid}) {
	$cmd .= " " . join(' ', PVE::Tools::split_list($param->{vmid}));
    }

    foreach my $p (keys %$param) {
	next if $p eq 'id' || $p eq 'vmid' || $p eq 'starttime' ||
	        $p eq 'dow' || $p eq 'stdout' || $p eq 'enabled';
	my $v = $param->{$p};
	my $pd = $confdesc->{$p} || die "no such vzdump option '$p'\n";
	if ($p eq 'exclude-path') {
	    foreach my $path (split(/\0/, $v || '')) {
		$cmd .= " --$p " . PVE::Tools::shellquote($path);
	    }
	} else {
	    $cmd .= " --$p " . PVE::Tools::shellquote($v) if defined($v) && $v ne '';
	}
    }

    return $cmd;
}

# bash completion helpers
sub complete_backup_storage {

    my $cfg = PVE::Storage::config();
    my $ids = $cfg->{ids};

    my $nodename = PVE::INotify::nodename();

    my $res = [];
    foreach my $sid (keys %$ids) {
	my $scfg = $ids->{$sid};
	next if !PVE::Storage::storage_check_enabled($cfg, $sid, $nodename, 1);
	next if !$scfg->{content}->{backup};
	push @$res, $sid;
    }

    return $res;
}

1;
