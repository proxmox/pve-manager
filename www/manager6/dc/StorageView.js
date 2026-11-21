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
                            'storage,type,content,path,target,monhost,shared,disable,bwlimit',
                        );
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

                // the UI knows some types, but deliberately does not offer them
                if (PVE.Utils.storageSchema[metadata.type]?.hideAdd) {
                    continue;
                }

                me.addMenu.add({
                    text: me.renderStorageType(metadata.type),
                    iconCls: 'fa fa-fw fa-folder',
                    handler: () => me.createStorageEditWindow(metadata.type),
                });
            }

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

            // else we cannot dynamically generate the add menu handlers
            let addHandleGenerator = function (type) {
                return function () {
                    me.createStorageEditWindow(type);
                };
            };
            let addMenuItems = [];
            for (const [type, storage] of Object.entries(PVE.Utils.storageSchema)) {
                if (storage.hideAdd) {
                    continue;
                }
                addMenuItems.push({
                    text: PVE.Utils.format_storage_type(type),
                    iconCls: 'fa fa-fw fa-' + storage.faIcon,
                    handler: addHandleGenerator(type),
                });
            }

            me.addMenu = new Ext.menu.Menu({
                items: addMenuItems,
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
                        menu: me.addMenu,
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
                        renderer: PVE.Utils.format_content_types,
                    },
                    {
                        header: gettext('Path') + '/' + gettext('Target'),
                        flex: 2,
                        sortable: true,
                        dataIndex: 'path',
                        renderer: function (value, metaData, record) {
                            return Ext.htmlEncode(record.data.target || value);
                        },
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
                'path',
                'type',
                'content',
                'target',
                'storage',
                { name: 'shared', type: 'boolean' },
                { name: 'disable', type: 'boolean' },
            ],
            idProperty: 'storage',
        });
    },
);
