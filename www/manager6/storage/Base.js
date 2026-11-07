Ext.define('PVE.panel.StorageBase', {
    extend: 'Proxmox.panel.InputPanel',
    controller: 'storageEdit',

    statics: {
        // The fields every storage has, also used by the remote storage wizard.
        commonFields: function (isCreate, storageId) {
            return {
                id: {
                    xtype: isCreate ? 'textfield' : 'displayfield',
                    name: 'storage',
                    value: storageId || '',
                    fieldLabel: 'ID',
                    vtype: 'StorageId',
                    allowBlank: false,
                },
                nodes: {
                    xtype: 'pveNodeSelector',
                    name: 'nodes',
                    reference: 'storageNodeRestriction',
                    disabled: storageId === 'local',
                    fieldLabel: gettext('Nodes'),
                    emptyText: gettext('All') + ' (' + gettext('No restrictions') + ')',
                    multiSelect: true,
                    autoSelect: false,
                },
                enable: {
                    xtype: 'proxmoxcheckbox',
                    name: 'enable',
                    checked: true,
                    uncheckedValue: 0,
                    fieldLabel: gettext('Enable'),
                },
            };
        },

        // The API takes the inverse of the enable checkbox.
        submitEnable: function (values) {
            values.disable = values.enable ? 0 : 1;
            delete values.enable;
        },

        // The snapshot-as-volume-chain checkbox and its technology preview hint, also used by the
        // remote storage wizard.
        volumeChainFields: function (isCreate, type) {
            return {
                checkbox: {
                    xtype: 'proxmoxcheckbox',
                    name: 'snapshot-as-volume-chain',
                    // TRANSLATORS: As in "a chain of volumes, each referencing the next one".
                    boxLabel: gettext('Allow Snapshots as Volume-Chain'),
                    deleteEmpty: !isCreate,
                    // can only allow to enable this on creation for storages that previously
                    // already supported qcow2 to avoid ambiguity with existing volumes.
                    disabled: !isCreate && type !== 'lvm',
                    checked: false,
                },
                hint: {
                    xtype: 'displayfield',
                    name: 'external-snapshot-hint',
                    userCls: 'pmx-hint',
                    value: gettext('Snapshots as Volume-Chain are a technology preview.'),
                },
            };
        },
    },

    type: '',

    onGetValues: function (values) {
        let me = this;

        if (me.isCreate) {
            values.type = me.type;
        } else {
            delete values.storage;
        }

        PVE.panel.StorageBase.submitEnable(values);

        return values;
    },

    initComponent: function () {
        let me = this;

        let common = PVE.panel.StorageBase.commonFields(me.isCreate, me.storageId);
        me.column1.unshift(common.id);

        me.column2 = me.column2 || [];
        me.column2.unshift(common.nodes, common.enable);

        const addAdvancedWidget = (widget) => {
            me.advancedColumn1 = me.advancedColumn1 || [];
            me.advancedColumn2 = me.advancedColumn2 || [];
            if (me.advancedColumn2.length < me.advancedColumn1.length) {
                me.advancedColumn2.unshift(widget);
            } else {
                me.advancedColumn1.unshift(widget);
            }
        };

        const qemuImgStorageTypes = ['dir', 'btrfs', 'nfs', 'cifs'];

        if (qemuImgStorageTypes.includes(me.type)) {
            addAdvancedWidget({
                xtype: 'pvePreallocationSelector',
                name: 'preallocation',
                fieldLabel: gettext('Preallocation'),
                allowBlank: false,
                deleteEmpty: !me.isCreate,
                value: '__default__',
            });
        }

        const externalStorageManagedSnapshotSupport = ['dir', 'nfs', 'cifs', 'lvm'];

        if (externalStorageManagedSnapshotSupport.includes(me.type)) {
            let volumeChain = PVE.panel.StorageBase.volumeChainFields(me.isCreate, me.type);
            addAdvancedWidget(volumeChain.checkbox);

            me.advancedColumnB = me.advancedColumnB || [];
            if (me.type === 'lvm') {
                me.advancedColumnB.unshift({
                    xtype: 'displayfield',
                    name: 'external-snapshot-hint-lvm',
                    userCls: 'pmx-hint',
                    value: gettext('Keep Snapshots as Volume-Chain enabled if qcow2 images exist!'),
                });
            }
            me.advancedColumnB.unshift(volumeChain.hint);
        }

        me.callParent();
    },
});

Ext.define('PVE.storage.BaseEdit', {
    extend: 'Proxmox.window.Edit',

    apiCallDone: function (success, response, options) {
        let me = this;
        if (typeof me.ipanel.apiCallDone === 'function') {
            me.ipanel.apiCallDone(success, response, options);
        }
    },

    initComponent: function () {
        let me = this;

        me.isCreate = !me.storageId;

        if (me.isCreate) {
            me.url = '/api2/extjs/storage';
            me.method = 'POST';
        } else {
            me.url = '/api2/extjs/storage/' + me.storageId;
            me.method = 'PUT';
        }

        me.ipanel = Ext.create(me.paneltype, {
            title: gettext('General'),
            type: me.type,
            isCreate: me.isCreate,
            storageId: me.storageId,
        });

        Ext.apply(me, {
            subject: PVE.Utils.format_storage_type(me.type),
            isAdd: true,
            bodyPadding: 0,
            items: {
                xtype: 'tabpanel',
                region: 'center',
                layout: 'fit',
                bodyPadding: 10,
                items: [
                    me.ipanel,
                    {
                        xtype: 'pveBackupJobPrunePanel',
                        title: gettext('Backup Retention'),
                        hasMaxProtected: true,
                        isCreate: me.isCreate,
                        keepAllDefaultForCreate: true,
                        showPBSHint: me.ipanel.isPBS,
                        fallbackHintHtml: gettext(
                            "Without any keep option, the node's vzdump.conf or `keep-all` is used as fallback for backup jobs",
                        ),
                    },
                ],
            },
        });

        if (me.ipanel.extraTabs) {
            me.ipanel.extraTabs.forEach((panel) => {
                panel.isCreate = me.isCreate;
                me.items.items.push(panel);
            });
        }

        me.callParent();

        if (!me.canDoBackups) {
            // cannot mask now, not fully rendered until activated
            me.down('pmxPruneInputPanel').needMask = true;
        }

        if (!me.isCreate) {
            me.load({
                success: function (response, options) {
                    let values = response.result.data;
                    let ctypes = values.content || '';

                    values.content = ctypes.split(',');

                    if (values.nodes) {
                        values.nodes = values.nodes.split(',');
                    }
                    values.enable = values.disable ? 0 : 1;
                    if (values['prune-backups']) {
                        let retention = PVE.Parser.parsePropertyString(values['prune-backups']);
                        delete values['prune-backups'];
                        Object.assign(values, retention);
                    }

                    me.query('inputpanel').forEach((panel) => {
                        panel.setValues(values);
                    });
                },
            });
        }
    },
});
