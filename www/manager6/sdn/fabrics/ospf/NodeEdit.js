Ext.define('PVE.sdn.Fabric.Ospf.Node.Edit', {
    extend: 'PVE.sdn.Fabric.Node.Edit',
    protocol: 'ospf',

    hasIpv6Support: false,

    extraRequestParams: {
        protocol: 'ospf',
    },
});
