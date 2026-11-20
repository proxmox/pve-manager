Ext.define('PVE.sdn.FabricRoutesContentView', {
    extend: 'Ext.grid.GridPanel',
    alias: 'widget.pveSDNFabricRoutesContentView',

    columns: [
        {
            header: gettext('Route'),
            sortable: true,
            dataIndex: 'route',
            flex: 1,
        },
        {
            header: gettext('Via'),
            sortable: true,
            dataIndex: 'via',
            renderer: (value) => {
                if (Ext.isArray(value)) {
                    return value.join('<br>');
                }
                return value || '';
            },
            flex: 1,
        },
    ],
});

Ext.define('PVE.sdn.FabricNeighborsContentView', {
    extend: 'Ext.grid.GridPanel',
    alias: 'widget.pveSDNFabricNeighborsContentView',

    protocol: null,

    initComponent: function () {
        let me = this;

        me.columns = [
            {
                header: gettext('Neighbor'),
                sortable: true,
                dataIndex: 'neighbor',
                flex: 1,
                emptyCellText: '-',
            },
        ];

        if (me.protocol === 'wireguard') {
            me.columns.unshift({
                header: gettext('Name'),
                sortable: true,
                dataIndex: 'name',
                flex: 1,
                emptyCellText: '-',
            });

            me.columns = me.columns.concat([
                {
                    header: gettext('Interface'),
                    sortable: true,
                    dataIndex: 'interface',
                    flex: 0.5,
                },
                {
                    header: gettext('Status'),
                    sortable: true,
                    dataIndex: 'status',
                    flex: 0.5,
                },
                {
                    header: gettext('Public Key'),
                    sortable: true,
                    dataIndex: 'public-key',
                    flex: 1,
                },
                {
                    header: gettext('Allowed IPs'),
                    sortable: true,
                    dataIndex: 'allowed-ips',
                    flex: 1,
                    emptyCellText: '-',
                },
                {
                    header: gettext('Latest Handshake'),
                    sortable: true,
                    dataIndex: 'latest-handshake',
                    flex: 1,
                    renderer: function (value) {
                        if (!value) {
                            return '-';
                        }

                        return Proxmox.Utils.render_timestamp(value);
                    },
                },
                {
                    // TRANSLATORS: 's' is the SI symbol for seconds, the unit of the value
                    header: gettext('Persistent Keepalive (s)'),
                    sortable: true,
                    dataIndex: 'persistent-keepalive',
                    flex: 0.5,
                    emptyCellText: gettext('off'),
                },
                {
                    header: gettext('Bytes transmitted'),
                    sortable: true,
                    dataIndex: 'bytes-tx',
                    flex: 0.5,
                    renderer: Proxmox.Utils.render_size,
                },
                {
                    header: gettext('Bytes received'),
                    sortable: true,
                    dataIndex: 'bytes-rx',
                    flex: 0.5,
                    renderer: Proxmox.Utils.render_size,
                },
            ]);
        } else {
            me.columns = me.columns.concat([
                {
                    header: gettext('Status'),
                    sortable: true,
                    dataIndex: 'status',
                    flex: 0.5,
                },
                {
                    header: gettext('Uptime'),
                    sortable: true,
                    dataIndex: 'uptime',
                    flex: 0.5,
                },
            ]);
        }

        me.callParent();
    },
});

Ext.define('PVE.sdn.FabricInterfacesContentView', {
    extend: 'Ext.grid.GridPanel',
    alias: 'widget.pveSDNFabricInterfacesContentView',

    protocol: null,

    initComponent: function () {
        let me = this;

        me.columns = [
            {
                header: gettext('Name'),
                sortable: true,
                dataIndex: 'name',
                flex: 1,
            },
            {
                header: gettext('Type'),
                sortable: true,
                dataIndex: 'type',
                flex: 1,
                emptyCellText: '-',
            },
            {
                header: gettext('State'),
                sortable: true,
                dataIndex: 'state',
                flex: 1,
            },
        ];

        if (me.protocol === 'wireguard') {
            me.columns = me.columns.concat([
                {
                    header: gettext('Public Key'),
                    sortable: true,
                    dataIndex: 'public-key',
                    flex: 1,
                    emptyCellText: '-',
                },
                {
                    header: gettext('Listen Port'),
                    sortable: true,
                    dataIndex: 'listen-port',
                    flex: 1,
                    emptyCellText: '-',
                },
            ]);
        }

        me.callParent();
    },
});
