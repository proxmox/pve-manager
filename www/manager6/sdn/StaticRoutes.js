Ext.define('PVE.sdn.StaticRouteEdit', {
    extend: 'Proxmox.window.Edit',

    subject: gettext('Static Route'),
    width: 450,
    isAdd: true,
    url: '#',

    fieldDefaults: {
        labelWidth: 150,
    },

    items: [
        {
            xtype: 'textfield',
            name: 'prefix',
            fieldLabel: gettext('Destination Prefix'),
            vtype: 'IP64FullRangeCIDRAddress',
            allowBlank: false,
        },
        {
            xtype: 'proxmoxtextfield',
            name: 'via',
            fieldLabel: gettext('Gateway'),
            vtype: 'IP64Address',
            skipEmptyText: true,
            validator: function (value) {
                let iface = this.up('window').down('[name=iface]')?.getValue();
                return value || iface
                    ? true
                    : gettext('Either a gateway or an interface is required.');
            },
            listeners: {
                change: function (field) {
                    field.up('window').down('[name=iface]')?.validate();
                },
            },
        },
        {
            xtype: 'proxmoxtextfield',
            name: 'iface',
            fieldLabel: gettext('Outgoing Interface'),
            maxLength: 15,
            regex: /^[^\s,=/]+$/,
            skipEmptyText: true,
            validator: function (value) {
                let via = this.up('window').down('[name=via]')?.getValue();
                if (!value && !via) {
                    return gettext('Either a gateway or an interface is required.');
                }
                if (!value && /^fe[89ab][0-9a-f]:/i.test(via)) {
                    return gettext('An interface is required for an IPv6 link-local gateway.');
                }
                return true;
            },
            listeners: {
                change: function (field) {
                    field.up('window').down('[name=via]')?.validate();
                },
            },
        },
        {
            xtype: 'proxmoxintegerfield',
            name: 'distance',
            fieldLabel: gettext('Distance'),
            minValue: 1,
            maxValue: 255,
            allowBlank: true,
        },
    ],

    submit: function () {
        let me = this;
        if (me.isValid()) {
            me.onSave(me.getValues());
            me.close();
        }
    },
});

Ext.define('PVE.sdn.StaticRoutes', {
    extend: 'Ext.grid.Panel',
    alias: 'widget.pveSDNStaticRoutes',
    mixins: ['Ext.form.field.Field'],

    isCreate: false,
    value: [],
    height: 250,

    store: {
        fields: [
            'route',
            ...['prefix', 'via', 'iface', 'distance'].map((name) => ({
                name,
                calculate: (data) => data.route[name],
            })),
        ],
        data: [],
    },

    viewConfig: {
        emptyText: gettext('No static routes configured'),
        deferEmptyText: false,
    },

    columns: [
        {
            text: gettext('Destination Prefix'),
            dataIndex: 'prefix',
            flex: 2,
            renderer: Ext.htmlEncode,
        },
        {
            text: gettext('Gateway'),
            dataIndex: 'via',
            flex: 2,
            renderer: Ext.htmlEncode,
        },
        {
            text: gettext('Interface'),
            dataIndex: 'iface',
            flex: 1,
            renderer: Ext.htmlEncode,
        },
        {
            text: gettext('Distance'),
            dataIndex: 'distance',
            width: 80,
            renderer: Ext.htmlEncode,
        },
    ],

    editRoute: function (record) {
        let me = this;
        let win = Ext.create('PVE.sdn.StaticRouteEdit', {
            isCreate: !record,
            onSave: function (values) {
                if (record) {
                    record.set('route', values);
                } else {
                    me.getStore().add({ route: values });
                }
            },
        });
        if (record) {
            win.setValues(record.get('route'));
        }
        win.show();
    },

    isEqual: function (value1, value2) {
        return JSON.stringify(value1) === JSON.stringify(value2);
    },

    getValue: function () {
        return this.getStore()
            .getRange()
            .map((record) => PVE.Parser.printPropertyString(record.get('route')));
    },

    setValue: function (value) {
        let me = this;
        me.getStore().setData(
            (value ?? []).map((route) => ({ route: PVE.Parser.parsePropertyString(route) })),
        );
        me.checkChange();
        return me;
    },

    getSubmitData: function () {
        let me = this;
        if (!me.submitValue) {
            return null;
        }
        let value = me.getValue();
        if (value.length) {
            return me.disabled ? null : { [me.getName()]: value };
        }
        if (me.isCreate) {
            return null;
        }
        // The grid gets disabled together with the setting it depends on, e.g. the dedicated VRF
        // of a zone. If the routes were cleared in the same edit, still submit their deletion, as
        // the API only allows disabling that setting once no routes are configured.
        if (me.disabled && !me.originalValue?.length) {
            return null;
        }
        return { delete: me.getName() };
    },

    // The grid cannot show field errors itself. Proxmox.window.Edit marks the API errors on the
    // form before it shows them in the error dialog, so these must exist but need not do anything.
    markInvalid: Ext.emptyFn,
    clearInvalid: Ext.emptyFn,

    initComponent: function () {
        let me = this;
        let sm = Ext.create('Ext.selection.RowModel');

        me.selModel = sm;
        me.tbar = [
            {
                text: gettext('Add'),
                handler: () => me.editRoute(),
            },
            {
                xtype: 'proxmoxButton',
                text: gettext('Edit'),
                disabled: true,
                selModel: sm,
                handler: () => me.editRoute(sm.getSelection()[0]),
            },
            {
                xtype: 'proxmoxButton',
                text: gettext('Remove'),
                disabled: true,
                selModel: sm,
                handler: () => me.getStore().remove(sm.getSelection()),
            },
        ];

        me.callParent();
        me.initField();
        me.mon(me.getStore(), {
            datachanged: me.checkChange,
            update: me.checkChange,
            scope: me,
        });
        me.on('itemdblclick', (grid, record) => me.editRoute(record));
    },
});
