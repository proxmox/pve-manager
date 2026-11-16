Ext.define(
    'PVE.form.StorageSelector',
    {
        extend: 'Proxmox.form.ComboGrid',
        alias: 'widget.pveStorageSelector',
        mixins: ['Proxmox.Mixin.CBind'],

        cbindData: {
            clusterView: false,
        },

        allowBlank: false,
        valueField: 'storage',
        displayField: 'storage',
        listConfig: {
            cbind: {
                clusterView: '{clusterView}',
            },
            width: 450,
            columns: [
                {
                    header: gettext('Name'),
                    dataIndex: 'storage',
                    hideable: false,
                    flex: 1,
                },
                {
                    header: gettext('Type'),
                    width: 75,
                    dataIndex: 'type',
                },
                {
                    header: gettext('Avail'),
                    width: 90,
                    dataIndex: 'avail',
                    renderer: Proxmox.Utils.format_size,
                    cbind: {
                        hidden: '{clusterView}',
                    },
                },
                {
                    header: gettext('Capacity'),
                    width: 90,
                    dataIndex: 'total',
                    renderer: Proxmox.Utils.format_size,
                    cbind: {
                        hidden: '{clusterView}',
                    },
                },
                {
                    header: gettext('Nodes'),
                    width: 120,
                    dataIndex: 'nodes',
                    renderer: (value) => (value ? value : '-- ' + gettext('All') + ' --'),
                    cbind: {
                        hidden: '{!clusterView}',
                    },
                },
                {
                    header: gettext('Shared'),
                    width: 70,
                    dataIndex: 'shared',
                    renderer: Proxmox.Utils.format_boolean,
                    cbind: {
                        hidden: '{!clusterView}',
                    },
                },
            ],
        },

        reloadStorageList: function () {
            let me = this;

            let filters = [];
            if (me.storageContent) {
                // A generic type asks for a storage for the disks of VMs or the volumes of
                // containers, not for one that only allows another volume type of the guest.
                let volumeType = { images: 'vm-vol', rootdir: 'ct-vol' }[me.storageContent];
                let required = me.volumeTypes ?? [volumeType ?? me.storageContent];
                filters.push((storage) =>
                    required.every((type) => PVE.Utils.contentAllows(storage.data.content, type)),
                );
            }

            if (me.clusterView) {
                me.getStore().setProxy({
                    type: 'proxmox',
                    url: `/api2/json/storage`,
                });

                // filter here, back-end does not support it currently
                filters.push((storage) => !storage.data.disable);

                if (me.nodename) {
                    filters.push(
                        (storage) =>
                            !storage.data.nodes || storage.data.nodes.includes(me.nodename),
                    );
                }
            } else {
                if (!me.nodename) {
                    return;
                }

                let params = {
                    format: 1,
                };
                if (me.storageContent) {
                    // nodes that do not know the volume types of guests only take the generic type
                    params.content =
                        PVE.Utils.genericContentType[me.storageContent] ?? me.storageContent;
                }
                if (me.targetNode) {
                    params.target = me.targetNode;
                    params.enabled = 1; // skip disabled storages
                }
                me.store.setProxy({
                    type: 'proxmox',
                    url: `/api2/json/nodes/${me.nodename}/storage`,
                    extraParams: params,
                });
            }

            me.getStore().clearFilter();
            me.getStore().setFilters(filters);

            me.store.load(() => me.validate());
        },

        // the volume types that a storage has to allow, if not the one storageContent stands for
        setVolumeTypes: function (volumeTypes) {
            let me = this;

            if (Ext.Array.equals(me.volumeTypes ?? [], volumeTypes ?? [])) {
                return;
            }

            me.volumeTypes = volumeTypes;

            me.reloadStorageList();
        },

        setTargetNode: function (targetNode) {
            var me = this;

            if (!targetNode || me.targetNode === targetNode) {
                return;
            }

            if (me.clusterView) {
                throw 'setting targetNode with clusterView is not implemented';
            }

            me.targetNode = targetNode;

            me.reloadStorageList();
        },

        setNodename: function (nodename) {
            var me = this;

            nodename = nodename || '';

            if (me.nodename === nodename) {
                return;
            }

            me.nodename = nodename;

            me.reloadStorageList();
        },

        initComponent: function () {
            var me = this;

            let nodename = me.nodename;
            me.nodename = undefined;

            var store = Ext.create('Ext.data.Store', {
                model: 'pve-storage-status',
                sorters: {
                    property: 'storage',
                    direction: 'ASC',
                },
            });

            Ext.apply(me, {
                store: store,
            });

            me.callParent();

            me.setNodename(nodename);
        },
    },
    function () {
        Ext.define('pve-storage-status', {
            extend: 'Ext.data.Model',
            fields: ['storage', 'active', 'type', 'avail', 'total', 'nodes', 'shared'],
            idProperty: 'storage',
        });
    },
);
