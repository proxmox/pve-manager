Ext.define('PVE.storage.NVMeOFScan', {
    extend: 'PVE.storage.IScsiScan',
    alias: 'widget.pveNVMeOFScan',

    valueField: 'subsysnqn',
    displayField: 'subsysnqn',
    scanFields: ['subsysnqn', 'portals'],

    listConfig: {
        width: 650,
        columns: [
            {
                dataIndex: 'subsysnqn',
                flex: 1,
                renderer: Ext.htmlEncode,
            },
        ],
        emptyText: PVE.Utils.renderNotFound(gettext('Subsystem')),
    },

    config: {
        apiSuffix: '/scan/nvmeof',
    },
});

Ext.define('PVE.storage.NVMeOFInputPanel', {
    extend: 'PVE.panel.StorageBase',
    mixins: ['Proxmox.Mixin.CBind'],

    onlineHelp: 'storage_nvmeof',

    namespaceContent: 'images',

    onGetValues: function (values) {
        let me = this;

        values.content = values.namespaces ? me.namespaceContent : 'none';
        delete values.namespaces;

        return me.callParent([values]);
    },

    // a storage can be restricted to some volume types, keep its content types then
    setValues: function (values) {
        let me = this;

        values.namespaces = PVE.Utils.contentAllows(values.content, 'vm-vol');
        if (values.namespaces) {
            me.namespaceContent = Ext.Array.from(values.content).join(',');
        }
        me.callParent([values]);
    },

    column1: [
        {
            xtype: 'textfield',
            name: 'discovery-portal',
            fieldLabel: gettext('Discovery Portal'),
            allowBlank: true,
            validator: (value) => PVE.SANUtils.validateNVMePortals(value),
            submitValue: false,
            cbind: {
                hidden: '{!isCreate}',
                disabled: '{!isCreate}',
            },
            listeners: {
                change: function (field, value) {
                    let panel = field.up('inputpanel');
                    let scan = panel.lookup('subsystemScan');
                    scan.setPortal('');
                    scan.setHideTrigger(true);
                    scan.setValue('');
                    scan.getStore().removeAll();
                    panel.down('field[name=portals]')?.setValue('');
                    let typed = (value ?? '').trim();
                    let portal = typed && PVE.SANUtils.nvmePortalValid(typed) ? typed : '';
                    field.discovery ??= new Ext.util.DelayedTask();
                    field.discovery.delay(500, () => {
                        if (portal && !scan.destroyed) {
                            scan.setHideTrigger(false);
                            scan.setPortal(portal);
                        }
                    });
                },
                destroy: (field) => field.discovery?.cancel(),
            },
        },
        {
            xtype: 'checkbox',
            name: 'namespaces',
            boxLabel: gettext('Use namespaces directly'),
        },
    ],

    // NQNs and portal lists are longer than a column is wide
    columnB: [
        {
            cbind: {
                xtype: (get) => (get('isCreate') ? 'pveNVMeOFScan' : 'displayfield'),
                hideTrigger: '{isCreate}',
            },
            editable: true,
            notFoundIsValid: true,
            expand: function () {
                if (this.portal) {
                    this.self.prototype.expand.call(this);
                }
            },
            name: 'subsysnqn',
            value: '',
            fieldLabel: gettext('Subsystem'),
            // shown when editing; an NQN wraps best at the line end, not at its first hyphen
            fieldStyle: 'word-break: break-all;',
            allowBlank: false,
            reference: 'subsystemScan',
            listeners: {
                change: function (field, value) {
                    let rec = field
                        .getStore?.()
                        .findRecord('subsysnqn', value, 0, false, true, true);
                    if (rec) {
                        field
                            .up('inputpanel')
                            .down('field[name=portals]')
                            .setValue(rec.get('portals'));
                    }
                },
                nodechanged: function (value) {
                    this.up('inputpanel').lookup('storageNodeRestriction').setValue(value);
                },
            },
        },
        {
            xtype: 'textfield',
            name: 'portals',
            fieldLabel: gettext('Portals'),
            allowBlank: false,
            allowOnlyWhitespace: false,
            validator: (value) => PVE.SANUtils.validateNVMePortals(value, true),
        },
    ],

    advancedColumn1: [
        {
            xtype: 'proxmoxintegerfield',
            name: 'fast-io-fail-tmo',
            fieldLabel: gettext('Fail I/O After (s)'),
            minValue: -1,
            emptyText: '120',
            cbind: {
                deleteEmpty: '{!isCreate}',
            },
            autoEl: {
                tag: 'div',
                'data-qtip': gettext('Applies to newly connected paths. -1 disables the timeout.'),
            },
        },
    ],
});
