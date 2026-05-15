Ext.define('PVE.dc.CPUTypeEdit', {
    extend: 'Proxmox.window.Edit',
    alias: ['widget.pveCpuTypeEdit'],
    mixins: ['Proxmox.Mixin.CBind'],

    subject: gettext('CPU Type'),

    // Avoid default-focusing the reported model dropdown while still
    // focusing the name textfield if it is editable
    defaultFocus: 'textfield',

    onlineHelp: '_cpu_type',

    height: 600,
    width: 800,

    cbindData: {
        cputype: '',
        isCreate: (cfg) => !cfg.cputype,
    },

    cbind: {
        autoLoad: (get) => !get('isCreate'),
        url: (get) => `/api2/extjs/cluster/qemu/custom-cpu-models/${get('cputype')}`,
        method: (get) => (get('isCreate') ? 'POST' : 'PUT'),
        isCreate: (get) => get('isCreate'),
    },

    items: [
        {
            xtype: 'inputpanel',
            onGetValues: function (values) {
                let win = this.up('window');

                PVE.Utils.delete_if_default(values, 'reported-model', '', win.isCreate);
                PVE.Utils.delete_if_default(values, 'hv-vendor-id', '', win.isCreate);
                PVE.Utils.delete_if_default(values, 'phys-bits', '', win.isCreate);
                PVE.Utils.delete_if_default(values, 'hidden', 0, win.isCreate);
                PVE.Utils.delete_if_default(values, 'flags', '', win.isCreate);

                if (win.isCreate) {
                    delete values.delete;
                }

                return values;
            },
            column1: [
                {
                    xtype: 'pmxDisplayEditField',
                    fieldLabel: gettext('Name'),
                    cbind: {
                        editable: '{isCreate}',
                        value: '{cputype}',
                    },
                    name: 'cputype',
                    renderer: (val) => val.replace(/^custom-/, ''),
                    allowBlank: false,
                },
                {
                    xtype: 'CPUModelSelector',
                    fieldLabel: gettext('Base Model'),
                    showCustomModels: false,
                    name: 'reported-model',
                    autoEl: {
                        tag: 'div',
                        'data-qtip': gettext(
                            'CPU model the rest of the configuration is based on.',
                        ),
                    },
                    cbind: {
                        allowBlank: (get) => !get('isCreate'),
                    },
                    listeners: {
                        afterrender: function (field) {
                            let win = field.up('window');
                            if (win.isCreate) {
                                field.setEmptyText('');
                            }
                        },
                    },
                },
                {
                    xtype: 'textfield',
                    fieldLabel: gettext('Hyper-V Vendor'),
                    name: 'hv-vendor-id',
                    allowBlank: true,
                    emptyText: gettext('None'),
                    maxLength: 12,
                },
                {
                    xtype: 'radiogroup',
                    fieldLabel: gettext('Acceleration'),
                    layout: 'hbox',
                    validateOnChange: false,
                    items: [
                        {
                            boxLabel: 'KVM',
                            inputValue: 1,
                            name: 'kvm',
                            checked: true,
                            isFormField: false,
                        },
                        {
                            boxLabel: 'TCG',
                            inputValue: 0,
                            name: 'kvm',
                            margin: '0 0 0 10',
                            isFormField: false,
                        },
                    ],
                    listeners: {
                        change: function (field, value) {
                            let panel = field.up('pveCpuTypeEdit');
                            panel.lookup('cpuFlags').setKvm(value.kvm);
                        },
                    },
                },
                {
                    xtype: 'displayfield',
                    userCls: 'pmx-hint',
                    value: gettext(
                        'This setting only filters the flag list shown below.' +
                            ' Assigning this model to a VM still requires matching the' +
                            " VM's 'kvm' setting (1 for KVM, 0 for TCG).",
                    ),
                },
            ],
            column2: [
                {
                    xtype: 'checkbox',
                    fieldLabel: gettext('Hidden'),
                    name: 'hidden',
                    inputValue: 1,
                    uncheckedValue: 0,
                },
                {
                    xtype: 'PhysBitsSelector',
                    fieldLabel: gettext('Phys-Bits'),
                    name: 'phys-bits',
                },
            ],
            columnB: [
                {
                    xtype: 'vmcpuflagselector',
                    fieldLabel: gettext('Extra CPU flags'),
                    name: 'flags',
                    reference: 'cpuFlags',
                    restrictToVMFlags: false,
                    height: 380,
                },
            ],
        },
    ],
});
