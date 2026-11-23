Ext.define('PVE.node.ISCSITargetTree', {
    extend: 'Ext.tree.Panel',
    xtype: 'pveISCSITargetTree',
    onlineHelp: 'storage_open_iscsi',
    rootVisible: false,
    viewConfig: { emptyText: gettext('No iSCSI targets found'), enableTextSelection: true },
    store: {
        type: 'tree',
        fields: ['text', 'state', 'session-id', 'used-by-storage', 'lun'],
        root: { expanded: true, children: [] },
    },
    columns: [
        {
            xtype: 'treecolumn',
            text: gettext('Target'),
            dataIndex: 'text',
            flex: 3,
            renderer: Ext.htmlEncode,
        },
        {
            text: gettext('State'),
            dataIndex: 'state',
            width: 150,
            renderer: PVE.SANUtils.renderState,
        },
        { text: gettext('Session ID'), dataIndex: 'session-id', width: 100 },
        { text: 'LUN', dataIndex: 'lun', width: 70 },
        {
            text: gettext('iSCSI Storage'),
            dataIndex: 'used-by-storage',
            flex: 1,
            renderer: Ext.htmlEncode,
        },
    ],

    reload: function () {
        let me = this;
        Proxmox.Utils.API2Request({
            url: `/nodes/${me.nodename}/san/iscsi/status`,
            method: 'GET',
            waitMsgTarget: me.getView(),
            failure: (response) => Proxmox.Utils.setErrorMask(me.getView(), response.htmlStatus),
            success: function (response) {
                if (me.destroyed) {
                    return;
                }
                let status = response.result.data;
                // a name left over from a removed but not purged open-iscsi is of no use
                me.down('#initiator').setValue(
                    status.supported ? status['initiator-name'] || '' : '',
                );
                if (!status.supported) {
                    Proxmox.Utils.setErrorMask(
                        me.getView(),
                        gettext('open-iscsi is not installed on this node.'),
                    );
                    return;
                }
                Proxmox.Utils.API2Request({
                    url: `/nodes/${me.nodename}/san/iscsi/target`,
                    method: 'GET',
                    waitMsgTarget: me.getView(),
                    failure: (res) => Proxmox.Utils.setErrorMask(me.getView(), res.htmlStatus),
                    success: function (res) {
                        if (me.destroyed) {
                            return;
                        }
                        Proxmox.Utils.setErrorMask(me.getView(), false);
                        me.sessions = res.result.data;
                        me.updateTree();
                    },
                });
            },
        });
    },

    // Shows the loaded portals that match the search text, in one of their own values or in a
    // device of their session, below their targets.
    updateTree: function () {
        let me = this;
        if (!me.sessions) {
            return;
        }
        let query = (me.down('pveRecordSearchField').getValue() ?? '').toLowerCase();
        let matches = (row) =>
            !query ||
            [row.target, row.portal, row['used-by-storage'], ...row.devices.map((d) => d.devpath)]
                .filter(Boolean)
                .some((value) => value.toLowerCase().includes(query));
        let targets = {};
        for (let row of me.sessions.filter(matches)) {
            targets[row.target] ??= {
                text: row.target,
                iconCls: 'fa fa-bullseye',
                expanded: true,
                children: [],
            };
            targets[row.target].children.push({
                text: row.portal,
                state: row.state,
                'session-id': row['session-id'],
                'used-by-storage': row['used-by-storage'],
                iconCls: 'fa fa-link',
                expanded: true,
                leaf: !row.devices.length,
                children: row.devices.map((device) => ({
                    text: device.devpath,
                    lun: device.lun,
                    iconCls: 'fa fa-hdd-o',
                    leaf: true,
                })),
            });
        }
        me.setRootNode({ expanded: true, children: Object.values(targets) });
    },

    listeners: {
        activate: function () {
            this.reload();
        },
    },

    initComponent: function () {
        let me = this;
        me.nodename = me.pveSelNode.data.node;
        me.tbar = {
            overflowHandler: 'scroller',
            items: [
                { text: gettext('Reload'), iconCls: 'fa fa-refresh', handler: () => me.reload() },
                '->',
                {
                    xtype: 'displayfield',
                    itemId: 'initiator',
                    fieldLabel: gettext('Initiator Name'),
                },
                {
                    iconCls: 'fa fa-clipboard',
                    tooltip: gettext('Copy to Clipboard'),
                    handler: () => PVE.Utils.copyToClipboard(me.down('#initiator').getValue()),
                },
                ' ',
                gettext('Search') + ':',
                ' ',
                {
                    xtype: 'pveRecordSearchField',
                    emptyText: gettext('Target, Portal, Storage'),
                    listeners: { searchchange: () => me.updateTree() },
                },
            ],
        };
        me.callParent();
    },
});
