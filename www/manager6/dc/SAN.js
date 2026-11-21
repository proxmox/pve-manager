Ext.define('pve-san-status', {
    extend: 'Ext.data.Model',
    fields: [
        'id',
        'kind',
        'node',
        'state',
        'error',
        'apply-error',
        'time',
        'iscsi-initiator-name',
        'other-maps',
        'wwid',
        'name',
        'explicit',
        'multipath-storage',
        'nodes',
        'size',
        'used-by-storage',
    ],
});

Ext.define('PVE.dc.MultipathOverridesEdit', {
    extend: 'Proxmox.window.Edit',
    subject: gettext('Multipath Overrides'),
    onlineHelp: 'storage_multipath',
    width: 600,
    autoLoad: true,
    method: 'PUT',
    url: '/cluster/multipath/overrides',
    items: [
        {
            xtype: 'textarea',
            name: 'overrides',
            fieldLabel: gettext('Overrides'),
            emptyText: gettext(
                'multipath.conf sections for all nodes, for example a devices section with array settings',
            ),
            height: 320,
            fieldStyle: 'font-family: monospace;',
        },
    ],
});

Ext.define('PVE.dc.SANView', {
    extend: 'Ext.panel.Panel',
    xtype: 'pveDcSAN',
    onlineHelp: 'storage_multipath',
    layout: { type: 'vbox', align: 'stretch' },

    initComponent: function () {
        let me = this;
        let caps = Ext.state.Manager.get('GuiCap').dc;
        let canModify = !!caps['Sys.Modify'];
        let canEdit = canModify && !!caps['Sys.Audit'];
        me.rstore = Ext.create('Proxmox.data.UpdateStore', {
            storeid: 'dc-san-status',
            model: 'pve-san-status',
            interval: 5000,
            proxy: {
                type: 'proxmox',
                url: '/api2/json/cluster/san/status',
                reader: {
                    type: 'json',
                    rootProperty: 'data',
                    transform: function (raw) {
                        let data = raw.data;
                        return {
                            ...raw,
                            data: [
                                ...Object.entries(data.nodes).map(([node, report]) => ({
                                    ...report,
                                    node,
                                    id: `node/${node}`,
                                    kind: 'node',
                                })),
                                ...data.luns.map((lun) => ({
                                    ...lun,
                                    id: `lun/${lun.wwid}`,
                                    kind: 'lun',
                                })),
                            ],
                        };
                    },
                },
            },
        });
        let nodeStore = Ext.create('Proxmox.data.DiffStore', {
            rstore: me.rstore,
            filters: [{ property: 'kind', value: 'node' }],
            sorters: ['node'],
            sortAfterUpdate: true,
        });
        let lunStore = Ext.create('Proxmox.data.DiffStore', {
            rstore: me.rstore,
            filters: [{ property: 'kind', value: 'lun' }],
            sorters: ['wwid'],
            sortAfterUpdate: true,
        });
        let reload = () => me.rstore.load();
        let edit = ({ wwid, isCreate }) =>
            Ext.create('PVE.dc.MultipathWwidEdit', {
                wwid,
                isCreate,
                autoShow: true,
                apiCallDone: (success) => success && reload(),
            });
        let showPaths = (rec) =>
            Ext.create('PVE.window.SANLunState', {
                wwid: rec.get('wwid'),
                name: rec.get('name'),
                autoShow: true,
            });
        let setupItem = (type) => ({
            text: PVE.storage.wizard.SAN.subject(type),
            iconCls: 'fa fa-fw fa-building',
            disabled: !PVE.SANUtils.canSetup(type),
            handler: () => PVE.SANUtils.openSetup(type, reload),
        });
        me.tbar = [
            {
                text: gettext('Guided Setup'),
                disabled: !PVE.SANUtils.canSetup('iscsi'),
                menu: [setupItem('iscsi'), setupItem('fc')],
            },
            {
                text: gettext('Multipath Overrides'),
                disabled: !canEdit,
                handler: () =>
                    Ext.create('PVE.dc.MultipathOverridesEdit', {
                        autoShow: true,
                        apiCallDone: (success) => success && reload(),
                    }),
            },
        ];
        me.items = [
            {
                xtype: 'grid',
                title: gettext('Nodes'),
                store: nodeStore,
                flex: 2,
                viewConfig: { enableTextSelection: true },
                tbar: [
                    {
                        text: gettext('Copy Initiator Names'),
                        iconCls: 'fa fa-clipboard',
                        handler: () =>
                            PVE.Utils.copyToClipboard(
                                nodeStore
                                    .getRange()
                                    .map((rec) => rec.get('iscsi-initiator-name'))
                                    .filter(Boolean)
                                    .join('\n'),
                            ),
                    },
                ],
                columns: [
                    {
                        text: gettext('Node'),
                        dataIndex: 'node',
                        width: 120,
                        renderer: Ext.htmlEncode,
                    },
                    {
                        text: gettext('Multipath Setup'),
                        dataIndex: 'state',
                        width: 170,
                        renderer: PVE.SANUtils.renderState,
                    },
                    {
                        text: gettext('Message'),
                        dataIndex: 'error',
                        flex: 1,
                        renderer: (value, md, rec) =>
                            [value, rec.get('apply-error')]
                                .filter(Boolean)
                                .map(Ext.htmlEncode)
                                .join('<br>'),
                    },
                    {
                        text: gettext('iSCSI Initiator Name'),
                        dataIndex: 'iscsi-initiator-name',
                        flex: 2,
                        renderer: Ext.htmlEncode,
                    },
                    {
                        text: gettext('Other Maps'),
                        tooltip: gettext(
                            'Maps of the node that the LUN list leaves out. They can still be in use, for example by a storage plugin.',
                        ),
                        dataIndex: 'other-maps',
                        width: 110,
                        // shown once a node has such maps
                        hidden: true,
                    },
                    {
                        text: gettext('Last Report'),
                        dataIndex: 'time',
                        width: 160,
                        renderer: Proxmox.Utils.render_timestamp,
                        hidden: true,
                    },
                    {
                        xtype: 'actioncolumn',
                        width: 30,
                        items: [
                            {
                                iconCls: 'fa fa-chevron-right',
                                tooltip: gettext('Go to Node'),
                                isActionDisabled: (_view, _ri, _ci, _item, rec) =>
                                    !PVE.data.ResourceStore.getNodeById(rec.get('node')),
                                handler: function (view, _ri, _ci, _item, _event, rec) {
                                    Ext.state.Manager.getProvider().set('nodetab', {
                                        value: 'san',
                                    });
                                    view.up('pveStdWorkspace').selectById(
                                        `node/${rec.get('node')}`,
                                    );
                                },
                            },
                        ],
                    },
                ],
            },
            {
                xtype: 'grid',
                title: gettext('LUNs'),
                itemId: 'luns',
                store: lunStore,
                flex: 3,
                viewConfig: { enableTextSelection: true },
                listeners: { itemdblclick: (view, rec) => showPaths(rec) },
                tbar: {
                    overflowHandler: 'scroller',
                    items: [
                        {
                            xtype: 'proxmoxButton',
                            text: gettext('Paths by Node'),
                            disabled: true,
                            handler: (button, event, rec) => showPaths(rec),
                        },
                        '-',
                        {
                            text: gettext('Add Multipath Entry'),
                            disabled: !canModify,
                            handler: function (button) {
                                let lun = button.up('grid').getSelection()[0];
                                let wwid = lun?.get('explicit') ? undefined : lun?.get('wwid');
                                edit({ wwid, isCreate: true });
                            },
                        },
                        {
                            xtype: 'proxmoxButton',
                            text: gettext('Edit Entry'),
                            disabled: true,
                            enableFn: (rec) => canEdit && !!rec.get('explicit'),
                            handler: (button, event, rec) => edit({ wwid: rec.get('wwid') }),
                        },
                        {
                            xtype: 'proxmoxButton',
                            text: gettext('Remove Entry'),
                            disabled: true,
                            enableFn: (rec) => canModify && !!rec.get('explicit'),
                            confirmMsg: (rec) =>
                                Ext.String.format(
                                    gettext(
                                        'Remove the multipath entry for {0}? Existing multipath maps are not removed.',
                                    ),
                                    Ext.htmlEncode(rec.get('name') || rec.get('wwid')),
                                ),
                            handler: function (button, event, rec) {
                                Proxmox.Utils.API2Request({
                                    url: `/cluster/multipath/wwid/${encodeURIComponent(rec.get('wwid'))}`,
                                    method: 'DELETE',
                                    waitMsgTarget: me,
                                    failure: (response) =>
                                        Ext.Msg.alert(gettext('Error'), response.htmlStatus),
                                    success: reload,
                                });
                            },
                        },
                        '->',
                        gettext('Search') + ':',
                        ' ',
                        {
                            xtype: 'pveRecordSearchField',
                            emptyText: gettext('Name, WWID, Storage'),
                            searchFields: ['name', 'wwid', 'used-by-storage', 'multipath-storage'],
                            targetStore: lunStore,
                        },
                    ],
                },
                columns: [
                    {
                        text: gettext('Name'),
                        dataIndex: 'name',
                        flex: 2,
                        renderer: (value, md, rec) => Ext.htmlEncode(value || rec.get('wwid')),
                        sorter: (a, b) =>
                            (a.data.name || a.data.wwid).localeCompare(b.data.name || b.data.wwid),
                    },
                    {
                        text: 'WWID',
                        dataIndex: 'wwid',
                        flex: 2,
                        hidden: true,
                        renderer: Ext.htmlEncode,
                    },
                    {
                        text: gettext('State'),
                        dataIndex: 'state',
                        flex: 2,
                        minWidth: 160,
                        cellWrap: true,
                        renderer: function (value, md, rec) {
                            let nodes = Object.entries(rec.get('nodes') || {})
                                .map(([node, report]) => [
                                    node,
                                    PVE.SANUtils.renderLunReport(report),
                                    report.state,
                                ])
                                .sort(([a], [b]) => a.localeCompare(b));
                            if (!nodes.length) {
                                return PVE.SANUtils.renderState(value);
                            }
                            let tip = nodes
                                .map(([node, label]) => `${Ext.htmlEncode(node)}: ${label}`)
                                .join('<br>');
                            md.tdAttr = `data-qtip="${Ext.htmlEncode(tip)}"`;
                            // Nodes with the same state and path count form a group, worst first.
                            // Next to a problem of the LUN, which a node without a report is not,
                            // all groups that are not fine are listed, as a LUN missing on one node
                            // can at the same time have lost paths on another.
                            let groups = new Map();
                            for (const [node, label, state] of nodes) {
                                let group = groups.get(label) ?? { label, state, nodes: [] };
                                group.nodes.push(node);
                                groups.set(label, group);
                            }
                            let rank = {
                                failed: 0,
                                missing: 1,
                                degraded: 2,
                                unknown: 3,
                                optimal: 5,
                            };
                            let list = [...groups.values()];
                            let problem = list.some(
                                (group) => !['optimal', 'unknown'].includes(group.state),
                            );
                            return list
                                .filter((group) => !problem || group.state !== 'optimal')
                                .sort((a, b) => (rank[a.state] ?? 4) - (rank[b.state] ?? 4))
                                .map(function (group) {
                                    let names =
                                        group.nodes.length === nodes.length
                                            ? ''
                                            : ` (${Ext.htmlEncode(group.nodes.join(', '))})`;
                                    // a wrapped list keeps each icon with its label
                                    return `<span style="white-space: nowrap;">${group.label}</span>${names}`;
                                })
                                .join(', ');
                        },
                    },
                    {
                        text: gettext('Multipath'),
                        dataIndex: 'explicit',
                        width: 170,
                        renderer: (value, md, rec) => {
                            let storage = rec.get('multipath-storage');
                            let kind = value ? 'manual' : storage ? 'storage' : 'unmanaged';
                            return Ext.htmlEncode(PVE.SANUtils.multipathText(kind, storage));
                        },
                    },
                    {
                        text: gettext('Used By'),
                        dataIndex: 'used-by-storage',
                        flex: 1,
                        renderer: Ext.htmlEncode,
                        sorter: (a, b) =>
                            (a.data['used-by-storage'] ?? '').localeCompare(
                                b.data['used-by-storage'] ?? '',
                            ),
                    },
                    {
                        text: gettext('Size'),
                        dataIndex: 'size',
                        width: 100,
                        renderer: Proxmox.Utils.render_size,
                    },
                ],
            },
        ];
        me.callParent();
        me.query('grid').forEach((grid) => Proxmox.Utils.monStoreErrors(grid, me.rstore));
        me.mon(lunStore, 'refresh', () => PVE.SANUtils.deselectHidden(me.down('#luns')));
        me.mon(me.rstore, 'load', () =>
            me
                .down('gridcolumn[dataIndex=other-maps]')
                .setHidden(!me.rstore.getRange().some((rec) => rec.get('other-maps'))),
        );
        me.on('activate', () => me.rstore.startUpdate());
        me.on('deactivate', () => me.rstore.stopUpdate());
        me.on('destroy', () => {
            nodeStore.destroy();
            lunStore.destroy();
            me.rstore.destroy();
        });
    },
});
