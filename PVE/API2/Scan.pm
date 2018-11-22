package PVE::API2::Scan;

use strict;
use warnings;

use PVE::SafeSyslog;
use PVE::Storage;
use PVE::Storage::LVMPlugin;
use PVE::SysFSTools;
use PVE::JSONSchema qw(get_standard_option);

use PVE::RESTHandler;

use base qw(PVE::RESTHandler);

__PACKAGE__->register_method ({
    name => 'index',
    path => '',
    method => 'GET',
    description => "Index of available scan methods",
    permissions => {
	user => 'all',
    },
    parameters => {
    	additionalProperties => 0,
	properties => {
	    node => get_standard_option('pve-node'),
	},
    },
    returns => {
	type => 'array',
	items => {
	    type => "object",
	    properties => { method => { type => 'string'} },
	},
	links => [ { rel => 'child', href => "{method}" } ],
    },
    code => sub {
	my ($param) = @_;

	my $res = [
	    { method => 'lvm' },
	    { method => 'iscsi' },
	    { method => 'nfs' },
	    { method => 'glusterfs' },
	    { method => 'usb' },
	    { method => 'zfs' },
	    { method => 'cifs' },
	    { method => 'pci' },
	    ];

	return $res;
    }});

__PACKAGE__->register_method ({
    name => 'zfsscan',
    path => 'zfs',
    method => 'GET',
    description => "Scan zfs pool list on local node.",
    protected => 1,
    proxyto => "node",
    permissions => {
	check => ['perm', '/storage', ['Datastore.Allocate']],
    },
    parameters => {
    	additionalProperties => 0,
	properties => {
	    node => get_standard_option('pve-node'),
	},
    },
    returns => {
	type => 'array',
	items => {
	    type => "object",
	    properties => {
		pool => {
		    description => "ZFS pool name.",
		    type => 'string',
		},
	    },
	},
    },
    code => sub {
	my ($param) = @_;

	return PVE::Storage::scan_zfs();
    }});

__PACKAGE__->register_method ({
    name => 'nfsscan',
    path => 'nfs',
    method => 'GET',
    description => "Scan remote NFS server.",
    protected => 1,
    proxyto => "node",
    permissions => {
	check => ['perm', '/storage', ['Datastore.Allocate']],
    },
    parameters => {
    	additionalProperties => 0,
	properties => {
	    node => get_standard_option('pve-node'),
	    server => {
		description => "The server address (name or IP).",
		type => 'string', format => 'pve-storage-server',
	    },
	},
    },
    returns => {
	type => 'array',
	items => {
	    type => "object",
	    properties => {
		path => {
		    description => "The exported path.",
		    type => 'string',
		},
		options => {
		    description => "NFS export options.",
		    type => 'string',
		},
	    },
	},
    },
    code => sub {
	my ($param) = @_;

	my $server = $param->{server};
	my $res = PVE::Storage::scan_nfs($server);

	my $data = [];
	foreach my $k (keys %$res) {
	    push @$data, { path => $k, options => $res->{$k} };
	}
	return $data;
    }});

__PACKAGE__->register_method ({
    name => 'cifsscan',
    path => 'cifs',
    method => 'GET',
    description => "Scan remote CIFS server.",
    protected => 1,
    proxyto => "node",
    permissions => {
	check => ['perm', '/storage', ['Datastore.Allocate']],
    },
    parameters => {
	additionalProperties => 0,
	properties => {
	    node => get_standard_option('pve-node'),
	    server => {
		description => "The server address (name or IP).",
		type => 'string', format => 'pve-storage-server',
	    },
	    username => {
		description => "User name.",
		type => 'string',
		optional => 1,
	    },
	    password => {
		description => "User password.",
		type => 'string',
		optional => 1,
	    },
	    domain => {
		description => "SMB domain (Workgroup).",
		type => 'string',
		optional => 1,
	    },
	},
    },
    returns => {
	type => 'array',
	items => {
	    type => "object",
	    properties => {
		share => {
		    description => "The cifs share name.",
		    type => 'string',
		},
		description => {
		    description => "Descriptive text from server.",
		    type => 'string',
		},
	    },
	},
    },
    code => sub {
	my ($param) = @_;

	my $server = $param->{server};

	my $username = $param->{username};
	my $password = $param->{password};
	my $domain = $param->{domain};

	my $res = PVE::Storage::scan_cifs($server, $username, $password, $domain);

	my $data = [];
	foreach my $k (keys %$res) {
	    next if $k =~ m/NT_STATUS_/;
	    push @$data, { share => $k, description => $res->{$k} };
	}

	return $data;
    }});

# Note: GlusterFS currently does not have an equivalent of showmount.
# As workaround, we simply use nfs showmount.
# see http://www.gluster.org/category/volumes/

__PACKAGE__->register_method ({
    name => 'glusterfsscan',
    path => 'glusterfs',
    method => 'GET',
    description => "Scan remote GlusterFS server.",
    protected => 1,
    proxyto => "node",
    permissions => {
	check => ['perm', '/storage', ['Datastore.Allocate']],
    },
    parameters => {
    	additionalProperties => 0,
	properties => {
	    node => get_standard_option('pve-node'),
	    server => {
		description => "The server address (name or IP).",
		type => 'string', format => 'pve-storage-server',
	    },
	},
    },
    returns => {
	type => 'array',
	items => {
	    type => "object",
	    properties => {
		volname => {
		    description => "The volume name.",
		    type => 'string',
		},
	    },
	},
    },
    code => sub {
	my ($param) = @_;

	my $server = $param->{server};
	my $res = PVE::Storage::scan_nfs($server);

	my $data = [];
	foreach my $path (keys %$res) {
	    if ($path =~ m!^/([^\s/]+)$!) {
		push @$data, { volname => $1 };
	    }
	}
	return $data;
    }});

__PACKAGE__->register_method ({
    name => 'iscsiscan',
    path => 'iscsi',
    method => 'GET',
    description => "Scan remote iSCSI server.",
    protected => 1,
    proxyto => "node",
    permissions => {
	check => ['perm', '/storage', ['Datastore.Allocate']],
    },
    parameters => {
    	additionalProperties => 0,
	properties => {
	    node => get_standard_option('pve-node'),
	    portal => {
		description => "The iSCSI portal (IP or DNS name with optional port).",
		type => 'string', format => 'pve-storage-portal-dns',
	    },
	},
    },
    returns => {
	type => 'array',
	items => {
	    type => "object",
	    properties => {
		target => {
		    description => "The iSCSI target name.",
		    type => 'string',
		},
		portal => {
		    description => "The iSCSI portal name.",
		    type => 'string',
		},
	    },
	},
    },
    code => sub {
	my ($param) = @_;

	my $res = PVE::Storage::scan_iscsi($param->{portal});

	my $data = [];
	foreach my $k (keys %$res) {
	    push @$data, { target => $k, portal => join(',', @{$res->{$k}}) };
	}

	return $data;
    }});

__PACKAGE__->register_method ({
    name => 'lvmscan',
    path => 'lvm',
    method => 'GET',
    description => "List local LVM volume groups.",
    protected => 1,
    proxyto => "node",
    permissions => {
	check => ['perm', '/storage', ['Datastore.Allocate']],
    },
    parameters => {
    	additionalProperties => 0,
	properties => {
	    node => get_standard_option('pve-node'),
	},
    },
    returns => {
	type => 'array',
	items => {
	    type => "object",
	    properties => {
		vg => {
		    description => "The LVM logical volume group name.",
		    type => 'string',
		},
	    },
	},
    },
    code => sub {
	my ($param) = @_;

	my $res = PVE::Storage::LVMPlugin::lvm_vgs();
	return PVE::RESTHandler::hash_to_array($res, 'vg');
    }});

__PACKAGE__->register_method ({
    name => 'lvmthinscan',
    path => 'lvmthin',
    method => 'GET',
    description => "List local LVM Thin Pools.",
    protected => 1,
    proxyto => "node",
    permissions => {
	check => ['perm', '/storage', ['Datastore.Allocate']],
    },
    parameters => {
	additionalProperties => 0,
	properties => {
	    node => get_standard_option('pve-node'),
	    vg => {
		type => 'string',
		pattern => '[a-zA-Z0-9\.\+\_][a-zA-Z0-9\.\+\_\-]+', # see lvm(8) manpage
		maxLength => 100,
	    },
	},
    },
    returns => {
	type => 'array',
	items => {
	    type => "object",
	    properties => {
		lv => {
		    description => "The LVM Thin Pool name (LVM logical volume).",
		    type => 'string',
		},
	    },
	},
    },
    code => sub {
	my ($param) = @_;

	return PVE::Storage::LvmThinPlugin::list_thinpools($param->{vg});
    }});

__PACKAGE__->register_method ({
    name => 'usbscan',
    path => 'usb',
    method => 'GET',
    description => "List local USB devices.",
    protected => 1,
    proxyto => "node",
    permissions => {
	check => ['perm', '/', ['Sys.Modify']],
    },
    parameters => {
    	additionalProperties => 0,
	properties => {
	    node => get_standard_option('pve-node'),
	},
    },
    returns => {
	type => 'array',
	items => {
	    type => "object",
	    properties => {
		busnum => { type => 'integer'},
		devnum => { type => 'integer'},
		port => { type => 'integer'},
		usbpath => { type => 'string', optional => 1},
		level => { type => 'integer'},
		class => { type => 'integer'},
		vendid => { type => 'string'},
		prodid => { type => 'string'},
		speed => { type => 'string'},

		product => { type => 'string', optional => 1 },
		serial => { type => 'string', optional => 1 },
		manufacturer => { type => 'string', optional => 1 },
	    },
	},
    },
    code => sub {
	my ($param) = @_;

	return PVE::SysFSTools::scan_usb();
    }});

my $default_class_blacklist = "05;06;08;0b";

__PACKAGE__->register_method ({
    name => 'pciscan',
    path => 'pci',
    method => 'GET',
    description => "List local PCI devices.",
    protected => 1,
    proxyto => "node",
    permissions => {
	check => ['perm', '/', ['Sys.Modify']],
    },
    parameters => {
	additionalProperties => 0,
	properties => {
	    node => get_standard_option('pve-node'),
	    'pci-class-blacklist' => {
		type => 'string',
		format => 'string-list',
		default => $default_class_blacklist,
		optional => 1,
		description => "A list of blacklisted PCI classes, which will ".
			       "not be returned. Following are filtered by ".
			       "default: Memory Controller (05), Bridge (06), ".
			       "Generic System Peripheral (08) and ".
			       "Processor (0b).",
	    },
	    verbose => {
		type => 'boolean',
		default => 1,
		optional => 1,
		description => "If disabled, does only print the PCI IDs. "
			      ."Otherwise, additional information like vendor "
			      ."and device will be returned.",
	    },
	},
    },
    returns => {
	type => 'array',
	items => {
	    type => "object",
	    properties => {
		id => {
		    type => 'string',
		    description => "The PCI ID.",
		},
		class => {
		    type => 'string',
		    description => 'The PCI Class of the device.',
		},
		vendor => {
		    type => 'string',
		    description => 'The Vendor ID.',
		},
		vendor_name => {
		    type => 'string',
		    optional => 1,
		},
		device => {
		    type => 'string',
		    description => 'The Device ID.',
		},
		device_name => {
		    type => 'string',
		    optional => 1,
		},
		subsystem_vendor => {
		    type => 'string',
		    description => 'The Subsystem Vendor ID.',
		    optional => 1,
		},
		subsystem_vendor_name => {
		    type => 'string',
		    optional => 1,
		},
		subsystem_device => {
		    type => 'string',
		    description => 'The Subsystem Device ID.',
		    optional => 1,
		},
		subsystem_device_name => {
		    type => 'string',
		    optional => 1,
		},
		iommugroup => {
		    type => 'integer',
		    description => "The IOMMU group in which the device is in.".
				   " If no IOMMU group is detected, it is set to -1.",
		},
		mdev => {
		    type => 'boolean',
		    optional => 1,
		    description => "If set, marks that the device is capable "
				  ."of creating mediated devices.",
		}
	    },
	},
    },
    code => sub {
	my ($param) = @_;

	my $blacklist = $param->{'pci-class-blacklist'} // $default_class_blacklist;
	my $class_regex = join('|', PVE::Tools::split_list($blacklist));

	my $filter;

	if ($class_regex ne '') {
	    $filter =  sub {
		my ($pcidevice) = @_;

		if ($pcidevice->{class} =~ m/^0x(?:$class_regex)/) {
		    return 0;
		}

		return 1;
	    };
	}

	my $verbose = $param->{verbose} // 1;

	return PVE::SysFSTools::lspci($filter, $verbose);
    }});

1;
