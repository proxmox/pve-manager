Ext.define('PVE.node.SANLunList', {
    extend: 'Ext.grid.Panel',
    xtype: 'pveSANLunList',
    onlineHelp: 'storage_multipath',
    stateful: true,
    stateId: 'grid-node-san-luns',
    emptyText: gettext('No LUNs found. Check connections and array access.'),
    viewConfig: { enableTextSelection: true },

    plugins: [
        {
            ptype: 'rowexpander',
            expandOnDblClick: false,
            rowBodyTpl: [
                '{[this.paths(values)]}',
                {
                    paths: function (values) {
                        let columns = [
                            ['device', gettext('Path')],
                            ['state', gettext('State')],
                            ['checker-state', gettext('Checker')],
                            ['ana-state', 'ANA'],
                            ['host-wwpn', gettext('Host WWPN')],
                            ['target-wwpn', gettext('Target WWPN')],
                            ['address', gettext('Address')],
                        ];
                        let paths = values['path-list'] || [];
                        columns = columns.filter(([key]) =>
                            paths.some((path) => path[key] !== undefined),
                        );
                        let headers = columns
                            .map(([, label]) => `<th>${Ext.htmlEncode(label)}</th>`)
                            .join('');
                        let rows = paths
                            .map(
                                (path) =>
                                    '<tr>' +
                                    columns
                                        .map(
                                            ([key]) =>
                                                `<td>${Ext.htmlEncode(path[key] ?? '')}</td>`,
                                        )
                                        .join('') +
                                    '</tr>',
                            )
                            .join('');
                        return `<table style="border-spacing: 10px 2px;"><tr>${headers}</tr>${rows}</table>`;
                    },
                },
            ],
        },
    ],
    columns: [
        {
            text: gettext('Name'),
            dataIndex: 'display-name',
            flex: 2,
            minWidth: 150,
            renderer: Ext.htmlEncode,
        },
        { text: 'WWID', dataIndex: 'wwid', flex: 2, hidden: true, renderer: Ext.htmlEncode },
        {
            text: gettext('State'),
            dataIndex: 'state',
            width: 140,
            renderer: PVE.SANUtils.renderLunState,
        },
        {
            text: gettext('Multipath'),
            dataIndex: 'multipath',
            width: 150,
            renderer: PVE.SANUtils.renderSanLunMultipath,
        },
        {
            text: gettext('Used By'),
            dataIndex: 'used-by',
            flex: 1,
            renderer: Ext.htmlEncode,
        },
        {
            text: gettext('Device'),
            dataIndex: 'devpath',
            width: 180,
            hidden: true,
            renderer: Ext.htmlEncode,
        },
        {
            text: gettext('Size'),
            dataIndex: 'size',
            width: 100,
            renderer: Proxmox.Utils.render_size,
        },
        {
            text: gettext('Transport'),
            dataIndex: 'transport',
            width: 100,
            renderer: PVE.SANUtils.renderSanTransport,
        },
        { text: 'LUN', dataIndex: 'iscsi-lun', width: 60, hidden: true },
        {
            text: gettext('Vendor'),
            dataIndex: 'vendor',
            width: 100,
            hidden: true,
            renderer: Ext.htmlEncode,
        },
        {
            text: gettext('Model'),
            dataIndex: 'model',
            width: 140,
            hidden: true,
            renderer: Ext.htmlEncode,
        },
        {
            text: gettext('Serial'),
            dataIndex: 'serial',
            width: 140,
            hidden: true,
            renderer: Ext.htmlEncode,
        },
    ],

    initComponent: function () {
        let me = this;
        me.nodename = me.pveSelNode.data.node;
        let noLunsText = me.emptyText;
        me.rstore = Ext.create('Proxmox.data.UpdateStore', {
            storeid: `san-luns-${me.nodename}`,
            model: 'pve-san-lun',
            interval: 5000,
            proxy: {
                type: 'proxmox',
                url: `/api2/json/nodes/${me.nodename}/scan/san-luns`,
            },
        });
        me.store = Ext.create('Proxmox.data.DiffStore', {
            rstore: me.rstore,
            sortAfterUpdate: true,
        });
        let reload = () => me.rstore.load();
        let caps = Ext.state.Manager.get('GuiCap');
        me.tbar = {
            overflowHandler: 'scroller',
            items: [
                { text: gettext('Reload'), iconCls: 'fa fa-refresh', handler: reload },
                {
                    xtype: 'proxmoxButton',
                    text: gettext('Enable Multipath'),
                    disabled: true,
                    enableFn: (rec) =>
                        !!caps.dc['Sys.Modify'] &&
                        rec.get('multipath') === 'none' &&
                        ['fc', 'fcoe'].includes(rec.get('transport')),
                    // the entry is for all nodes unless restricted, which the dialog shows
                    handler: (button, event, rec) =>
                        Ext.create('PVE.dc.MultipathWwidEdit', {
                            wwid: rec.get('wwid'),
                            isCreate: true,
                            autoShow: true,
                            apiCallDone: (success) => success && reload(),
                        }),
                },
                '-',
                {
                    xtype: 'proxmoxButton',
                    text: gettext('Wipe'),
                    iconCls: 'fa fa-eraser',
                    disabled: true,
                    enableFn: (rec) =>
                        Proxmox.UserName === 'root@pam' &&
                        !!rec.get('by-id') &&
                        !rec.get('used-by-storage') &&
                        !rec.get('used-by-process'),
                    handler: (button, event, rec) =>
                        Ext.create('PVE.window.SANLunWipe', {
                            node: me.nodename,
                            lun: rec.data,
                            autoShow: true,
                            taskDone: () => !me.destroyed && reload(),
                        }),
                },
                '->',
                gettext('Search') + ':',
                ' ',
                {
                    xtype: 'pveRecordSearchField',
                    emptyText: gettext('Name, WWID, Storage'),
                    searchFields: [
                        'name',
                        'wwid',
                        'used-by-storage',
                        'used-by-guest',
                        'used-by-process',
                        'vgname',
                        'detail',
                        'multipath-storage',
                        'devpath',
                        'path-search',
                        'vendor',
                        'model',
                        'serial',
                    ],
                    targetStore: me.store,
                    listeners: {
                        // no hit for a search is no sign of a connection problem
                        searchchange: (field, query) =>
                            me.rendered &&
                            me.setEmptyText(
                                query ? gettext('No LUNs match the search.') : noLunsText,
                            ),
                    },
                },
            ],
        };
        me.callParent();
        Proxmox.Utils.monStoreErrors(me, me.rstore);
        me.mon(me.store, 'refresh', () => PVE.SANUtils.deselectHidden(me));
        me.on('activate', () => me.rstore.startUpdate());
        me.on('deactivate', () => me.rstore.stopUpdate());
        me.on('destroy', () => {
            me.store.destroy();
            me.rstore.destroy();
        });
    },
});
