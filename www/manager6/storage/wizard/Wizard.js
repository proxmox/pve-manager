Ext.define('PVE.storage.wizard.SAN', {
    extend: 'PVE.window.Wizard',
    width: 1050,
    height: 620,

    statics: {
        subject: (type) =>
            Ext.String.format(gettext('LVM on {0}'), PVE.Utils.format_storage_type(type)),

        // a validator of a Nodes field, which ExtJS calls with the field as this
        validateNodes: function () {
            let nodes = [].concat(this.getValue() || []).filter(Boolean);
            return (
                !nodes.length ||
                nodes.includes(Proxmox.NodeName) ||
                Ext.String.format(
                    gettext('Must include node "{0}", which sets up the volume group.'),
                    Proxmox.NodeName,
                )
            );
        },
    },

    showError: function (message) {
        if (this.destroyed) {
            return;
        }
        this.down('#submit').enable();
        Ext.Msg.alert(gettext('Error'), message);
    },

    volumeSettings: function () {
        let me = this;
        let value = (name) => me.down(`field[name=${name}]`).getValue();
        return {
            storage: value('storage'),
            vgname: value('vgname'),
            'snapshot-as-volume-chain': value('snapshot-as-volume-chain') ? 1 : 0,
            nodes: me.connection.nodes,
        };
    },

    // Adds the LVM storage with the volume settings as the last request of a setup. Only the node
    // serving the web UI looked at the LUN, so show its state on the other nodes afterwards.
    addLVMStorage: function (values, failure) {
        let me = this;
        let params = { type: 'lvm', shared: 1, content: 'images,rootdir', ...values };
        if (!params.nodes) {
            delete params.nodes;
        }
        Proxmox.Utils.API2Request({
            url: '/storage',
            method: 'POST',
            params,
            waitMsgTarget: me,
            failure,
            success: function () {
                // the storage is added, also if the setup got closed in the meantime
                if (me.destroyed) {
                    return;
                }
                let wwid = me.down('#luns').getSelection().wwid;
                me.close();
                Ext.create('PVE.window.SANLunState', {
                    wwid,
                    storage: values.storage,
                    nodes: params.nodes,
                    autoShow: true,
                });
            },
        });
    },

    multipathSummary: function (lun) {
        // an explicit entry takes precedence, also for a LUN of the connection storage
        if (lun.multipath === 'manual') {
            return PVE.SANUtils.multipathText('manual');
        }
        return PVE.SANUtils.multipathText('storage', this.connection.storage);
    },

    updateSummary: function () {
        let me = this;
        let values = me.volumeSettings();
        let lun = me.down('#luns').getSelection();
        let rows = [
            [gettext('Connection Storage'), me.connection.storage],
            [gettext('Storage ID'), values.storage],
            [gettext('Volume Group'), values.vgname],
            ['WWID', lun.wwid],
            [gettext('Multipath'), me.multipathSummary(lun)],
            [gettext('Size'), Proxmox.Utils.format_size(lun.size)],
            [gettext('Nodes'), values.nodes || gettext('All (No restrictions)')],
            [
                gettext('Allow Snapshots as Volume-Chain'),
                Proxmox.Utils.format_boolean(values['snapshot-as-volume-chain']),
            ],
        ];
        me.down('#summary')
            .getStore()
            .setData(rows.map(([key, value]) => ({ key, value })));
    },

    finish: function () {
        let me = this;
        let values = me.volumeSettings();
        let lun = me.down('#luns').getSelection();
        me.down('#submit').disable();
        me.createStorage(values, lun);
    },

    initComponent: function () {
        let me = this;
        me.subject = PVE.storage.wizard.SAN.subject(me.wizardType);
        me.title = Proxmox.Utils.dialog_title(me.subject, true, true);
        let common = PVE.panel.StorageBase.commonFields(true);
        let settings = {
            xtype: 'inputpanel',
            title: gettext('Volume Group'),
            onlineHelp: 'storage_multipath',
            items: [
                { ...common.id, fieldLabel: gettext('Storage ID') },
                {
                    xtype: 'textfield',
                    name: 'vgname',
                    fieldLabel: gettext('Volume Group'),
                    allowBlank: false,
                    vtype: 'StorageId',
                },
                PVE.panel.StorageBase.volumeChainField(true, 'lvm'),
            ],
        };
        me.items = [
            { xtype: 'pveStorageWizardIScsiTarget', title: gettext('Target'), itemId: 'target' },
            {
                xtype: 'pveStorageWizardLunSelect',
                title: 'LUN',
                itemId: 'luns',
                onlineHelp: 'storage_multipath',
            },
            settings,
            {
                title: gettext('Confirm'),
                layout: 'fit',
                items: [
                    {
                        xtype: 'grid',
                        itemId: 'summary',
                        store: { fields: ['key', 'value'] },
                        columns: [
                            {
                                text: gettext('Setting'),
                                dataIndex: 'key',
                                width: 280,
                                renderer: Ext.htmlEncode,
                            },
                            {
                                text: gettext('Value'),
                                dataIndex: 'value',
                                flex: 1,
                                cellWrap: true,
                                renderer: Ext.htmlEncode,
                            },
                        ],
                    },
                ],
                listeners: { activate: () => me.updateSummary() },
                onSubmit: () => me.finish(),
            },
        ];
        me.callParent();
        let tabs = me.down('#wizcontent');
        tabs.on('tabchange', function (tp, tab) {
            if (tab === me.down('#luns')) {
                me.down('#back').disable();
            }
            me.down('#submit').setText(
                tab === me.down('#target') ? gettext('Next') : gettext('Finish'),
            );
        });
        me.down('#submit').setText(gettext('Next'));
        me.on('destroy', () => me.reloadCallback?.());
    },
});
