Ext.define('PVE.sdn.Fabric.OpenFabric.Node.Edit', {
    extend: 'PVE.sdn.Fabric.Node.Edit',
    protocol: 'openfabric',

    extraRequestParams: {
        protocol: 'openfabric',
    },
});
