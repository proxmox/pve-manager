package PVE::API2::Pool;

use strict;
use warnings;

use PVE::AccessControl;
use PVE::Cluster qw (cfs_read_file cfs_write_file);
use PVE::Exception qw(raise_param_exc);
use PVE::INotify;
use PVE::JSONSchema;
use PVE::Network::SDN;
use PVE::Network::SDN::Vnets;
use PVE::Network::SDN::Zones;
use PVE::Storage;
use PVE::Tools;

use PVE::SafeSyslog;

use PVE::API2Tools;
use PVE::RESTHandler;

use base qw(PVE::RESTHandler);

use constant NETWORK_VNET_REGEX => qr!^vnet/([^/]+)/([^/]+)(?:/([1-9][0-9]{0,3}|\*))?\z!;

sub pve_verify_pool_network {
    my ($value, $noerr) = @_;

    if ($value !~ NETWORK_VNET_REGEX) {
        return undef if $noerr;
        die "'$value' is not a valid network resource, expected 'vnet/<zone>/<vnet>[/<tag>|/*]'\n";
    }
    my ($zone, $vnet, $tag) = ($1, $2, $3);

    eval {
        PVE::JSONSchema::check_format('pve-sdn-zone-id', $zone);
        PVE::JSONSchema::check_format('pve-sdn-vnet-id', $vnet);

        if (defined($tag) && $tag ne '*' && $tag > 4094) {
            die "VLAN tag '$tag' out of range (1-4094)\n";
        }
    };

    if (my $err = $@) {
        return undef if $noerr;
        die $err;
    }

    return $value;
}

PVE::JSONSchema::register_format('pve-pool-network', \&pve_verify_pool_network);

__PACKAGE__->register_method({
    name => 'index',
    path => '',
    method => 'GET',
    description => "List pools or get pool configuration.",
    permissions => {
        description =>
            "List all pools where you have Pool.Audit permissions on /pool/<pool>, or the pool specific with {poolid}",
        user => 'all',
    },
    parameters => {
        additionalProperties => 0,
        properties => {
            poolid => {
                type => 'string',
                format => 'pve-poolid',
                optional => 1,
            },
            type => {
                type => 'string',
                enum => ['qemu', 'lxc', 'storage', 'network'],
                optional => 1,
                requires => 'poolid',
            },
        },
    },
    returns => {
        type => 'array',
        items => {
            type => "object",
            properties => {
                poolid => { type => 'string' },
                comment => {
                    type => 'string',
                    optional => 1,
                },
                members => {
                    type => 'array',
                    optional => 1,
                    items => {
                        type => "object",
                        additionalProperties => 1,
                        properties => {
                            type => {
                                type => 'string',
                                enum => ['qemu', 'lxc', 'openvz', 'storage', 'network'],
                            },
                            id => {
                                type => 'string',
                            },
                            node => {
                                type => 'string',
                                optional => 1,
                            },
                            vmid => {
                                type => 'integer',
                                optional => 1,
                            },
                            storage => {
                                type => 'string',
                                optional => 1,
                            },
                            'network-type' => {
                                type => 'string',
                                enum => ['vnet'],
                                optional => 1,
                                description =>
                                    'Type of the network resource (only for network members).',
                            },
                            network => {
                                type => 'string',
                                optional => 1,
                                description =>
                                    "The network resource as passed to the 'network' parameter"
                                    . " (only for network members).",
                            },
                            text => {
                                type => 'string',
                                optional => 1,
                                description =>
                                    'Human-readable description (only for network members).',
                            },
                        },
                    },
                },
            },
        },
        links => [{ rel => 'child', href => "{poolid}" }],
    },
    code => sub {
        my ($param) = @_;

        my $rpcenv = PVE::RPCEnvironment::get();
        my $authuser = $rpcenv->get_user();

        my $usercfg = $rpcenv->{user_cfg};

        my $res = [];
        if (my $poolid = $param->{poolid}) {
            $rpcenv->check($authuser, "/pool/$poolid", ['Pool.Audit']);

            my $vmlist = PVE::Cluster::get_vmlist() || {};
            my $idlist = $vmlist->{ids} || {};

            my $rrd = PVE::Cluster::rrd_dump();

            my $pool_config = $usercfg->{pools}->{$poolid};

            die "pool '$poolid' does not exist\n" if !$pool_config;

            my $members = [];
            for my $vmid (sort keys %{ $pool_config->{vms} }) {
                my $vmdata = $idlist->{$vmid};
                next
                    if !$vmdata || defined($param->{type}) && $param->{type} ne $vmdata->{type};
                my $entry = PVE::API2Tools::extract_vm_stats($vmid, $vmdata, $rrd);
                push @$members, $entry;
            }

            my $nodename = PVE::INotify::nodename();
            my $cfg = PVE::Storage::config();
            if (!defined($param->{type}) || $param->{type} eq 'storage') {
                for my $storeid (sort keys %{ $pool_config->{storage} }) {
                    my $scfg = PVE::Storage::storage_config($cfg, $storeid, 1);
                    next if !$scfg;

                    my $storage_node = $nodename; # prefer local node
                    if ($scfg->{nodes} && !$scfg->{nodes}->{$storage_node}) {
                        for my $node (sort keys(%{ $scfg->{nodes} })) {
                            $storage_node = $node;
                            last;
                        }
                    }

                    my $entry =
                        PVE::API2Tools::extract_storage_stats($storeid, $scfg, $storage_node, $rrd);
                    push @$members, $entry;
                }
            }

            if (!defined($param->{type}) || $param->{type} eq 'network') {
                for my $net_key (sort keys $pool_config->{network}->%*) {
                    my ($type, @path) = split('/', $net_key);

                    if ($type eq 'vnet') {
                        my ($zoneid, $vnet, $tag) = @path;

                        my $description = "$vnet ($zoneid)";
                        $description = "$vnet.$tag ($zoneid)" if defined($tag);

                        push @$members,
                            {
                                type => 'network',
                                'network-type' => $type,
                                id => "network/$net_key",
                                network => $net_key,
                                text => $description,
                            };
                    }
                }
            }

            my $pool_info = {
                members => $members,
            };
            $pool_info->{comment} = $pool_config->{comment} if defined($pool_config->{comment});
            $pool_info->{poolid} = $poolid;

            push @$res, $pool_info;
        } else {
            for my $pool (sort keys %{ $usercfg->{pools} }) {
                next if !$rpcenv->check($authuser, "/pool/$pool", ['Pool.Audit'], 1);

                my $entry = { poolid => $pool };
                my $pool_config = $usercfg->{pools}->{$pool};
                $entry->{comment} = $pool_config->{comment} if defined($pool_config->{comment});
                push @$res, $entry;
            }
        }

        return $res;
    },
});

__PACKAGE__->register_method({
    name => 'create_pool',
    protected => 1,
    path => '',
    method => 'POST',
    permissions => {
        check => ['perm', '/pool/{poolid}', ['Pool.Allocate']],
    },
    description => "Create new pool.",
    parameters => {
        additionalProperties => 0,
        properties => {
            poolid => {
                type => 'string',
                format => 'pve-poolid',
            },
            comment => {
                type => 'string',
                optional => 1,
            },
        },
    },
    returns => { type => 'null' },
    code => sub {
        my ($param) = @_;

        PVE::AccessControl::lock_user_config(
            sub {
                my $usercfg = cfs_read_file("user.cfg");
                my $pool = $param->{poolid};

                die "pool '$pool' already exists\n" if $usercfg->{pools}->{$pool};
                if ($pool =~ m!^(.*)/([^/]+)$!) {
                    my ($parent, $leaf) = ($1, $2);
                    die "parent '$parent' of pool '$pool' does not exist\n"
                        if !defined($usercfg->{pools}->{$parent});
                    die "pool name must start with a letter\n" if $leaf !~ m!^[A-Za-z]!;
                } else {
                    die "pool name must start with a letter\n" if $pool !~ m!^[A-Za-z]!;
                }

                $usercfg->{pools}->{$pool} = {
                    vms => {},
                    storage => {},
                };

                $usercfg->{pools}->{$pool}->{comment} = $param->{comment} if $param->{comment};

                cfs_write_file("user.cfg", $usercfg);
            },
            "create pool failed",
        );

        return;
    },
});

__PACKAGE__->register_method({
    name => 'update_pool_deprecated',
    protected => 1,
    path => '{poolid}',
    method => 'PUT',
    permissions => {
        description =>
            "You also need the right to modify permissions on any object you add/delete.",
        check => ['perm', '/pool/{poolid}', ['Pool.Allocate']],
    },
    description =>
        "Update pool data (deprecated, no support for nested pools - use 'PUT /pools/?poolid={poolid}' instead).",
    parameters => {
        additionalProperties => 0,
        properties => {
            poolid => { type => 'string', format => 'pve-poolid' },
            comment => { type => 'string', optional => 1 },
            vms => {
                description => 'List of guest VMIDs to add or remove from this pool.',
                type => 'string',
                format => 'pve-vmid-list',
                optional => 1,
            },
            storage => {
                description => 'List of storage IDs to add or remove from this pool.',
                type => 'string',
                format => 'pve-storage-id-list',
                optional => 1,
            },
            network => {
                description => "List of network resources to add or remove from this pool."
                    . " 'vnet/<zone>/<vnet>' allows network devices on the VNet without VLAN tag"
                    . " or trunks, a trailing '/<tag>' allows that VLAN tag, and '/*' allows the"
                    . " VNet with or without any VLAN tag. This only controls the network device"
                    . " configuration, a device without VLAN tag can still carry tagged guest"
                    . " traffic on a VLAN-aware VNet.",
                type => 'string',
                typetext => 'vnet/<zone>/<vnet>[/<tag>|/*]',
                format => 'pve-pool-network-list',
                optional => 1,
            },
            'allow-move' => {
                description => 'Allow adding a guest even if already in another pool.'
                    . ' The guest will be removed from its current pool and added to this one.',
                type => 'boolean',
                optional => 1,
                default => 0,
            },
            delete => {
                description =>
                    'Remove the passed VMIDs, storage IDs and/or network resources instead of'
                    . ' adding them.',
                type => 'boolean',
                optional => 1,
                default => 0,
            },
        },
    },
    returns => { type => 'null' },
    code => sub {
        my ($param) = @_;

        return __PACKAGE__->update_pool($param);
    },
});

__PACKAGE__->register_method({
    name => 'update_pool',
    protected => 1,
    path => '',
    method => 'PUT',
    permissions => {
        description =>
            "You also need the right to modify permissions on any object you add/delete.",
        check => ['perm', '/pool/{poolid}', ['Pool.Allocate']],
    },
    description => "Update pool.",
    parameters => {
        additionalProperties => 0,
        properties => {
            poolid => { type => 'string', format => 'pve-poolid' },
            comment => { type => 'string', optional => 1 },
            vms => {
                description => 'List of guest VMIDs to add or remove from this pool.',
                type => 'string',
                format => 'pve-vmid-list',
                optional => 1,
            },
            storage => {
                description => 'List of storage IDs to add or remove from this pool.',
                type => 'string',
                format => 'pve-storage-id-list',
                optional => 1,
            },
            network => {
                description => "List of network resources to add or remove from this pool."
                    . " 'vnet/<zone>/<vnet>' allows network devices on the VNet without VLAN tag"
                    . " or trunks, a trailing '/<tag>' allows that VLAN tag, and '/*' allows the"
                    . " VNet with or without any VLAN tag. This only controls the network device"
                    . " configuration, a device without VLAN tag can still carry tagged guest"
                    . " traffic on a VLAN-aware VNet.",
                type => 'string',
                typetext => 'vnet/<zone>/<vnet>[/<tag>|/*]',
                format => 'pve-pool-network-list',
                optional => 1,
            },
            'allow-move' => {
                description => 'Allow adding a guest even if already in another pool.'
                    . ' The guest will be removed from its current pool and added to this one.',
                type => 'boolean',
                optional => 1,
                default => 0,
            },
            delete => {
                description =>
                    'Remove the passed VMIDs, storage IDs and/or network resources instead of'
                    . ' adding them.',
                type => 'boolean',
                optional => 1,
                default => 0,
            },
        },
    },
    returns => { type => 'null' },
    code => sub {
        my ($param) = @_;

        my $rpcenv = PVE::RPCEnvironment::get();
        my $authuser = $rpcenv->get_user();

        my $update = sub {
            PVE::AccessControl::lock_user_config(
                sub {
                    my $usercfg = cfs_read_file("user.cfg");
                    my $pool = $param->{poolid};
                    my $pool_config = $usercfg->{pools}->{$pool};

                    die "pool '$pool' does not exist\n" if !$pool_config;

                    $pool_config->{comment} = $param->{comment} if defined($param->{comment});

                    if (defined($param->{vms})) {
                        for my $vmid (PVE::Tools::split_list($param->{vms})) {
                            $rpcenv->check_perm_modify($authuser, "/vms/$vmid");

                            if ($param->{delete}) {
                                die "VM $vmid is not a pool member\n"
                                    if !$pool_config->{vms}->{$vmid};
                                delete $pool_config->{vms}->{$vmid};
                                delete $usercfg->{vms}->{$vmid};
                            } else {
                                die "VM $vmid is already a pool member\n"
                                    if $pool_config->{vms}->{$vmid};
                                if (defined(my $existing_pool = $usercfg->{vms}->{$vmid})) {
                                    die
                                        "VM $vmid belongs already to pool '$existing_pool' and 'allow-move' is not set\n"
                                        if !$param->{'allow-move'};

                                    $rpcenv->check(
                                        $authuser, "/pool/$existing_pool", ['Pool.Allocate'],
                                    );
                                    delete $usercfg->{pools}->{$existing_pool}->{vms}->{$vmid};
                                }
                                $pool_config->{vms}->{$vmid} = 1;
                                $usercfg->{vms}->{$vmid} = $pool;
                            }
                        }
                    }

                    if (defined($param->{storage})) {
                        for my $storeid (PVE::Tools::split_list($param->{storage})) {
                            $rpcenv->check_perm_modify($authuser, "/storage/$storeid");

                            if ($param->{delete}) {
                                die "Storage '$storeid' is not a pool member\n"
                                    if !$pool_config->{storage}->{$storeid};
                                delete $pool_config->{storage}->{$storeid};
                            } else {
                                die "Storage '$storeid' is already a pool member\n"
                                    if $pool_config->{storage}->{$storeid};

                                $pool_config->{storage}->{$storeid} = 1;
                            }
                        }
                    }

                    if (defined($param->{network})) {
                        if (!$param->{delete}) {
                            # FIXME: MAJOR VERSION: 10.0 remove gatekeeper
                            # nodes without support for network pool members drop them when
                            # rewriting user.cfg and keep them when an SDN apply deletes or moves
                            # their VNet, so all nodes must support them before adding
                            PVE::Cluster::assert_min_cluster_version(9, 2, 34);
                        }

                        my $zones_cfg = PVE::Network::SDN::Zones::config(1);
                        my $vnets_cfg = PVE::Network::SDN::Vnets::config(1);

                        my $network_param = $param->{network};
                        for my $network (PVE::Tools::split_list($network_param)) {
                            die "'$network' is not a valid network resource\n"
                                if $network !~ NETWORK_VNET_REGEX;
                            my ($zone, $vnetid, $tag) = ($1, $2, $3);

                            my $network_key = "vnet/$zone/$vnetid";
                            my $acl_path = "/sdn/zones/$zone/$vnetid";

                            if (defined($tag)) {
                                $network_key .= "/$tag";
                                $acl_path .= "/$tag" if $tag ne '*';
                            }

                            $rpcenv->check_perm_modify($authuser, $acl_path);

                            if ($param->{delete}) {
                                die "Network resource '$network_key' is not a pool member\n"
                                    if !$pool_config->{network}->{$network_key};

                                delete $pool_config->{network}->{$network_key};
                                next;
                            }

                            die "SDN zone '$zone' does not exist or is not applied\n"
                                if !$zones_cfg->{ids}->{$zone};

                            my $vnet_data = $vnets_cfg->{ids}->{$vnetid}
                                or die "VNet '$vnetid' does not exist or is not applied\n";

                            die "VNet '$vnetid' does not belong to zone '$zone'\n"
                                if $zone ne $vnet_data->{zone};

                            die
                                "VNet '$vnetid' is not VLAN-aware, cannot assign a specific VLAN tag\n"
                                if defined($tag) && !$vnet_data->{vlanaware};

                            # a wildcard grants the pool's roles on all tags of the VNet, so the
                            # user's SDN.Allocate must propagate to them
                            if (defined($tag) && $tag eq '*') {
                                my $auth_user_privs =
                                    $rpcenv->permissions($authuser, $acl_path);

                                if (
                                    !defined($auth_user_privs->{'Permissions.Modify'})
                                    && !$auth_user_privs->{'SDN.Allocate'}
                                ) {
                                    raise_param_exc({
                                        network =>
                                            "Cannot add '$network_key' - requires 'Permissions.Modify'"
                                            . " or propagated 'SDN.Allocate' on '$acl_path'",
                                    });
                                }
                            }

                            die "Network resource '$network_key' is already a pool member\n"
                                if $pool_config->{network}->{$network_key};

                            $pool_config->{network}->{$network_key} = 1;
                        }
                    }

                    cfs_write_file("user.cfg", $usercfg);
                },
                "update pools failed",
            );
        };

        if (defined($param->{network})) {
            # Network members are checked against the running SDN config, so serialize with
            # applying the SDN config, which updates the members of deleted and moved VNets
            # before writing the running config.
            PVE::Network::SDN::lock_sdn_domain($update);
        } else {
            $update->();
        }

        return;
    },
});

__PACKAGE__->register_method({
    name => 'read_pool',
    path => '{poolid}',
    method => 'GET',
    permissions => {
        check => ['perm', '/pool/{poolid}', ['Pool.Audit']],
    },
    description =>
        "Get pool configuration (deprecated, no support for nested pools, use 'GET /pools/?poolid={poolid}').",
    parameters => {
        additionalProperties => 0,
        properties => {
            poolid => {
                type => 'string',
                format => 'pve-poolid',
            },
            type => {
                type => 'string',
                enum => ['qemu', 'lxc', 'storage', 'network'],
                optional => 1,
            },
        },
    },
    returns => {
        type => "object",
        additionalProperties => 0,
        properties => {
            comment => {
                type => 'string',
                optional => 1,
            },
            members => {
                type => 'array',
                items => {
                    type => "object",
                    additionalProperties => 1,
                    properties => {
                        type => {
                            type => 'string',
                            enum => ['qemu', 'lxc', 'openvz', 'storage', 'network'],
                        },
                        id => {
                            type => 'string',
                        },
                        node => {
                            type => 'string',
                            optional => 1,
                        },
                        vmid => {
                            type => 'integer',
                            optional => 1,
                        },
                        storage => {
                            type => 'string',
                            optional => 1,
                        },
                        'network-type' => {
                            type => 'string',
                            enum => ['vnet'],
                            optional => 1,
                            description =>
                                'Type of the network resource (only for network members).',
                        },
                        network => {
                            type => 'string',
                            optional => 1,
                            description =>
                                "The network resource as passed to the 'network' parameter"
                                . " (only for network members).",
                        },
                        text => {
                            type => 'string',
                            optional => 1,
                            description =>
                                'Human-readable description (only for network members).',
                        },
                    },
                },
            },
        },
    },
    code => sub {
        my ($param) = @_;

        my $pool_info = __PACKAGE__->index($param);
        return $pool_info->[0];
    },
});

__PACKAGE__->register_method({
    name => 'delete_pool_deprecated',
    protected => 1,
    path => '{poolid}',
    method => 'DELETE',
    permissions => {
        description => "You can only delete empty pools (no members).",
        check => ['perm', '/pool/{poolid}', ['Pool.Allocate']],
    },
    description =>
        "Delete pool (deprecated, no support for nested pools, use 'DELETE /pools/?poolid={poolid}').",
    parameters => {
        additionalProperties => 0,
        properties => {
            poolid => { type => 'string', format => 'pve-poolid' },
        },
    },
    returns => { type => 'null' },
    code => sub {
        my ($param) = @_;

        return __PACKAGE__->delete_pool($param);
    },
});

__PACKAGE__->register_method({
    name => 'delete_pool',
    protected => 1,
    path => '',
    method => 'DELETE',
    permissions => {
        description => "You can only delete empty pools (no members).",
        check => ['perm', '/pool/{poolid}', ['Pool.Allocate']],
    },
    description => "Delete pool.",
    parameters => {
        additionalProperties => 0,
        properties => {
            poolid => { type => 'string', format => 'pve-poolid' },
        },
    },
    returns => { type => 'null' },
    code => sub {
        my ($param) = @_;

        my $rpcenv = PVE::RPCEnvironment::get();
        my $authuser = $rpcenv->get_user();

        PVE::AccessControl::lock_user_config(
            sub {
                my $vmlist = PVE::Cluster::get_vmlist() || {};
                my $idlist = $vmlist->{ids} || {};

                my $storecfg = PVE::Storage::config();
                my $usercfg = cfs_read_file("user.cfg");

                my $pool = $param->{poolid};

                my $pool_config = $usercfg->{pools}->{$pool};
                die "pool '$pool' does not exist\n" if !$pool_config;
                for my $subpool (sort keys %{ $pool_config->{pools} }) {
                    die "pool '$pool' is not empty (contains pool '$subpool')\n";
                }

                for my $vmid (sort keys %{ $pool_config->{vms} }) {
                    next if !$idlist->{$vmid}; # ignore destroyed guests
                    die "pool '$pool' is not empty (contains VM $vmid)\n";
                }

                for my $storeid (sort keys %{ $pool_config->{storage} }) {
                    next if !PVE::Storage::storage_config($storecfg, $storeid, 1);
                    die "pool '$pool' is not empty (contains storage '$storeid')\n";
                }

                for my $netid (sort keys $pool_config->{network}->%*) {
                    die "pool '$pool' is not empty (contains network resource '$netid')\n";
                }

                delete($usercfg->{pools}->{$pool});
                PVE::AccessControl::delete_pool_acl($pool, $usercfg);

                cfs_write_file("user.cfg", $usercfg);
            },
            "delete pool failed",
        );

        return;
    },
});

1;
