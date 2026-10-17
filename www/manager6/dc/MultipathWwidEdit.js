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
        me.items = [
            {
                xtype: me.isCreate ? 'proxmoxtextfield' : 'displayfield',
                name: 'wwid',
                fieldLabel: 'WWID',
                value: me.wwid,
                allowBlank: false,
                maxLength: 128,
            },
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
