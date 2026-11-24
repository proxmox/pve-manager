Ext.define('PVE.panel.StorageBase', {
    extend: 'Proxmox.panel.InputPanel',
    controller: 'storageEdit',

    statics: {
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

        submitEnable: function (values) {
            values.disable = values.enable ? 0 : 1;
            delete values.enable;
        },

        volumeChainField: function (isCreate, type) {
            return {
                xtype: 'proxmoxcheckbox',
                name: 'snapshot-as-volume-chain',
                // TRANSLATORS: As in "a chain of volumes, each referencing the next one".
                boxLabel: gettext('Allow Snapshots as Volume-Chain'),
                deleteEmpty: !isCreate,
                // can only allow to enable this on creation for storages that previously
                // already supported qcow2 to avoid ambiguity with existing volumes.
                disabled: !isCreate && type !== 'lvm',
                checked: false,
            };
        },
    },

    type: '',

    setAdvancedVisible: function (visible) {
        let me = this;

        if (!me.emptyAdvanced) {
            me.callParent([visible]);
        }
        me.down('pveContentTypeSelector')?.setShowVolumeTypes(visible);
    },

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
            addAdvancedWidget(PVE.panel.StorageBase.volumeChainField(me.isCreate, me.type));

            if (me.type === 'lvm') {
                me.advancedColumnB = me.advancedColumnB || [];
                me.advancedColumnB.unshift({
                    xtype: 'displayfield',
                    name: 'external-snapshot-hint-lvm',
                    userCls: 'pmx-hint',
                    value: gettext('Keep Snapshots as Volume-Chain enabled if qcow2 images exist!'),
                });
            }
        }

        // The volume types of guests are only offered as content in the advanced mode, so a
        // panel that can offer them needs the checkbox for it, even without advanced fields.
        let offersVolumeTypes = [...me.column1, ...me.column2].some(
            (field) =>
                field.xtype === 'pveContentTypeSelector' &&
                field.withVolumeTypes !== false &&
                (!field.cts || PVE.Utils.contentAllows(field.cts, 'images')),
        );
        me.emptyAdvanced =
            offersVolumeTypes && !me.advancedColumn1 && !me.advancedColumn2 && !me.advancedColumnB;
        if (me.emptyAdvanced) {
            me.advancedColumn1 = [];
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
            metadata: me.metadata,
        });

        Ext.apply(me, {
            subject: Ext.htmlEncode(
                me.metadata?.['display-name'] || PVE.Utils.format_storage_type(me.type),
            ),
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
                        // custom plugins do not necessarily support it
                        hasMaxProtected:
                            !me.metadata ||
                            Object.hasOwn(me.metadata.schema, 'max-protected-backups'),
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
