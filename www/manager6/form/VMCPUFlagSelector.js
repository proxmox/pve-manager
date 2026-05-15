Ext.define('PVE.form.VMCPUFlagSelector', {
    extend: 'Ext.grid.Panel',
    alias: 'widget.vmcpuflagselector',

    mixins: {
        field: 'Ext.form.field.Field',
    },

    config: {
        // Show only the flags that may be set for a specific VM.
        restrictToVMFlags: true,
    },

    disableSelection: true,
    columnLines: false,
    selectable: false,

    scrollable: 'y',
    height: 200,

    emptyText: gettext('No CPU flags available'),

    store: {
        fields: [
            'name',
            { name: 'state', defaultValue: '=' },
            'description',
            'supported-on',
            'unknown',
        ],
        autoLoad: false,
        proxy: {
            type: 'proxmox',
            url: '/api2/json/nodes/localhost/capabilities/qemu/cpu-flags',
        },
        listeners: {
            update: function () {
                this.commitChanges();
            },
        },
    },

    getValue: function () {
        let me = this;
        let store = me.getStore();

        if (!store.isLoaded()) {
            return me.value;
        }

        let flags = '';

        store.getData().each(function (rec) {
            let s = rec.get('state');
            if (s && s !== '=') {
                let f = rec.get('name');
                if (flags === '') {
                    flags = s + f;
                } else {
                    flags += ';' + s + f;
                }
            }
        });

        return flags;
    },

    setArch: function (arch) {
        let me = this;
        me.arch = arch;
        // Snapshot pending edits so they survive the upcoming store reload.
        if (me.getStore().isLoaded()) {
            me.value = me.getValue();
        }
        let proxy = me.store.getProxy();
        if (arch) {
            proxy.setExtraParam('arch', arch);
        } else {
            delete proxy.extraParams.arch;
        }
        me.store.reload();
    },

    setKvm: function (kvm) {
        let me = this;
        kvm = kvm ?? 1;
        me.kvm = kvm;
        // Snapshot pending edits so they survive the upcoming store reload.
        if (me.getStore().isLoaded()) {
            me.value = me.getValue();
        }
        let proxy = me.store.getProxy();
        proxy.setExtraParam('accel', kvm === 1 ? 'kvm' : 'tcg');
        me.store.reload();
    },

    // Adjusts the store for the current value. Flags not known to the API are added to the store
    // as 'unknown' records so they stay visible and can be edited.
    adjustStoreForValue: function () {
        let me = this;
        let store = me.getStore();
        let value = me.value;

        // Clear any previously added unknown records.
        let unknownRecords = [];
        let source = store.getDataSource();
        source.each((rec) => {
            if (rec.get('unknown')) {
                unknownRecords.push(rec);
            } else {
                rec.set('state', '=');
            }
        });
        store.remove(unknownRecords);

        let newUnknownFlags = [];
        let addUnknownFlag = function (flag, sign) {
            newUnknownFlags.push({
                name: flag,
                state: sign,
                // A TCG-only flag will be flagged as unknown when `accel` is set to `kvm` and vice-versa, hence the very general wording.
                description: gettext(
                    'This flag is not available for the selected acceleration type and/or not supported by any node in the cluster. It is very likely to lead to VM startup failure. You can remove it by setting it to "Default".',
                ),
                unknown: true,
            });
        };

        let flags = value ? value.split(';') : [];
        flags.forEach(function (flag) {
            let sign = flag.substr(0, 1);
            flag = flag.substr(1);

            let rec = source.findBy((r) => r.get('name') === flag);
            if (rec !== null) {
                let supported = rec.get('supported-on');
                // Treat flags that are set in the config but not supported anywhere as unknown
                if (Array.isArray(supported) && supported.length === 0 && sign !== '=') {
                    store.remove(rec);
                    addUnknownFlag(flag, sign);
                } else {
                    rec.set('state', sign);
                    rec.commit();
                }
            } else {
                addUnknownFlag(flag, sign);
            }
        });

        // Make sure unknown flags are displayed at the top of the list
        // so users reconsider them.
        if (newUnknownFlags.length > 0) {
            store.insert(0, newUnknownFlags);
        }

        // Ext.js uses buffered rendering [0] for larger lists like this one.
        // AbstractView.refresh() [1], which was previously used here for refreshing,
        // destroys and recreates all row elements but the buffered renderer only
        // tracks a sliding window of DOM nodes, so the refresh skips rows outside
        // the buffer, which leads to some elements not being fully rendered.
        //
        // Firing the 'refresh' event allows whatever view is currently rendering the
        // table (i.e. buffered or not) to handle it accordingly.
        //
        // [0] https://docs.sencha.com/extjs/7.0.0/classic/Ext.grid.plugin.BufferedRenderer.html
        // [1] https://docs.sencha.com/extjs/7.0.0/classic/Ext.view.AbstractView.html#method-refresh
        store.fireEvent('refresh', store);
    },
    isDirty: function () {
        let me = this;
        return me.originalValue !== me.getValue();
    },
    setValue: function (value) {
        let me = this;

        me.value = value || '';

        if (me.getStore().isLoaded()) {
            me.adjustStoreForValue();
        } // if not yet loaded, the store will trigger the function

        let res = me.mixins.field.setValue.call(me, value);

        return res;
    },
    columns: [
        {
            text: gettext('State'),
            dataIndex: 'state',
            renderer: function (v) {
                switch (v) {
                    case '=':
                        return 'Default';
                    case '-':
                        return 'Off';
                    case '+':
                        return 'On';
                    default:
                        return 'Unknown';
                }
            },
            width: 65,
        },
        {
            text: gettext('Value'),
            xtype: 'widgetcolumn',
            dataIndex: 'state',
            width: 95,
            onWidgetAttach: function (column, widget, record) {
                let val = record.get('state') || '=';
                widget.down('[inputValue=' + val + ']').setValue(true);
                // TODO: disable if selected CPU model and flag are incompatible
            },
            widget: {
                xtype: 'radiogroup',
                hideLabel: true,
                layout: 'hbox',
                validateOnChange: false,
                value: '=',
                listeners: {
                    change: function (f, value) {
                        let v = Object.values(value)[0];
                        f.getWidgetRecord().set('state', v);

                        let view = this.up('grid');
                        view.dirty = view.getValue() !== view.originalValue;
                        view.checkDirty();
                        //view.checkChange();
                    },
                },
                items: [
                    {
                        boxLabel: '-',
                        boxLabelAlign: 'before',
                        inputValue: '-',
                        isFormField: false,
                    },
                    {
                        checked: true,
                        inputValue: '=',
                        isFormField: false,
                    },
                    {
                        boxLabel: '+',
                        inputValue: '+',
                        isFormField: false,
                    },
                ],
            },
        },
        {
            text: gettext('Flag'),
            dataIndex: 'name',
            width: 100,
        },
        {
            text: gettext('Description'),
            dataIndex: 'description',
            sortable: false,
            cellWrap: true,
            flex: 3,
        },
        {
            text: gettext('Supported On'),
            dataIndex: 'supported-on',
            cellWrap: true,
            flex: 1,
            renderer: (v) => (Array.isArray(v) ? v.join(', ') : ''),
        },
    ],
    initComponent: function () {
        let me = this;

        me.value = me.originalValue = '';

        me.callParent(arguments);

        me.initialized = true;

        me.getStore().on('load', function (store, _, success) {
            if (success) {
                me.adjustStoreForValue();
                me.checkDirty();
            }
        });

        if (!me.restrictToVMFlags) {
            me.getStore().getProxy().setUrl('/api2/json/cluster/qemu/cpu-flags');
            me.getStore().load();
        }
    },
});
