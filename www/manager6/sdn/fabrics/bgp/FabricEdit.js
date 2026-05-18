Ext.define('PVE.sdn.Fabric.Bgp.Fabric.Edit', {
    extend: 'PVE.sdn.Fabric.Fabric.Edit',

    subject: 'BGP',
    onlineHelp: 'pvesdn_bgp_fabric',

    extraRequestParams: {
        protocol: 'bgp',
    },

    additionalItems: [
        {
            xtype: 'proxmoxcheckbox',
            fieldLabel: gettext('BFD'),
            labelWidth: 120,
            name: 'bfd',
            uncheckedValue: 0,
            defaultValue: 0,
        },
        {
            xtype: 'pveSDNPrefixListSelector',
            name: 'route_filter',
            fieldLabel: gettext('Route Filter'),
            labelWidth: 120,
            emptyText: gettext('IP Prefixes'),
            deleteEmpty: true,
            skipEmptyText: true,
        },
    ],

    additionalAdvancedItems: [
        {
            xtype: 'pveSDNRouteMapSelector',
            name: 'route_map_in',
            fieldLabel: gettext('Incoming Route Map'),
            labelWidth: 120,
            emptyText: gettext('Route Map'),
            deleteEmpty: true,
            skipEmptyText: true,
        },
        {
            xtype: 'pveSDNRouteMapSelector',
            name: 'route_map_out',
            fieldLabel: gettext('Outgoing Route Map'),
            labelWidth: 120,
            emptyText: gettext('Route Map'),
            deleteEmpty: true,
            skipEmptyText: true,
        },
    ],

    additionalTabs: [
        {
            xtype: 'inputpanel',
            title: gettext('Route Redistribution'),
            items: [
                {
                    xtype: 'pveSDNRedistributionGrid',
                    name: 'redistribute',
                    sources: [
                        ['ospf', gettext('OSPF')],
                        ['connected', gettext('Connected')],
                        ['static', gettext('Static')],
                        ['kernel', gettext('Kernel')],
                    ],
                },
            ],
        },
    ],
});
