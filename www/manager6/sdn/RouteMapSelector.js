Ext.define('PVE.sdn.RouteMap', {
    extend: 'Ext.data.Model',
    fields: ['id'],
});

Ext.define('PVE.sdn.RouteMapSelector', {
    extend: 'Proxmox.form.ComboGrid',
    alias: 'widget.pveSDNRouteMapSelector',

    displayField: 'id',

    deleteEmpty: true,
    editable: false,
    allowBlank: true,
    autoSelect: false,

    config: {
        value: null,
    },

    store: {
        autoLoad: true,
        model: 'PVE.sdn.RouteMap',
        proxy: {
            type: 'proxmox',
            url: '/api2/json/cluster/sdn/route-maps',
            reader: {
                transform: {
                    fn: function (response) {
                        return Object.values(
                            response.data.reduce((accumulator, routeMapEntry) => {
                                let id = routeMapEntry['route-map-id'];

                                accumulator[id] ??= {
                                    id,
                                };

                                return accumulator;
                            }, {}),
                        );
                    },
                },
            },
        },
    },
    listConfig: {
        columns: [
            {
                header: gettext('Name'),
                dataIndex: 'id',
                hideable: false,
                flex: 1,
            },
        ],
    },
});
