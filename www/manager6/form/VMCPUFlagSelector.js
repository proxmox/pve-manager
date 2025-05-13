Ext.define('PVE.form.VMCPUFlagSelector', {
    extend: 'Ext.grid.Panel',
    alias: 'widget.vmcpuflagselector',

    mixins: {
        field: 'Ext.form.field.Field',
    },

    disableSelection: true,
    columnLines: false,
    selectable: false,
    hideHeaders: true,

    scrollable: 'y',
    height: 200,

    unkownFlags: [],

    store: {
        type: 'store',
        fields: ['flag', { name: 'state', defaultValue: '=' }, 'desc'],
        data: [
            // FIXME: let qemu-server host this and autogenerate or get from API call??
            {
                flag: 'md-clear',
                desc: 'Required to let the guest OS know if MDS is mitigated correctly',
            },
            {
                flag: 'pcid',
                desc: 'Meltdown fix cost reduction on Westmere, Sandy-, and IvyBridge Intel CPUs',
            },
            { flag: 'spec-ctrl', desc: 'Allows improved Spectre mitigation with Intel CPUs' },
            { flag: 'ssbd', desc: 'Protection for "Speculative Store Bypass" for Intel models' },
            { flag: 'ibpb', desc: 'Allows improved Spectre mitigation with AMD CPUs' },
            {
                flag: 'virt-ssbd',
                desc: 'Basis for "Speculative Store Bypass" protection for AMD models',
            },
            {
                flag: 'amd-ssbd',
                desc: 'Improves Spectre mitigation performance with AMD CPUs, best used with "virt-ssbd"',
            },
            {
                flag: 'amd-no-ssb',
                desc: 'Notifies guest OS that host is not vulnerable for Spectre on AMD CPUs',
            },
            {
                flag: 'pdpe1gb',
                desc: 'Allow guest OS to use 1GB size pages, if host HW supports it',
            },
            {
                flag: 'hv-tlbflush',
                desc: 'Improve performance in overcommitted Windows guests. May lead to guest bluescreens on old CPUs.',
            },
            {
                flag: 'hv-evmcs',
                desc: 'Improve performance for nested virtualization. Only supported on Intel CPUs.',
            },
            { flag: 'aes', desc: 'Activate AES instruction set for HW acceleration.' },
        ],
        listeners: {
            update: function () {
                this.commitChanges();
            },
        },
    },

    getValue: function () {
        var me = this;
        var store = me.getStore();
        var flags = '';

        // ExtJS does not has a nice getAllRecords interface for stores :/
        store.queryBy(Ext.returnTrue).each(function (rec) {
            var s = rec.get('state');
            if (s && s !== '=') {
                let f = rec.get('flag');
                if (flags === '') {
                    flags = s + f;
                } else {
                    flags += ';' + s + f;
                }
            }
        });

        flags += me.unkownFlags.join(';');

        return flags;
    },

    setValue: function (value) {
        var me = this;
        var store = me.getStore();

        me.value = value || '';

        me.unkownFlags = [];

        me.getStore()
            .queryBy(Ext.returnTrue)
            .each(function (rec) {
                rec.set('state', '=');
            });

        var flags = value ? value.split(';') : [];
        flags.forEach(function (flag) {
            var sign = flag.substr(0, 1);
            flag = flag.substr(1);

            var rec = store.findRecord('flag', flag, 0, false, true, true);
            if (rec !== null) {
                rec.set('state', sign);
            } else {
                me.unkownFlags.push(flag);
            }
        });
        store.reload();

        var res = me.mixins.field.setValue.call(me, value);

        return res;
    },
    columns: [
        {
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
            xtype: 'widgetcolumn',
            dataIndex: 'state',
            width: 95,
            onWidgetAttach: function (column, widget, record) {
                var val = record.get('state') || '=';
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
                        var v = Object.values(value)[0];
                        f.getWidgetRecord().set('state', v);

                        var view = this.up('grid');
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
            dataIndex: 'flag',
            width: 100,
        },
        {
            dataIndex: 'desc',
            cellWrap: true,
            flex: 1,
        },
    ],

    initComponent: function () {
        var me = this;

        // static class store, thus gets not recreated, so ensure defaults are set!
        me.getStore().data.forEach(function (v) {
            v.state = '=';
        });

        me.value = me.originalValue = '';

        me.callParent(arguments);
    },
});
