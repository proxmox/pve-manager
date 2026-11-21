Ext.define(
    'PVE.dc.StorageView',
    {
        extend: 'Ext.tree.Panel',
        rootVisible: false,
        useArrows: true,

        alias: ['widget.pveStorageView'],

        onlineHelp: 'chapter_storage',

        stateful: true,
        stateId: 'grid-dc-storage',

        reloadStore: function () {
            let me = this;
            if (me.destroyed) {
                return;
            }
            Proxmox.Utils.API2Request({
                url: '/storage',
                method: 'GET',
                failure: (response) =>
                    !me.destroyed && Proxmox.Utils.setErrorMask(me, response.htmlStatus),
                success: function ({ result: { data } }) {
                    if (me.destroyed) {
                        return;
                    }
                    let nodes = new Map();
                    for (let config of data) {
                        // plugin properties must not become tree node attributes like href or cls
                        let node = Ext.copy(
                            {},
                            config,
                            'storage,type,content,monhost,shared,disable,bwlimit',
                        );
                        node.location = me.storageLocation(config);
                        node.baseStorage =
                            config.type === 'lvm' ? config.base?.split(':', 1)[0] : undefined;
                        node.leaf = true;
                        node.iconCls = 'fa fa-fw fa-database x-fa-tree';
                        nodes.set(node.storage, node);
                    }
                    let children = [];
                    for (let node of nodes.values()) {
                        let parent = nodes.get(node.baseStorage);
                        // keep every storage visible, also with a missing base, a chain or a cycle
                        if (parent && !nodes.has(parent.baseStorage)) {
                            (parent.children ??= []).push(node);
                            parent.leaf = false;
                            parent.expanded = true;
                        } else {
                            children.push(node);
                        }
                    }
                    let sm = me.getSelectionModel();
                    let selected = sm.getSelection()[0]?.getId();
                    sm.deselectAll();
                    me.setRootNode({ expanded: true, children });
                    // the replaced nodes count as removed records, which nothing ever syncs
                    me.getStore().commitChanges();
                    let rec = selected && me.store.getNodeById(selected);
                    if (rec) {
                        sm.select(rec);
                    }
                    Proxmox.Utils.setErrorMask(me, false);
                },
            });
        },

        // What a storage is on: the volume group or pool for the types without path or target.
        storageLocation: function ({ type, vgname, thinpool, pool, target, path }) {
            switch (type) {
                case 'lvm':
                    return vgname;
                case 'lvmthin':
                    return vgname && thinpool ? `${vgname}/${thinpool}` : vgname;
                case 'zfspool':
                    return pool;
                default:
                    return target || path;
            }
        },

        // A sorter in the state saved by an older version still names the path, which the
        // location replaced in this column.
        applyState: function (state) {
            for (const sorter of state?.storeState?.sorters ?? []) {
                if (sorter.property === 'path') {
                    sorter.property = 'location';
                }
            }
            return this.callParent([state]);
        },

        loadPluginMetadata: function () {
            let me = this;

            me.pluginMetadataLoading = true;
            delete me.pluginMetadataError;

            let finishLoading = () => {
                me.pluginMetadataLoading = false;
                me.setLoading(false);

                let openEditor = me.pendingEditor;
                delete me.pendingEditor;
                openEditor?.();
            };

            Proxmox.Utils.API2Request({
                url: '/api2/extjs/plugins/storage/plugin',
                params: { origin: 'custom' },
                method: 'GET',
                success: function ({ result: { data } }) {
                    if (me.destroyed) {
                        return;
                    }
                    me.addCustomPlugins(data);
                    finishLoading();
                },
                failure: function ({ htmlStatus }) {
                    if (me.destroyed) {
                        return;
                    }
                    me.pluginMetadataError = htmlStatus;
                    finishLoading();
                },
            });
        },

        addCustomPlugins: function (pluginMetadata) {
            let me = this;

            for (const metadata of pluginMetadata) {
                me.pluginMetadata[metadata.type] = metadata;
            }
            me.fireEvent('addactionschange');

            // show the display names of custom plugins
            if (me.rendered) {
                me.getView().refresh();
            }
        },

        renderStorageType: function (type, metaData, record) {
            let me = this;

            let displayName = me.pluginMetadata[type]?.['display-name'];
            if (displayName) {
                return Ext.htmlEncode(displayName);
            }

            return Ext.htmlEncode(PVE.Utils.format_storage_type(type, metaData, record));
        },

        // in the order they show
        addCategories: [
            {
                id: 'local',
                text: gettext('Filesystems and Volume Groups'),
                note: gettext('To create a storage on an empty disk of a node, use Node > Disks.'),
            },
            { id: 'network', text: gettext('Network') },
            { id: 'san', text: gettext('SAN') },
            { id: 'backup', text: gettext('Backup') },
            { id: 'import', text: gettext('Import') },
            { id: 'custom', text: gettext('Custom Plugins') },
            { id: 'other', text: gettext('Other') },
        ],

        // The ways to add a storage, with why the user cannot use one, if they cannot.
        addActions: function () {
            let me = this;

            let allocate = Ext.state.Manager.get('GuiCap').storage['Datastore.Allocate']
                ? undefined
                : PVE.SANUtils.requiresText('Datastore.Allocate', '/storage');
            let setup = (type, description, keywords) => ({
                // the setups and the storage types, including custom ones, never share an ID
                id: `setup:${type}`,
                category: 'san',
                text: PVE.storage.wizard.SAN.subject(type),
                description,
                keywords,
                iconCls: 'fa fa-fw fa-magic',
                disabledReason: PVE.SANUtils.setupBlocker(type),
                handler: () => PVE.SANUtils.openSetup(type, () => me.reloadStore()),
            });
            let actions = [
                setup(
                    'iscsi',
                    gettext('Set up shared LVM on an iSCSI LUN with multipath.'),
                    'san lun multipath lvm guided',
                ),
                setup(
                    'fc',
                    gettext('Set up shared LVM on a Fibre Channel LUN with multipath.'),
                    'san lun multipath lvm fc guided',
                ),
            ];

            let types = {
                iscsi: [
                    'san',
                    gettext(
                        'Connect to an iSCSI target, to use its LUNs directly or as base of an LVM storage.',
                    ),
                    'lun target',
                ],
                zfs: [
                    'san',
                    gettext(
                        'Guest disks as ZFS volumes on a storage server that exports them over iSCSI.',
                    ),
                    'lun target',
                ],
                nfs: ['network', gettext('Mount an NFS export.'), 'nas share'],
                cifs: ['network', gettext('Mount an SMB/CIFS share.'), 'nas samba windows'],
                pbs: [
                    'backup',
                    gettext('Back up to a datastore of a Proxmox Backup Server.'),
                    'pbs',
                ],
                rbd: [
                    'network',
                    gettext('Guest disks in a Ceph pool, of this cluster or an external one.'),
                    'ceph block',
                ],
                cephfs: [
                    'network',
                    gettext('Mount a Ceph file system, of this cluster or an external one.'),
                    'ceph',
                ],
                dir: [
                    'local',
                    gettext('Use a directory, for example of a mounted file system.'),
                    '',
                ],
                lvm: [
                    'local',
                    gettext(
                        'Use an existing volume group, or create one on a LUN of an iSCSI storage.',
                    ),
                    'san lun shared',
                ],
                lvmthin: ['local', gettext('Use an existing LVM thin pool.'), ''],
                zfspool: ['local', gettext('Use an existing ZFS pool or dataset.'), 'zpool'],
                btrfs: ['local', gettext('Use a directory on a BTRFS file system.'), ''],
                esxi: ['import', gettext('Import guests from VMware ESXi.'), 'vmware vcenter'],
            };
            let schema = PVE.Utils.storageSchema;
            let addable = Object.keys(schema).filter((type) => !schema[type].hideAdd);
            // the types in the order of the table above, then any the table does not know
            let listed = (type) => Object.hasOwn(types, type);
            let known = Object.keys(types).filter((type) => addable.includes(type));
            for (const type of [...known, ...addable.filter((type) => !listed(type))]) {
                let [category, description, keywords] = listed(type)
                    ? types[type]
                    : ['other', '', ''];
                actions.push({
                    id: `type:${type}`,
                    category,
                    text: PVE.Utils.format_storage_type(type),
                    description,
                    keywords: `${type} ${keywords}`,
                    iconCls: `fa fa-fw fa-${schema[type].faIcon}`,
                    disabledReason: allocate,
                    handler: () => me.createStorageEditWindow(type),
                });
            }

            for (const metadata of Object.values(me.pluginMetadata)) {
                // a type that the UI knows is listed above or deliberately not offered
                if (metadata.origin !== 'custom' || Object.hasOwn(schema, metadata.type)) {
                    continue;
                }
                actions.push({
                    id: `type:${metadata.type}`,
                    category: 'custom',
                    text: metadata['display-name'] ?? metadata.type,
                    description: '',
                    keywords: metadata.type,
                    iconCls: 'fa fa-fw fa-folder',
                    disabledReason: allocate,
                    handler: () => me.createStorageEditWindow(metadata.type),
                });
            }
            return actions;
        },

        createStorageEditWindow: function (type, sid) {
            let me = this;

            let schema = PVE.Utils.storageSchema[type];

            let paneltype;
            let canDoBackups;
            let metadata;

            // Built-in types have their own editor and must not depend on the plugin metadata,
            // which might not be loaded (yet).
            if (schema?.ipanel) {
                paneltype = 'PVE.storage.' + schema.ipanel;
                canDoBackups = schema.backups;
            } else if (me.pluginMetadata[type] && me.pluginMetadata[type].origin === 'custom') {
                metadata = me.pluginMetadata[type];
                paneltype = 'PVE.storage.CustomInputPanel';
                // the retention panel submits 'prune-backups' unless it is masked
                canDoBackups =
                    metadata.content.supported.includes('backup') &&
                    Object.hasOwn(metadata.schema, 'prune-backups');
            } else if (me.pluginMetadataLoading) {
                // might be a custom plugin, so open the editor once the metadata is there
                me.pendingEditor = () => me.createStorageEditWindow(type, sid);
                me.setLoading(true);
                return;
            } else if (me.pluginMetadataError) {
                Ext.Msg.alert(
                    gettext('Error'),
                    Ext.String.format(
                        gettext("Cannot load the storage plugin information for type '{0}': {1}"),
                        Ext.htmlEncode(type),
                        me.pluginMetadataError,
                    ),
                );
                me.loadPluginMetadata(); // try again for the next attempt
                return;
            } else {
                Ext.Msg.alert(
                    gettext('Error'),
                    Ext.String.format(
                        gettext("No editor registered for storage type '{0}'"),
                        Ext.htmlEncode(type),
                    ),
                );
                return;
            }

            Ext.create('PVE.storage.BaseEdit', {
                paneltype: paneltype,
                type: type,
                storageId: sid,
                canDoBackups: canDoBackups,
                metadata: metadata,
                autoShow: true,
                listeners: {
                    destroy: () => me.reloadStore(),
                },
            });
        },

        initComponent: function () {
            let me = this;

            let sm = Ext.create('Ext.selection.TreeModel');

            let addList;
            let toggleAddList = function (button, open) {
                if (addList) {
                    if (!open) {
                        addList.dismiss(true);
                    }
                    return;
                }
                addList = Ext.create('PVE.storage.TypePicker', {
                    storageView: me,
                    button,
                    listeners: {
                        destroy: () => {
                            addList = undefined;
                        },
                    },
                });
                addList.showBelow();
            };

            me.pluginMetadata = {};

            let run_editor = function () {
                let rec = sm.getSelection()[0];
                if (!rec) {
                    return;
                }
                let { type, storage } = rec.data;
                me.createStorageEditWindow(type, storage);
            };

            let edit_btn = new Proxmox.button.Button({
                text: gettext('Edit'),
                disabled: true,
                selModel: sm,
                handler: run_editor,
            });
            let remove_btn = Ext.create('Proxmox.button.StdRemoveButton', {
                selModel: sm,
                baseurl: '/storage/',
                callback: () => me.reloadStore(),
            });

            Ext.apply(me, {
                store: {
                    model: 'pve-storage',
                    defaultRootId: '/', // cannot collide with a storage ID
                    sorters: ['storage'],
                },
                selModel: sm,
                viewConfig: {
                    trackOver: false,
                    toggleOnDblClick: false,
                },
                tbar: [
                    {
                        text: gettext('Add'),
                        // the arrow of a menu button, as the entries drop down below it
                        split: true,
                        ariaAttributes: { 'aria-haspopup': 'dialog', 'aria-expanded': 'false' },
                        handler: (button) => toggleAddList(button),
                        // Down opens the list like the menu of a menu button
                        onDownKey: function (event) {
                            event.stopEvent();
                            toggleAddList(this, true);
                            return false;
                        },
                    },
                    remove_btn,
                    edit_btn,
                ],
                columns: [
                    {
                        xtype: 'treecolumn',
                        header: 'ID',
                        flex: 2,
                        minWidth: 200,
                        sortable: true,
                        dataIndex: 'storage',
                    },
                    {
                        header: gettext('Type'),
                        flex: 1,
                        sortable: true,
                        dataIndex: 'type',
                        renderer: (value, metaData, record) =>
                            me.renderStorageType(value, metaData, record),
                    },
                    {
                        header: gettext('Content'),
                        flex: 3,
                        sortable: true,
                        dataIndex: 'content',
                        renderer: PVE.Utils.format_storage_content,
                    },
                    {
                        header: gettext('Path') + '/' + gettext('Target'),
                        flex: 2,
                        sortable: true,
                        dataIndex: 'location',
                        renderer: Ext.htmlEncode,
                    },
                    {
                        header: gettext('Shared'),
                        flex: 1,
                        sortable: true,
                        dataIndex: 'shared',
                        renderer: Proxmox.Utils.format_boolean,
                    },
                    {
                        header: gettext('Enabled'),
                        flex: 1,
                        sortable: true,
                        dataIndex: 'disable',
                        renderer: Proxmox.Utils.format_neg_boolean,
                    },
                    {
                        header: gettext('Bandwidth Limit'),
                        flex: 2,
                        sortable: true,
                        dataIndex: 'bwlimit',
                    },
                ],
                listeners: {
                    activate: () => {
                        me.reloadStore();
                        // otherwise only editing a custom storage would retry
                        if (me.pluginMetadataError && !me.pluginMetadataLoading) {
                            me.loadPluginMetadata();
                        }
                    },
                    itemcollapse: (parent) => {
                        if (sm.getSelection()[0]?.parentNode === parent) {
                            sm.deselectAll();
                        }
                    },
                    itemdblclick: run_editor,
                },
            });

            me.callParent();

            me.loadPluginMetadata();
        },
    },
    function () {
        Ext.define('pve-storage', {
            extend: 'Ext.data.TreeModel',
            fields: [
                'location',
                'type',
                'content',
                'storage',
                { name: 'shared', type: 'boolean' },
                { name: 'disable', type: 'boolean' },
            ],
            idProperty: 'storage',
        });
    },
);
