Ext.define('PVE.sdn.Fabric.Ospf.Node.Edit', {
    extend: 'PVE.sdn.Fabric.Node.Edit',
    protocol: 'ospf',

    hasIpv6Support: false,
    includeWireguardInterfaces: true,

    extraRequestParams: {
        protocol: 'ospf',
    },
});
