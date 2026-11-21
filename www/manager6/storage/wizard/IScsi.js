Ext.define('PVE.storage.wizard.IScsiTarget', {
    extend: 'Proxmox.panel.InputPanel',
    xtype: 'pveStorageWizardIScsiTarget',
    onlineHelp: 'storage_open_iscsi',

    // The iSCSI storage the target already has, which the setup uses instead of adding one.
    existingConnection: function () {
        let me = this;
        let target = me.down('field[name=target]').getValue();
        return me.storages?.find((entry) => entry.type === 'iscsi' && entry.target === target);
    },

    // The ID of the iSCSI storage the setup adds, named after the storage on the LUN by default.
    newConnectionId: function () {
        let me = this;
        let id = me.down('field[name=storage]').getValue();
        return me.down('field[name=connection]').getValue() || (id ? `${id}-base` : '');
    },

    // Why the storages that use the target cannot serve the setup, if they cannot. The note of the
    // step and Next both use it, so that the note does not promise what Next then refuses.
    reuseConflict: function (selectedNodes) {
        let me = this;
        let target = me.down('field[name=target]').getValue();
        let users = (me.storages ?? []).filter((entry) => entry.target === target);
        if (!users.length) {
            return undefined;
        }
        let base = users[0];
        let format = (text, ...args) => Ext.String.format(text, ...args);
        if (users.length !== 1) {
            return format(
                gettext(
                    'Storages {0} use this target. The setup can only reuse a target that one storage uses.',
                ),
                users.map((entry) => entry.storage).join(', '),
            );
        } else if (base.type !== 'iscsi') {
            return format(
                gettext(
                    'Storage "{0}" uses this target. The setup can only reuse an iSCSI storage.',
                ),
                base.storage,
            );
        } else if (`${base.content ?? ''}` !== 'none') {
            return format(
                gettext(
                    'Storage "{0}" uses the LUNs of this target directly. If no guest uses them, clear Use LUNs directly in its edit dialog, otherwise use another target.',
                ),
                base.storage,
            );
        } else if (base.disable) {
            return format(
                gettext(
                    'Storage "{0}" connects to this target, but it is disabled. Enable that storage first.',
                ),
                base.storage,
            );
        }
        let baseNodes = base.nodes ? base.nodes.split(',') : [];
        if (baseNodes.length && !baseNodes.includes(Proxmox.NodeName)) {
            return format(
                gettext(
                    'iSCSI storage "{0}" is not available on node "{1}". Open the web UI on one of its nodes.',
                ),
                base.storage,
                Proxmox.NodeName,
            );
        } else if (baseNodes.length && selectedNodes.some((node) => !baseNodes.includes(node))) {
            return format(
                gettext('iSCSI storage "{0}" is not available on all selected nodes.'),
                base.storage,
            );
        } else if (!base['managed-multipath']) {
            return format(
                gettext(
                    'Enable Multipath in the edit dialog of storage "{0}" before using it here.',
                ),
                base.storage,
            );
        }
        return undefined;
    },

    updateConnectionField: function () {
        let me = this;
        let existing = me.existingConnection();
        let field = me.down('field[name=connection]');
        if (existing) {
            field.setValue(existing.storage);
        } else if (field.readOnly) {
            field.setValue('');
        }
        field.setReadOnly(!!existing);
        let id = me.down('field[name=storage]').getValue();
        field.setEmptyText(id ? `${id}-base` : '');

        // the nodes of a storage that the setup uses are the default selection
        let identities = me.down('pveStorageWizardNodeIdentities');
        let inherited = existing?.nodes ? existing.nodes.split(',') : [];
        if ((existing?.storage ?? null) !== me.shownStorage) {
            me.shownStorage = existing?.storage ?? null;
            identities.setNodes(inherited);
        }
        let conflict = me.reuseConflict(identities.getSelectedNodes());
        let note = me.down('#connectionNote');
        note.setHtml(
            conflict
                ? `<span class="pmx-hint">${Ext.htmlEncode(gettext('Note:'))}</span> ${Ext.htmlEncode(conflict)}`
                : '',
        );
        note.setHidden(!conflict);
    },

    onSubmit: function () {
        let me = this;
        let wizard = me.up('window');
        let values = me.getValues();
        let shown = me.existingConnection()?.storage;
        let identities = me.down('pveStorageWizardNodeIdentities');
        // without the node list, no selection would read as all nodes
        if (!identities.loadedOnce) {
            wizard.showError(gettext('Select the nodes once they are listed.'));
            return;
        }
        // all checked nodes, as all nodes can be more than a reused storage has
        let selectedNodes = identities.getSelectedNodes();
        let nodes = identities.getNodes().join(',');
        let connected = function (connection) {
            wizard.connection = connection;
            if (wizard.destroyed) {
                return;
            }
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
                // the step showed which storage it reuses, if any, which must still hold
                if (me.existingConnection()?.storage !== shown) {
                    wizard.showError(
                        gettext(
                            'The iSCSI storage of this target changed in the meantime. Check this step, then retry.',
                        ),
                    );
                    return;
                }
                let taken = (id) => me.storages.some((entry) => entry.storage === id);
                if (taken(values.storage)) {
                    wizard.showError(
                        Ext.htmlEncode(
                            Ext.String.format(
                                gettext('Storage ID "{0}" is already in use. Choose another ID.'),
                                values.storage,
                            ),
                        ),
                    );
                    return;
                }
                let conflict = me.reuseConflict(selectedNodes);
                if (conflict) {
                    wizard.showError(Ext.htmlEncode(conflict));
                    return;
                }
                let base = me.existingConnection();
                if (base) {
                    // within the nodes of a restricted storage, which the check ensured
                    let restricted = base.nodes ? base.nodes.split(',') : [];
                    if (restricted.length) {
                        nodes = (selectedNodes.length ? selectedNodes : restricted).join(',');
                    }
                    connected({ storage: base.storage, target: base.target, nodes });
                    return;
                }
                let params = {
                    type: 'iscsi',
                    storage: me.newConnectionId(),
                    portal: values.portal,
                    target: values.target,
                    content: 'none',
                    'managed-multipath': 1,
                };
                if (nodes) {
                    params.nodes = nodes;
                }
                if (params.storage === values.storage) {
                    wizard.showError(
                        gettext(
                            'The storage for guest disks and the iSCSI storage need different IDs. Change the iSCSI Storage ID under Advanced.',
                        ),
                    );
                    return;
                }
                if (taken(params.storage)) {
                    wizard.showError(
                        Ext.htmlEncode(
                            Ext.String.format(
                                gettext(
                                    'The ID "{0}" for the iSCSI storage is already in use. Set another one under Advanced.',
                                ),
                                params.storage,
                            ),
                        ),
                    );
                    return;
                }
                let connection = {
                    storage: params.storage,
                    target: values.target,
                    nodes,
                    created: params,
                };
                wizard.addStorage(params, () => connected(connection), fail);
            },
        });
    },

    initComponent: function () {
        let me = this;
        let common = PVE.panel.StorageBase.commonFields(true);
        // wide enough for the longest label of the step
        let labelWidth = 150;
        let update = () => me.updateConnectionField();
        me.items = [
            {
                ...common.id,
                labelWidth,
                emptyText: gettext('Storage for guest disks'),
                listeners: { change: update },
                validator: (value) =>
                    !me.storages?.some((entry) => entry.storage === value) ||
                    Ext.String.format(
                        gettext('Storage ID "{0}" is already in use. Choose another ID.'),
                        value,
                    ),
            },
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
                listeners: { change: update },
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
                xtype: 'component',
                itemId: 'connectionNote',
                margin: '0 0 10 0',
                hidden: true,
            },
            { xtype: 'pveStorageWizardNodeIdentities', listeners: { nodeschange: update } },
        ];
        me.advancedItems = [
            {
                ...common.id,
                name: 'connection',
                fieldLabel: gettext('iSCSI Storage ID'),
                labelWidth,
                allowBlank: true,
            },
        ];
        me.callParent();
        me.updateConnectionField();
        me.on('afterrender', () =>
            Proxmox.Utils.API2Request({
                url: '/storage',
                method: 'GET',
                waitMsgTarget: me,
                failure: function (response) {
                    if (!me.destroyed) {
                        Ext.Msg.alert(gettext('Error'), response.htmlStatus);
                    }
                },
                success: function (response) {
                    if (!me.destroyed) {
                        me.storages = response.result.data;
                        me.updateConnectionField();
                        me.down('field[name=storage]').validate();
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
