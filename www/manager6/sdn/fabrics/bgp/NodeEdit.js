Ext.define('PVE.sdn.Fabric.Bgp.Node.Edit', {
    extend: 'PVE.sdn.Fabric.Node.Edit',
    protocol: 'bgp',

    extraRequestParams: {
        protocol: 'bgp',
        role: 'internal',
    },

    includeWireguardInterfaces: true,

    additionalItems: [
        {
            xtype: 'proxmoxintegerfield',
            fieldLabel: gettext('ASN'),
            labelWidth: 120,
            name: 'asn',
            minValue: 1,
            maxValue: 4294967295,
            allowBlank: false,
        },
    ],
});
