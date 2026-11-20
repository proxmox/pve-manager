Ext.define('pve-san-node-identity', {
    extend: 'Ext.data.Model',
    idProperty: 'node',
    fields: ['node', 'state', 'iscsi-initiator-name'],
});

Ext.define('PVE.storage.wizard.NodeIdentities', {
    extend: 'Ext.grid.Panel',
    xtype: 'pveStorageWizardNodeIdentities',
    height: 220,
    disableSelection: true,
    viewConfig: { enableTextSelection: true },
    columns: [
        { text: gettext('Node'), dataIndex: 'node', width: 100, renderer: Ext.htmlEncode },
        {
            text: gettext('Multipath Setup'),
            dataIndex: 'state',
            width: 175,
            renderer: PVE.SANUtils.renderState,
        },
        {
            text: gettext('Initiator Name'),
            dataIndex: 'iscsi-initiator-name',
            flex: 1,
            renderer: Ext.htmlEncode,
        },
    ],

    // Lists only the given nodes, or all nodes for none, which Copy then follows.
    setNodes: function (nodes) {
        let me = this;
        nodes = [].concat(nodes || []).filter(Boolean);
        if (nodes.length) {
            me.store.addFilter({ id: 'nodes', filterFn: (rec) => nodes.includes(rec.get('node')) });
        } else {
            me.store.removeFilter('nodes');
        }
    },

    initComponent: function () {
        let me = this;
        me.rstore = Ext.create('Proxmox.data.UpdateStore', {
            storeid: 'san-wizard-identities',
            model: 'pve-san-node-identity',
            interval: 5000,
            proxy: {
                type: 'proxmox',
                url: '/api2/json/cluster/multipath/status',
                reader: {
                    type: 'json',
                    rootProperty: 'data',
                    transform: (raw) => ({
                        ...raw,
                        data: Object.entries(raw.data.nodes).map(([node, report]) => ({
                            ...report,
                            node,
                        })),
                    }),
                },
            },
        });
        me.store = Ext.create('Proxmox.data.DiffStore', {
            rstore: me.rstore,
            sorters: ['node'],
            sortAfterUpdate: true,
        });
        me.tbar = [
            {
                xtype: 'tbtext',
                text: gettext(
                    'On the array, allow the initiator names of the nodes that will use the target.',
                ),
            },
            '->',
            {
                text: gettext('Copy Initiator Names'),
                iconCls: 'fa fa-clipboard',
                handler: () =>
                    PVE.Utils.copyToClipboard(
                        me.store
                            .getRange()
                            .map((rec) => rec.get('iscsi-initiator-name'))
                            .filter(Boolean)
                            .join('\n'),
                    ),
            },
        ];
        me.callParent();
        Proxmox.Utils.monStoreErrors(me, me.rstore);
        me.on('afterrender', () => me.rstore.startUpdate());
        me.on('destroy', () => {
            me.store.destroy();
            me.rstore.destroy();
        });
    },
});
