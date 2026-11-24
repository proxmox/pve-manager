// The step of a guided setup that connects to the target of an iSCSI or the subsystem of an NVMe
// over Fabrics array, through a storage of that type.
Ext.define('PVE.storage.wizard.Target', {
    extend: 'Proxmox.panel.InputPanel',
    xtype: 'pveStorageWizardTarget',

    storageType: 'iscsi',

    // The storage the target already has, which the setup uses instead of adding one.
    existingConnection: function () {
        let me = this;
        let target = me.down('field[name=target]').getValue();
        return me.storages?.find(
            (entry) => entry.type === me.storageType && entry[me.targetKey] === target,
        );
    },

    // The ID of the storage the setup adds, named after the storage on the LUN by default.
    newConnectionId: function () {
        let me = this;
        let id = me.down('field[name=storage]').getValue();
        return me.down('field[name=connection]').getValue() || (id ? `${id}-base` : '');
    },

    // Why the storages that use the target cannot serve the setup, if they cannot. The note of the
    // step and Next both use it, so that the note does not promise what Next then refuses.
    reuseConflict: function (selectedNodes) {
        let me = this;
        let nvme = me.storageType === 'nvmeof';
        let target = me.down('field[name=target]').getValue();
        let users = (me.storages ?? []).filter((entry) => entry[me.targetKey] === target);
        if (!users.length) {
            return undefined;
        }
        let base = users[0];
        let format = (text, ...args) => Ext.String.format(text, ...args);
        if (users.length !== 1) {
            return format(
                nvme
                    ? gettext(
                          'Storages {0} use this subsystem. The setup can only reuse a subsystem that one storage uses.',
                      )
                    : gettext(
                          'Storages {0} use this target. The setup can only reuse a target that one storage uses.',
                      ),
                users.map((entry) => entry.storage).join(', '),
            );
        } else if (base.type !== me.storageType) {
            return format(
                nvme
                    ? gettext(
                          'Storage "{0}" uses this subsystem. The setup can only reuse an NVMe over Fabrics storage.',
                      )
                    : gettext(
                          'Storage "{0}" uses this target. The setup can only reuse an iSCSI storage.',
                      ),
                base.storage,
            );
        } else if (`${base.content ?? ''}` !== 'none') {
            return format(
                nvme
                    ? gettext(
                          'Storage "{0}" uses the namespaces of this subsystem directly. If no guest uses them, clear Use namespaces directly in its edit dialog, otherwise use another subsystem.',
                      )
                    : gettext(
                          'Storage "{0}" uses the LUNs of this target directly. If no guest uses them, clear Use LUNs directly in its edit dialog, otherwise use another target.',
                      ),
                base.storage,
            );
        } else if (base.disable) {
            return format(
                nvme
                    ? gettext(
                          'Storage "{0}" connects to this subsystem, but it is disabled. Enable that storage first.',
                      )
                    : gettext(
                          'Storage "{0}" connects to this target, but it is disabled. Enable that storage first.',
                      ),
                base.storage,
            );
        }
        let baseNodes = base.nodes ? base.nodes.split(',') : [];
        if (baseNodes.length && !baseNodes.includes(Proxmox.NodeName)) {
            return format(
                gettext(
                    'Storage "{0}" is not available on node "{1}". Open the web UI on one of its nodes.',
                ),
                base.storage,
                Proxmox.NodeName,
            );
        } else if (baseNodes.length && selectedNodes.some((node) => !baseNodes.includes(node))) {
            return format(
                gettext('Storage "{0}" is not available on all selected nodes.'),
                base.storage,
            );
        } else if (!nvme && !base['managed-multipath']) {
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
        // a reused storage keeps its own portals
        let portals = me.down('field[name=portals]');
        if (portals) {
            if (existing) {
                portals.setValue(existing.portals);
            }
            portals.setReadOnly(!!existing);
        }

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

    // The portals of the enabled storages of the type, to discover the target of another LUN
    // through one of them. An NVMe over Fabrics storage lists the I/O portals of its subsystem,
    // whose default port would skip the discovery port 8009, so the suggestion leaves it out.
    updatePortalSuggestions: function () {
        let me = this;
        let users = new Map();
        for (const { type, portal, portals, storage, disable } of me.storages ?? []) {
            let list = [];
            if (disable) {
                continue;
            } else if (me.storageType === 'nvmeof' && type === 'nvmeof') {
                // as the storage splits its list
                list = `${portals ?? ''}`
                    .split(/[\s,;]+/)
                    .filter(Boolean)
                    .map((entry) => entry.replace(/:4420$/, ''));
            } else if (me.storageType === 'iscsi' && ['iscsi', 'iscsidirect'].includes(type)) {
                list = portal ? [portal] : [];
            }
            for (const entry of new Set(list)) {
                users.set(entry, [...(users.get(entry) ?? []), storage]);
            }
        }
        let suggestions = [...users.keys()]
            .sort()
            .map((entry) => ({ portal: entry, storages: users.get(entry).sort().join(', ') }));
        let field = me.down('field[name=portal]');
        field.getStore().setData(suggestions);
        field.setHideTrigger(!suggestions.length);
    },

    onSubmit: function () {
        let me = this;
        let nvme = me.storageType === 'nvmeof';
        let wizard = me.up('window');
        let values = me.getValues();
        // a pasted portal can come with spaces around it
        values.portal = values.portal?.trim();
        // a disabled target field counts as valid, while the portal waits for its discovery
        let target = me.down('field[name=target]');
        if (!values.target || target.discoveredPortal !== values.portal) {
            wizard.showError(
                nvme
                    ? gettext('Select a subsystem once the subsystems of this portal are listed.')
                    : gettext('Select a target once the targets of this portal are listed.'),
            );
            return;
        }
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
        let missing = nvme
            ? []
            : identities
                  .getSelection()
                  .filter((rec) => rec.get('iscsi-missing'))
                  .map((rec) => rec.get('node'))
                  .sort();
        if (missing.length) {
            // the node serving the web UI sets up the volume group, so it stays selected
            wizard.showError(
                Ext.htmlEncode(
                    Ext.String.format(
                        missing.includes(Proxmox.NodeName)
                            ? gettext(
                                  'open-iscsi is not installed on node(s) {0}. Install it there.',
                              )
                            : gettext(
                                  'open-iscsi is not installed on node(s) {0}. Install it there, or deselect those nodes.',
                              ),
                        missing.join(', '),
                    ),
                ),
            );
            return;
        }
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
                me.updatePortalSuggestions();
                // the step showed which storage it reuses, if any, which must still hold
                if (me.existingConnection()?.storage !== shown) {
                    wizard.showError(
                        nvme
                            ? gettext(
                                  'The NVMe over Fabrics storage of this subsystem changed in the meantime. Check this step, then retry.',
                              )
                            : gettext(
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
                    connected({ storage: base.storage, target: base[me.targetKey], nodes });
                    return;
                }
                let params = {
                    type: me.storageType,
                    storage: me.newConnectionId(),
                    content: 'none',
                    ...(nvme
                        ? // the storage configuration does not keep outer spaces, so neither may the
                          // copy that the cleanup compares
                          { subsysnqn: values.target, portals: values.portals.trim() }
                        : {
                              portal: values.portal,
                              target: values.target,
                              'managed-multipath': 1,
                          }),
                };
                if (nodes) {
                    params.nodes = nodes;
                }
                if (params.storage === values.storage) {
                    wizard.showError(
                        nvme
                            ? gettext(
                                  'The storage for guest disks and the NVMe over Fabrics storage need different IDs. Change the NVMe over Fabrics Storage ID under Advanced.',
                              )
                            : gettext(
                                  'The storage for guest disks and the iSCSI storage need different IDs. Change the iSCSI Storage ID under Advanced.',
                              ),
                    );
                    return;
                }
                if (taken(params.storage)) {
                    wizard.showError(
                        Ext.htmlEncode(
                            Ext.String.format(
                                nvme
                                    ? gettext(
                                          'The ID "{0}" for the NVMe over Fabrics storage is already in use. Set another one under Advanced.',
                                      )
                                    : gettext(
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
        let nvme = me.storageType === 'nvmeof';
        me.targetKey = nvme ? 'subsysnqn' : 'target';
        me.onlineHelp = nvme ? 'storage_nvmeof' : 'storage_open_iscsi';
        let targetLabel = nvme ? gettext('Subsystem') : gettext('Target');
        let common = PVE.panel.StorageBase.commonFields(true);
        // wide enough for the longest label of the step
        let labelWidth = nvme ? 200 : 150;
        let update = () => me.updateConnectionField();
        let discovery = new Ext.util.DelayedTask(function () {
            let portal = me.down('field[name=portal]').getValue()?.trim();
            if (portal && PVE.SANUtils.portalIncomplete(portal)) {
                return;
            } else if (portal && nvme && !PVE.SANUtils.nvmePortalValid(portal)) {
                return;
            }
            let target = me.down('field[name=target]');
            target.setDisabled(!portal);
            target.setPortal(portal);
        });
        me.on('destroy', () => discovery.cancel());
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
                xtype: 'combobox',
                name: 'portal',
                fieldLabel: nvme ? gettext('Discovery Portal') : gettext('Portal'),
                labelWidth,
                allowBlank: false,
                allowOnlyWhitespace: false,
                validator: nvme ? (value) => PVE.SANUtils.validateNVMePortals(value) : undefined,
                queryMode: 'local',
                valueField: 'portal',
                displayField: 'portal',
                forceSelection: false,
                // a typed portal must not turn into the first suggestion that starts with it
                autoSelect: false,
                hideTrigger: true,
                store: { fields: ['portal', 'storages'], data: [] },
                // the toolkit opens an editable list on focus, which an empty one must not do
                expand: function () {
                    if (this.getStore().getCount()) {
                        Ext.form.field.ComboBox.prototype.expand.call(this);
                    }
                },
                listConfig: {
                    getInnerTpl: () => '{portal:htmlEncode} ({storages:htmlEncode})',
                },
                listeners: {
                    // A target found through another portal must not go with this one, also not
                    // with a Next while typing. Only the discovery waits for the typing to end.
                    change: function () {
                        let target = me.down('field[name=target]');
                        target.setValue('');
                        target.disable();
                        // and the I/O portals of its subsystem
                        me.down('field[name=portals]')?.setValue('');
                        // an answer for the previous portal would select one of its targets
                        target.setPortal('');
                        discovery.delay(500);
                    },
                },
            },
            {
                xtype: nvme ? 'pveNVMeOFScan' : 'pveIScsiScan',
                name: 'target',
                fieldLabel: targetLabel,
                labelWidth,
                disabled: true,
                showNodeSelector: false,
                nodename: Proxmox.NodeName,
                listeners: {
                    change: function (field, value) {
                        // the I/O portals that the discovery reported for the subsystem
                        let rec =
                            nvme &&
                            field.getStore().findRecord('subsysnqn', value, 0, false, true, true);
                        if (rec) {
                            me.down('field[name=portals]').setValue(rec.get('portals'));
                        }
                        update();
                    },
                },
                listConfig: {
                    width: 650,
                    emptyText: PVE.Utils.renderNotFound(
                        nvme ? gettext('Subsystem') : gettext('iSCSI Target'),
                    ),
                    columns: [
                        {
                            text: targetLabel,
                            dataIndex: me.targetKey,
                            flex: 1,
                            renderer: Ext.htmlEncode,
                        },
                        {
                            text: gettext('Portals'),
                            dataIndex: nvme ? 'portals' : 'portal',
                            width: 220,
                            renderer: Ext.htmlEncode,
                        },
                    ],
                },
            },
            ...(nvme
                ? [
                      {
                          xtype: 'textfield',
                          name: 'portals',
                          fieldLabel: gettext('Portals'),
                          labelWidth,
                          allowBlank: false,
                          allowOnlyWhitespace: false,
                          validator: (value) => PVE.SANUtils.validateNVMePortals(value, true),
                      },
                  ]
                : []),
            {
                xtype: 'component',
                itemId: 'connectionNote',
                margin: '0 0 10 0',
                hidden: true,
            },
            {
                xtype: 'pveStorageWizardNodeIdentities',
                identity: nvme ? 'nvme-host-nqn' : 'iscsi-initiator-name',
                listeners: { nodeschange: update },
            },
        ];
        me.advancedItems = [
            {
                ...common.id,
                name: 'connection',
                fieldLabel: nvme
                    ? gettext('NVMe over Fabrics Storage ID')
                    : gettext('iSCSI Storage ID'),
                labelWidth,
                allowBlank: true,
            },
        ];
        me.callParent();
        me.updateConnectionField();
        // the Add Storage wizard keeps this step while its type list shows
        let identities = me.down('pveStorageWizardNodeIdentities');
        me.on('activate', () => identities.rstore.startUpdate());
        me.on('deactivate', () => identities.rstore.stopUpdate());
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
                        me.updatePortalSuggestions();
                        me.down('field[name=storage]').validate();
                    }
                },
            }),
        );
    },
});

// Both add the LVM storage the same way; only the volume ID that names its base differs.
Ext.define('PVE.storage.wizard.IScsi', {
    extend: 'PVE.storage.wizard.SAN',
    wizardType: 'iscsi',

    createStorage: function (values, lun) {
        let me = this;
        let nvme = me.wizardType === 'nvmeof';
        let suffix = nvme ? `:nvme-${lun.wwid}` : `.dm-uuid-mpath-${lun.wwid}`;
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
                let volume = response.result.data.find((entry) => entry.volid.endsWith(suffix));
                if (!volume) {
                    me.showError(
                        nvme
                            ? gettext(
                                  'The selected namespace is not available yet. Check Node > SAN, then retry.',
                              )
                            : gettext(
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

Ext.define('PVE.storage.wizard.NVMeOF', {
    extend: 'PVE.storage.wizard.IScsi',
    wizardType: 'nvmeof',
});
