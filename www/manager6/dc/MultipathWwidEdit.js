Ext.define('PVE.dc.MultipathWwidEdit', {
    extend: 'Proxmox.window.Edit',
    subject: gettext('Multipath Entry'),
    isAdd: true,
    onlineHelp: 'storage_multipath',
    width: 520,
    fieldDefaults: { labelWidth: 170 },

    initComponent: function () {
        let me = this;
        me.method = me.isCreate ? 'POST' : 'PUT';
        me.url = '/cluster/multipath/wwid';
        if (!me.isCreate) {
            me.url += `/${encodeURIComponent(me.wwid)}`;
            me.autoLoad = true;
            me.autoLoadOptions = {
                success: (response) => {
                    let values = response.result.data;
                    values.nodes = values.nodes ? values.nodes.split(',') : [];
                    me.setValues(values);
                },
            };
        }
        let wwidField = {
            xtype: 'displayfield',
            name: 'wwid',
            fieldLabel: 'WWID',
            value: me.wwid,
        };
        if (me.isCreate) {
            // editable comboboxes auto-expand on focus and would cover the form
            me.defaultFocus = me.wwid ? 'field[name=alias]' : undefined;
            wwidField = {
                ...wwidField,
                xtype: 'proxmoxComboGrid',
                allowBlank: false,
                maxLength: 128,
                editable: true,
                notFoundIsValid: true, // allow WWIDs only visible on other nodes
                // Enter submits the typed text, also if it only matches a listed WWID in part or
                // in another case, as the list does
                validator: function (value) {
                    let data = this.getStore().getData();
                    let wwids = (data.getSource() ?? data).getRange().map((r) => r.get('wwid'));
                    let typed = value.toLowerCase();
                    return (
                        !value ||
                        wwids.includes(value) ||
                        !wwids.some((wwid) => wwid.toLowerCase().includes(typed)) ||
                        gettext('Select the LUN from the list or enter its full WWID.')
                    );
                },
                autoSelect: false,
                anyMatch: true,
                valueField: 'wwid',
                displayField: 'wwid',
                store: {
                    model: 'pve-san-lun',
                    autoLoad: true,
                    proxy: {
                        type: 'proxmox',
                        url: `/api2/json/nodes/${Proxmox.NodeName}/san/luns`,
                    },
                    // namespaces use native NVMe multipath, the entry API refuses their WWIDs
                    filters: [
                        (rec) =>
                            ['none', 'unmanaged'].includes(rec.get('multipath')) &&
                            !(rec.get('transport') ?? '').startsWith('nvme') &&
                            !/^(?:eui|uuid|nvme)\./.test(rec.get('wwid') ?? ''),
                    ],
                    sorters: 'wwid',
                },
                listConfig: {
                    width: 640,
                    columns: [
                        {
                            header: 'WWID',
                            dataIndex: 'wwid',
                            flex: 1,
                            renderer: Ext.htmlEncode,
                        },
                        {
                            header: gettext('Name'),
                            dataIndex: 'name',
                            width: 100,
                            renderer: Ext.htmlEncode,
                        },
                        {
                            header: gettext('Transport'),
                            dataIndex: 'transport',
                            width: 80,
                            renderer: PVE.SANUtils.renderSanTransport,
                        },
                        {
                            header: gettext('Multipath'),
                            dataIndex: 'multipath',
                            width: 100,
                            renderer: PVE.SANUtils.renderSanLunMultipath,
                        },
                        {
                            header: gettext('Size'),
                            dataIndex: 'size',
                            width: 90,
                            renderer: Proxmox.Utils.render_size,
                        },
                    ],
                },
            };
        }
        me.items = [
            wwidField,
            {
                xtype: 'proxmoxtextfield',
                name: 'alias',
                fieldLabel: gettext('Alias'),
                maxLength: 64,
                deleteEmpty: !me.isCreate,
            },
            {
                xtype: 'pveNodeSelector',
                name: 'nodes',
                fieldLabel: gettext('Nodes'),
                emptyText: gettext('All (No restrictions)'),
                multiSelect: true,
                autoSelect: false,
                allowBlank: true,
                skipEmptyText: true,
                deleteEmpty: !me.isCreate,
            },
            {
                xtype: 'proxmoxKVComboBox',
                name: 'no-path-retry',
                fieldLabel: gettext('When All Paths Fail'),
                deleteEmpty: !me.isCreate,
                editable: true,
                value: '__default__',
                comboItems: [
                    ['__default__', Proxmox.Utils.defaultText],
                    ['queue', gettext('Queue I/O')],
                    ['fail', gettext('Fail I/O')],
                ],
                listeners: {
                    change: (field, value) =>
                        me.down('#queueWarning')?.setHidden(value !== 'queue'),
                },
            },
            {
                xtype: 'displayfield',
                itemId: 'queueWarning',
                userCls: 'pmx-hint',
                hidden: true,
                value: gettext(
                    'While no path works, I/O waits until a path returns. Guests and processes using the LUN can hang, for example if the LUN is deleted on the array before it is removed from the nodes.',
                ),
            },
            {
                xtype: 'proxmoxintegerfield',
                name: 'paths-expected',
                fieldLabel: gettext('Expected Paths'),
                minValue: 1,
                emptyText: Proxmox.Utils.noneText,
                deleteEmpty: !me.isCreate,
                autoEl: {
                    tag: 'div',
                    'data-qtip': gettext(
                        'A node with fewer paths than expected shows the LUN as degraded, even after the kernel has removed a lost path.',
                    ),
                },
            },
        ];
        me.callParent();
    },
});
