Ext.define('PVE.storage.wizard.IScsiTarget', {
    extend: 'Proxmox.panel.InputPanel',
    xtype: 'pveStorageWizardIScsiTarget',
    onlineHelp: 'storage_open_iscsi',

    updateConnectionField: function () {
        let me = this;
        let target = me.down('field[name=target]').getValue();
        let storage = me.storages?.find(
            (entry) => entry.type === 'iscsi' && entry.target === target,
        );
        let field = me.down('field[name=connection]');
        if (storage) {
            field.setValue(storage.storage);
        } else if (field.readOnly) {
            field.setValue('');
        }
        field.setReadOnly(!!storage);
    },

    onSubmit: function () {
        let me = this;
        let wizard = me.up('window');
        let values = me.getValues();
        let params = {
            type: 'iscsi',
            storage: values.connection,
            portal: values.portal,
            target: values.target,
            content: 'none',
            'managed-multipath': 1,
        };
        let nodes = []
            .concat(values.nodes || [])
            .filter(Boolean)
            .join(',');
        if (nodes) {
            params.nodes = nodes;
        }
        let connected = function (connection) {
            if (wizard.destroyed) {
                return;
            }
            wizard.connection = connection;
            // the step does not come back, the cluster status of its initiator names is not needed
            me.down('pveStorageWizardNodeIdentities').rstore.stopUpdate();
            let tabs = wizard.down('#wizcontent');
            wizard.down('#luns').enable();
            tabs.setActiveTab(wizard.down('#luns'));
            me.disable();
        };
        let fail = (response) => wizard.showError(response.htmlStatus);
        Proxmox.Utils.API2Request({
            url: '/storage',
            method: 'GET',
            waitMsgTarget: wizard,
            failure: fail,
            success: function (response) {
                if (wizard.destroyed) {
                    return;
                }
                me.storages = response.result.data;
                me.updateConnectionField();
                let users = me.storages.filter((entry) => entry.target === values.target);
                if (users.length) {
                    let base = users[0];
                    let conflict;
                    if (users.length !== 1) {
                        conflict = Ext.String.format(
                            gettext(
                                'Storages {0} use this target. The setup can only reuse a target that one storage uses.',
                            ),
                            users.map((entry) => entry.storage).join(', '),
                        );
                    } else if (base.type !== 'iscsi') {
                        conflict = Ext.String.format(
                            gettext(
                                'Storage "{0}" uses this target. The setup can only reuse an iSCSI storage.',
                            ),
                            base.storage,
                        );
                    } else if (`${base.content ?? ''}` !== 'none') {
                        conflict = Ext.String.format(
                            gettext(
                                'Storage "{0}" uses the LUNs of this target directly. If no guest uses them, clear Use LUNs directly in its edit dialog, otherwise use another target.',
                            ),
                            base.storage,
                        );
                    }
                    if (conflict) {
                        wizard.showError(Ext.htmlEncode(conflict));
                        return;
                    }
                    if (base.disable) {
                        wizard.showError(
                            Ext.htmlEncode(
                                Ext.String.format(
                                    gettext(
                                        'Storage "{0}" connects to this target, but it is disabled. Enable that storage first.',
                                    ),
                                    base.storage,
                                ),
                            ),
                        );
                        return;
                    }
                    let baseNodes = base.nodes ? base.nodes.split(',') : [];
                    if (baseNodes.length && !baseNodes.includes(Proxmox.NodeName)) {
                        wizard.showError(
                            Ext.htmlEncode(
                                Ext.String.format(
                                    gettext(
                                        'Connection storage "{0}" is not available on node "{1}". Open the web UI on one of its nodes.',
                                    ),
                                    base.storage,
                                    Proxmox.NodeName,
                                ),
                            ),
                        );
                        return;
                    }
                    let selectedNodes = nodes ? nodes.split(',') : baseNodes;
                    if (
                        baseNodes.length &&
                        selectedNodes.some((node) => !baseNodes.includes(node))
                    ) {
                        wizard.showError(
                            gettext(
                                'The connection storage is not available on all selected nodes.',
                            ),
                        );
                        return;
                    }
                    let connection = {
                        storage: base.storage,
                        target: base.target,
                        nodes: selectedNodes.join(','),
                    };
                    if (!base['managed-multipath']) {
                        wizard.showError(
                            Ext.htmlEncode(
                                Ext.String.format(
                                    gettext(
                                        'Enable Multipath in the edit dialog of storage "{0}" before using it here.',
                                    ),
                                    base.storage,
                                ),
                            ),
                        );
                        return;
                    }
                    connected(connection);
                    return;
                }
                Proxmox.Utils.API2Request({
                    url: '/storage',
                    method: 'POST',
                    params,
                    waitMsgTarget: wizard,
                    failure: fail,
                    success: () =>
                        connected({ storage: params.storage, target: params.target, nodes }),
                });
            },
        });
    },

    initComponent: function () {
        let me = this;
        let common = PVE.panel.StorageBase.commonFields(true);
        // wide enough for the longest label of the step
        let labelWidth = 150;
        me.items = [
            {
                xtype: 'textfield',
                name: 'portal',
                fieldLabel: gettext('Portal'),
                labelWidth,
                allowBlank: false,
                listeners: {
                    change: {
                        buffer: 500,
                        fn: function (field, value) {
                            let target = me.down('field[name=target]');
                            target.setDisabled(!value);
                            target.setValue('');
                            target.setPortal(value);
                        },
                    },
                },
            },
            {
                xtype: 'pveIScsiScan',
                name: 'target',
                fieldLabel: gettext('Target'),
                labelWidth,
                disabled: true,
                showNodeSelector: false,
                nodename: Proxmox.NodeName,
                listeners: { change: () => me.updateConnectionField() },
                listConfig: {
                    width: 650,
                    emptyText: PVE.Utils.renderNotFound(gettext('iSCSI Target')),
                    columns: [
                        {
                            text: gettext('Target'),
                            dataIndex: 'target',
                            flex: 1,
                            renderer: Ext.htmlEncode,
                        },
                        {
                            text: gettext('Portals'),
                            dataIndex: 'portal',
                            width: 220,
                            renderer: Ext.htmlEncode,
                        },
                    ],
                },
            },
            {
                ...common.id,
                name: 'connection',
                fieldLabel: gettext('Connection Storage'),
                labelWidth,
            },
            {
                xtype: 'component',
                margin: '0 0 10 0',
                html: `<span class="pmx-hint">${Ext.htmlEncode(gettext('Note:'))}</span> ${Ext.htmlEncode(
                    Ext.String.format(
                        gettext(
                            // TRANSLATORS: {0} is the label of the Next button.
                            'Pressing {0} creates or reuses the connection storage before you select a LUN.',
                        ),
                        gettext('Next'),
                    ),
                )}`,
            },
            { xtype: 'pveStorageWizardNodeIdentities' },
        ];
        me.advancedItems = [
            {
                ...common.nodes,
                labelWidth,
                validator: PVE.storage.wizard.SAN.validateNodes,
                listeners: {
                    change: (field, value) =>
                        me.down('pveStorageWizardNodeIdentities').setNodes(value),
                },
            },
        ];
        me.callParent();
        me.on('afterrender', () =>
            Proxmox.Utils.API2Request({
                url: '/storage',
                method: 'GET',
                waitMsgTarget: me,
                failure: function (response) {
                    if (!me.destroyed) {
                        me.up('window').showError(response.htmlStatus);
                    }
                },
                success: function (response) {
                    if (!me.destroyed) {
                        me.storages = response.result.data;
                        me.updateConnectionField();
                    }
                },
            }),
        );
    },
});

Ext.define('PVE.storage.wizard.IScsi', {
    extend: 'PVE.storage.wizard.SAN',
    wizardType: 'iscsi',

    createStorage: function (values, lun) {
        let me = this;
        let fail = (response) => me.showError(response.htmlStatus);
        Proxmox.Utils.API2Request({
            url: `/nodes/${Proxmox.NodeName}/storage/${encodeURIComponent(me.connection.storage)}/content`,
            method: 'GET',
            params: { content: 'images' },
            waitMsgTarget: me,
            failure: fail,
            success: function (response) {
                if (me.destroyed) {
                    return;
                }
                let volume = response.result.data.find((entry) =>
                    entry.volid.endsWith(`.dm-uuid-mpath-${lun.wwid}`),
                );
                if (!volume) {
                    me.showError(
                        gettext(
                            'The selected LUN has no multipath volume yet. Check Node > SAN, then retry.',
                        ),
                    );
                    return;
                }
                me.addLVMStorage({ ...values, base: volume.volid }, fail);
            },
        });
    },
});
