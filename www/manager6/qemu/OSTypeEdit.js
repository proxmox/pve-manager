Ext.define('PVE.qemu.OSTypeInputPanel', {
    extend: 'Proxmox.panel.InputPanel',
    alias: 'widget.pveQemuOSTypePanel',
    onlineHelp: 'qm_os_settings',
    insideWizard: false,

    controller: {
        xclass: 'Ext.app.ViewController',
        control: {
            'combobox[name=osbase]': {
                change: 'onOSBaseChange',
            },
        },
        onOSBaseChange: function (field, value) {
            let me = this;
            me.lookup('ostype').getStore().setData(PVE.Utils.kvm_ostypes[value]);
        },
    },

    onGetValues: function (values) {
        if (values.ide0) {
            let drive = {
                media: 'cdrom',
                file: values.ide0,
            };
            values.ide0 = PVE.Parser.printQemuDrive(drive);
        }
        return values;
    },

    initComponent: function () {
        var me = this;

        me.items = [
            {
                xtype: 'combobox',
                submitValue: false,
                name: 'osbase',
                fieldLabel: gettext('Type'),
                editable: false,
                queryMode: 'local',
                value: 'Linux',
                store: Object.keys(PVE.Utils.kvm_ostypes),
            },
            {
                xtype: 'combobox',
                name: 'ostype',
                reference: 'ostype',
                fieldLabel: gettext('Version'),
                value: 'l26',
                allowBlank: false,
                editable: false,
                queryMode: 'local',
                valueField: 'val',
                displayField: 'desc',
                store: {
                    fields: ['desc', 'val'],
                    data: PVE.Utils.kvm_ostypes.Linux,
                    listeners: {
                        datachanged: function (store) {
                            var ostype = me.lookup('ostype');
                            var old_val = ostype.getValue();
                            if (!me.insideWizard && old_val && store.find('val', old_val) !== -1) {
                                ostype.setValue(old_val);
                            } else {
                                ostype.setValue(store.getAt(0));
                            }
                        },
                    },
                },
            },
        ];

        me.callParent();
    },
});

Ext.define('PVE.qemu.OSTypeEdit', {
    extend: 'Proxmox.window.Edit',

    subject: 'OS Type',

    items: [{ xtype: 'pveQemuOSTypePanel' }],

    initComponent: function () {
        var me = this;

        me.callParent();

        me.load({
            success: function (response, options) {
                var value = response.result.data.ostype || 'other';
                var osinfo = PVE.Utils.get_kvm_osinfo(value);
                me.setValues({ ostype: value, osbase: osinfo.base });
            },
        });
    },
});
