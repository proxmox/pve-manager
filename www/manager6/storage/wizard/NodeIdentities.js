Ext.define('pve-san-node-identity', {
    extend: 'Ext.data.Model',
    idProperty: 'node',
    fields: ['node', 'state', 'iscsi-initiator-name', 'nvme-host-nqn'],
});

// The nodes with their iSCSI initiator names or NVMe host NQNs, to allow them on the array, and to
// select the nodes that use the target. The node serving the web UI sets up the volume group, so it
// stays selected.
Ext.define('PVE.storage.wizard.NodeIdentities', {
    extend: 'Ext.grid.Panel',
    xtype: 'pveStorageWizardNodeIdentities',
    height: 220,
    selModel: { selType: 'checkboxmodel', mode: 'SIMPLE' },
    viewConfig: { enableTextSelection: true },

    // the identity of a node that the array allows
    identity: 'iscsi-initiator-name',

    getSelectedNodes: function () {
        return this.getSelection()
            .map((rec) => rec.get('node'))
            .sort();
    },

    // The selected nodes, or none if all are selected, as a storage without restriction has.
    getNodes: function () {
        let me = this;
        let selected = me.getSelectedNodes();
        return selected.length === me.store.getCount() ? [] : selected;
    },

    // Selects the given nodes, or all for none.
    setNodes: function (nodes) {
        let me = this;
        me.wantedNodes = [].concat(nodes || []).filter(Boolean);
        if (!me.store.getCount()) {
            return; // applied once the nodes are loaded
        }
        let records = me.store
            .getRange()
            .filter(
                (rec) =>
                    !me.wantedNodes.length ||
                    me.wantedNodes.includes(rec.get('node')) ||
                    rec.get('node') === Proxmox.NodeName,
            );
        me.getSelectionModel().select(records, false, true);
        me.fireEvent('nodeschange', me);
    },

    initComponent: function () {
        let me = this;
        let nvme = me.identity === 'nvme-host-nqn';
        me.columns = [
            { text: gettext('Node'), dataIndex: 'node', width: 100, renderer: Ext.htmlEncode },
            {
                text: gettext('Multipath Setup'),
                dataIndex: 'state',
                width: 175,
                renderer: PVE.SANUtils.renderState,
                // the state of multipathd, which native NVMe multipath does not use
                hidden: nvme,
            },
            {
                text: nvme ? gettext('Host NQN') : gettext('Initiator Name'),
                dataIndex: me.identity,
                flex: 1,
                renderer: Ext.htmlEncode,
            },
        ];
        me.rstore = Ext.create('Proxmox.data.UpdateStore', {
            storeid: 'san-wizard-identities',
            model: 'pve-san-node-identity',
            interval: 5000,
            proxy: {
                type: 'proxmox',
                url: '/api2/json/cluster/san/status',
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
                text: nvme
                    ? gettext(
                          'Select the nodes that will use the subsystem and allow their host NQNs on the array.',
                      )
                    : gettext(
                          'Select the nodes that will use the target and allow their initiator names on the array.',
                      ),
            },
            '->',
            {
                text: nvme ? gettext('Copy Host NQNs') : gettext('Copy Initiator Names'),
                iconCls: 'fa fa-clipboard',
                handler: () =>
                    PVE.Utils.copyToClipboard(
                        me
                            .getSelection()
                            .map((rec) => rec.get(me.identity))
                            .filter(Boolean)
                            .join('\n'),
                    ),
            },
        ];
        me.callParent();
        Proxmox.Utils.monStoreErrors(me, me.rstore);
        me.on('beforedeselect', (sm, rec) => rec.get('node') !== Proxmox.NodeName);
        me.on('selectionchange', () => me.fireEvent('nodeschange', me));
        me.mon(me.rstore, 'load', (store, records, success) => {
            if (success && !me.loadedOnce) {
                me.loadedOnce = true;
                me.setNodes(me.wantedNodes);
            }
        });
        me.on('afterrender', () => me.rstore.startUpdate());
        me.on('destroy', () => {
            me.store.destroy();
            me.rstore.destroy();
        });
    },
});
