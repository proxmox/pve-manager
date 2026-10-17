Ext.define('PVE.storage.IScsiScan', {
    extend: 'PVE.form.ComboBoxSetStoreNode',
    alias: 'widget.pveIScsiScan',

    queryParam: 'portal',
    valueField: 'target',
    displayField: 'target',
    matchFieldWidth: false,
    allowBlank: false,

    listConfig: {
        width: 350,
        columns: [
            {
                dataIndex: 'target',
                flex: 1,
            },
        ],
        emptyText: PVE.Utils.renderNotFound(gettext('iSCSI Target')),
    },

    config: {
        apiSuffix: '/scan/iscsi',
    },

    showNodeSelector: true,

    reload: function () {
        let me = this;
        if (!me.isDisabled()) {
            me.getStore().load();
        }
    },

    setPortal: function (portal) {
        let me = this;
        me.portal = portal;
        me.getStore().getProxy().setExtraParams({ portal });
        me.reload();
    },

    setNodeName: function (value) {
        let me = this;
        me.callParent([value]);
        me.reload();
    },

    initComponent: function () {
        let me = this;

        if (!me.nodename) {
            me.nodename = 'localhost';
        }

        let store = Ext.create('Ext.data.Store', {
            fields: ['target', 'portal'],
            proxy: {
                type: 'proxmox',
                url: `${me.apiBaseUrl}${me.nodename}${me.apiSuffix}`,
            },
        });
        store.sort('target', 'ASC');

        Ext.apply(me, {
            store: store,
        });

        me.callParent();
    },
});

Ext.define('PVE.storage.IScsiInputPanel', {
    extend: 'PVE.panel.StorageBase',
    mixins: ['Proxmox.Mixin.CBind'],

    onlineHelp: 'storage_open_iscsi',

    lunContent: 'images',

    // Loading sets the value before its original value, so use the dirty state.
    updateMultipathActivation: function () {
        let me = this;
        let field = me.down('field[name=managed-multipath]');
        me.lookup('multipathActivation').setHidden(
            me.isCreate || !field.getValue() || !field.isDirty(),
        );
    },

    onGetValues: function (values) {
        let me = this;

        values.content = values.luns ? me.lunContent : 'none';
        delete values.luns;

        return me.callParent([values]);
    },

    setValues: function (values) {
        let me = this;

        values.luns = PVE.Utils.contentAllows(values.content, 'vm-vol');
        if (values.luns) {
            me.lunContent = Ext.Array.from(values.content).join(',');
        }
        me.callParent([values]);
    },

    column1: [
        {
            xtype: 'pmxDisplayEditField',
            cbind: {
                editable: '{isCreate}',
            },

            name: 'portal',
            value: '',
            fieldLabel: 'Portal',
            allowBlank: false,

            editConfig: {
                listeners: {
                    change: {
                        fn: function (f, value) {
                            let panel = this.up('inputpanel');
                            // only the target selector of the add dialog follows the portal
                            if (!panel.isCreate) {
                                return;
                            }
                            let exportField = panel.lookup('iScsiTargetScan');
                            if (exportField) {
                                exportField.setDisabled(!value);
                                exportField.setPortal(value);
                                exportField.setValue('');
                            }
                        },
                        buffer: 500,
                    },
                },
            },
        },
        {
            cbind: {
                xtype: (get) => (get('isCreate') ? 'pveIScsiScan' : 'displayfield'),
                readOnly: '{!isCreate}',
                disabled: '{isCreate}',
            },

            name: 'target',
            value: '',
            fieldLabel: gettext('Target'),
            allowBlank: false,
            reference: 'iScsiTargetScan',
            listeners: {
                nodechanged: function (value) {
                    this.up('inputpanel').lookup('storageNodeRestriction').setValue(value);
                },
            },
        },
    ],

    column2: [
        {
            xtype: 'checkbox',
            name: 'luns',
            checked: true,
            fieldLabel: gettext('Use LUNs directly'),
        },
        {
            xtype: 'proxmoxcheckbox',
            name: 'managed-multipath',
            fieldLabel: gettext('Multipath'),
            cbind: {
                deleteEmpty: '{!isCreate}',
            },
            autoEl: {
                tag: 'div',
                'data-qtip': gettext(
                    'Combine the paths of each LUN into one device on every node using the storage.',
                ),
            },
            listeners: {
                change: (field) => field.up('inputpanel').updateMultipathActivation(),
                dirtychange: (field) => field.up('inputpanel').updateMultipathActivation(),
            },
        },
        {
            xtype: 'displayfield',
            reference: 'multipathActivation',
            userCls: 'pmx-hint',
            htmlEncode: false,
            hidden: true,
            cbind: {
                value: () =>
                    Ext.String.format(
                        gettext(
                            'Active logical volumes and guests using individual paths do not switch to the multipath map. Check their device dependencies before relying on path redundancy (<a href="{0}" target="_blank" rel="noopener noreferrer">documentation</a>).',
                        ),
                        Ext.htmlEncode(Proxmox.Utils.get_help_link('storage_multipath')),
                    ),
            },
        },
    ],
});
