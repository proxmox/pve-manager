/// Used only for the wizard to combine the cd input panel and the ostype panel

Ext.define('PVE.qemu.OSPanel', {
    extend: 'Ext.panel.Panel',
    xtype: 'pveQemuOSPanel',

    layout: 'hbox',
    defaults: {
        flex: 1,
        padding: '0 10',
    },

    controller: {
        xclass: 'Ext.app.ViewController',
        control: {
            'combobox[name=osbase]': {
                change: 'onOSBaseChange',
            },
            'combobox[name=ostype]': {
                afterrender: 'onOSTypeChange',
                change: 'onOSTypeChange',
            },
            'checkbox[reference=enableSecondCD]': {
                change: 'onSecondCDChange',
            },
        },
        onOSBaseChange: function (field, value) {
            let me = this;
            let isWindows = value === 'Microsoft Windows';
            let enableSecondCD = me.lookup('enableSecondCD');
            enableSecondCD.setVisible(isWindows);
            if (!isWindows) {
                enableSecondCD.setValue(false);
            }
        },
        onOSTypeChange: function (field) {
            var me = this,
                ostype = field.getValue();
            var targetValues = PVE.qemu.OSDefaults.getDefaults(ostype);

            me.setWidget('pveBusSelector', targetValues.busType);
            me.setWidget('pveNetworkCardSelector', targetValues.networkCard);
            me.setWidget('CPUModelSelector', targetValues.cputype);
            var scsihw = targetValues.scsihw || '__default__';
            this.getViewModel().set('current.scsihw', scsihw);
            this.getViewModel().set('current.ostype', ostype);
        },
        setWidget: function (widget, newValue) {
            // changing a widget is safe only if ComponentQuery.query returns us
            // a single value array
            var widgets = Ext.ComponentQuery.query('pveQemuCreateWizard ' + widget);
            if (widgets.length === 1) {
                widgets[0].setValue(newValue);
            } else {
                // ignore multiple disks, we only want to set the type if there is a single disk
            }
        },
        onSecondCDChange: function (widget, value, lastValue) {
            let me = this;
            let vm = me.getViewModel();
            let updateVMConfig = function () {
                let widgets = Ext.ComponentQuery.query('pveMultiHDPanel');
                if (widgets.length === 1) {
                    widgets[0].getController().updateVMConfig();
                }
            };
            if (value) {
                // only for windows
                vm.set('current.ide0', 'some');
                vm.notify();
                updateVMConfig();
                me.setWidget('pveBusSelector', 'scsi');
                me.setWidget('pveNetworkCardSelector', 'virtio');
            } else {
                vm.set('current.ide0', '');
                vm.notify();
                updateVMConfig();
                me.setWidget('pveBusSelector', 'scsi');
                let ostype = me.getView().down('[name=ostype]').getValue();
                let targetValues = PVE.qemu.OSDefaults.getDefaults(ostype);
                me.setWidget('pveBusSelector', targetValues.busType);
            }
        },
    },

    items: [
        {
            xtype: 'pveQemuCDInputPanel',
            reference: 'cdSelector',
            bind: {
                nodename: '{nodename}',
            },
            confid: 'ide2',
            insideWizard: true,
        },
        {
            xtype: 'container',
            layout: {
                type: 'vbox',
                align: 'stretch',
            },
            defaults: {
                flex: 1,
            },
            items: [
                {
                    xtype: 'displayfield',
                    value: gettext('Guest OS') + ':',
                },
                {
                    xtype: 'pveQemuOSTypePanel',
                    insideWizard: true,
                },
                {
                    xtype: 'inputpanel',
                    items: [
                        {
                            xtype: 'proxmoxcheckbox',
                            reference: 'enableSecondCD',
                            isFormField: false,
                            hidden: true,
                            checked: false,
                            boxLabel: gettext('Add additional drive for VirtIO drivers'),
                            listeners: {
                                change: function (cb, value) {
                                    let me = this.up('pveQemuOSPanel');
                                    me.lookup('isoSelector').setDisabled(!value);
                                    me.lookup('isoSelector').setHidden(!value);
                                },
                            },
                        },
                        {
                            xtype: 'pveIsoSelector',
                            reference: 'isoSelector',
                            name: 'ide0',
                            insideWizard: true,
                            hidden: true,
                            disabled: true,
                            bind: {
                                nodename: '{nodename}',
                            },
                        },
                    ],
                },
            ],
        },
    ],
});
