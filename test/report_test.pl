#!/usr/bin/perl

use v5.36;

use lib ('.', '..');

use Test::MockModule;
use Test::More;

use PVE::Report;
use PVE::Storage;

# No built-in storage plugin keeps a secret in storage.cfg, so mark one for this test.
PVE::Storage::Plugin->get_property_schema('cifs', 'username')->{sensitive} = 1;

my $files = {
    '/etc/pve/qemu-server/100.conf' => <<~'EOF',
        #cipassword: in the description stays
        cipassword: Plain$Windows!
        ciuser: admin
        ostype: win11
        broken line without colon

        [snap1]
        cipassword: $5$older$hash
        [PENDING]
        cipassword: $5$pending$hash
        [special:cloudinit]
        cipassword: $5$applied$hash
        EOF
    '/etc/pve/sdn/ipams.cfg' => <<~"EOF",
        netbox: nb
        \turl https://netbox.example.com/api
        \ttoken 0123456789abcdef

        phpipam: php
        \turl https://ipam.example.com/api/pve
        \ttoken fedcba9876543210
        \tsection 1
        EOF
    '/etc/pve/sdn/dns.cfg' => <<~"EOF",
        powerdns: pdns
        \turl http://pdns.example.com:8081/api/v1/servers/localhost
        \tkey s3cretapikey
        EOF
    '/etc/pve/sdn/zones.cfg' => "simple: z1\n\tipam pve\n",
    '/etc/pve/storage.cfg' => <<~"EOF",
        dir: local
        \tpath /var/lib/vz
        \tcontent iso,vztmpl,backup

        cifs: share
        \tserver 192.0.2.10
        \tusername flaggeduser
        \tcontent backup
        EOF
};

my $tools_mock = Test::MockModule->new('PVE::Tools');
$tools_mock->redefine(
    dir_glob_foreach => sub($dir, $regex, $func) {
        for my $path (sort keys $files->%*) {
            my ($file_dir, $file) = $path =~ m!^(.*/)([^/]+)$!;
            $func->($file) if $file_dir eq $dir && $file =~ m/^$regex$/;
        }
    },
    file_get_contents => sub($path, @) {
        return $files->{$path} // die "unable to open file '$path'\n";
    },
    run_command => sub { },
);

my $report = do {
    open(my $stderr, '>&', \*STDERR) or die "unable to dup STDERR - $!\n";
    open(STDERR, '>', '/dev/null') or die "unable to redirect STDERR - $!\n";
    my $res = PVE::Report::generate();
    open(STDERR, '>&', $stderr) or die "unable to restore STDERR - $!\n";
    $res;
};

unlike($report, qr/Windows!|older|pending\$hash|applied/, 'no cloud-init password');
unlike($report, qr/0123456789abcdef|fedcba9876543210|s3cretapikey/, 'no SDN token or key');
unlike($report, qr/flaggeduser/, 'no sensitive storage value');

like($report, qr/^cipassword: <redacted>$/m, 'cloud-init password key kept');
like($report, qr/^\ttoken <redacted>$/m, 'SDN token key kept');
like($report, qr/^\tusername <redacted>$/m, 'storage key kept');
like($report, qr/^#cipassword: in the description stays$/m, 'description kept');
like($report, qr/^broken line without colon$/m, 'invalid line kept');
like($report, qr/^\tsection 1$/m, 'other SDN values kept');
like($report, qr/^\tipam pve$/m, 'other SDN configs kept');
like($report, qr/^\tpath \/var\/lib\/vz$/m, 'other storage values kept');

my $credential_tests = [
    [
        'APT source with credentials',
        'deb https://user:s3cr:et@deb.example.com/debian trixie main',
        'deb https://user:<redacted>@deb.example.com/debian trixie main',
    ],
    [
        'URL with an unencoded @ in the password',
        'http_proxy: http://user:p@ss@proxy.example.com:3128/',
        'http_proxy: http://user:<redacted>@proxy.example.com:3128/',
    ],
    [
        'URL with an @ in the user name',
        'http_proxy: http://user@corp.example:s3cret@proxy.example.com:3128/',
        'http_proxy: http://user@corp.example:<redacted>@proxy.example.com:3128/',
    ],
    [
        'proxy URL with port and without credentials',
        'http_proxy: http://proxy.example.com:3128/',
        'http_proxy: http://proxy.example.com:3128/',
    ],
    [
        'URL with user only',
        'URIs: https://user@deb.example.com/debian',
        'URIs: https://user@deb.example.com/debian',
    ],
    [
        'URL with user and port only',
        'ssh://root@host.example:22/srv',
        'ssh://root@host.example:22/srv',
    ],
    [
        'CIFS mount options',
        '//srv/share /mnt cifs username=foo,password=bar,uid=0 0 0',
        '//srv/share /mnt cifs username=foo,password=<redacted>,uid=0 0 0',
    ],
    [
        'CIFS password with an escaped comma',
        'username=foo,password=a,,b,password2=new,uid=0',
        'username=foo,password=<redacted>,password2=<redacted>,uid=0',
    ],
    [
        'Ceph mount options',
        'mon1:/ /mnt ceph name=admin,secret=AQB+abc==,secretfile=/etc/ceph/s 0 0',
        'mon1:/ /mnt ceph name=admin,secret=<redacted>,secretfile=/etc/ceph/s 0 0',
    ],
    [
        'command line options',
        'tool --pass=hunter2 --bypass=1 --db-password=x --api_key=y passthrough=on',
        'tool --pass=<redacted> --bypass=1 --db-password=<redacted> --api_key=<redacted> passthrough=on',
    ],
    [
        'container environment',
        "lxc.environment.runtime: ADMIN_TOKEN=\$argon2id\$v=19\$m=65540,t=3,p=4\$c2FsdA\$aGFzaA\n"
            . "lxc.environment.runtime: DB_PASSWORD=correct horse\n"
            . "lxc.environment.runtime: TZ=Europe/Vienna\n",
        "lxc.environment.runtime: ADMIN_TOKEN=<redacted>\n"
            . "lxc.environment.runtime: DB_PASSWORD=<redacted>\n"
            . "lxc.environment.runtime: TZ=Europe/Vienna\n",
    ],
    [
        'container environment in the env property',
        "env: DB_PASSWORD=correct horse\n",
        "env: DB_PASSWORD=<redacted>\n",
    ],
];

for my $test ($credential_tests->@*) {
    my ($name, $in, $out) = $test->@*;
    is(PVE::Report::redact_credentials($in), $out, $name);
}

done_testing();
