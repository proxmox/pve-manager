Ext.define('PVE.sdn.PrefixList', {
    extend: 'Ext.data.Model',
    fields: ['id', 'entries', 'pending'],

    getId: function () {
        let me = this;
        return me.data.pending?.[me.idProperty] ?? me.data[me.idProperty];
    },
});

Ext.define('PVE.sdn.PrefixListEntry', {
    extend: 'Ext.data.Model',
    fields: ['id', 'action', 'prefix', 'le', 'ge', 'pending'],
});

Ext.define('PVE.sdn.EditPrefixListWindow', {
    extend: 'Proxmox.window.Edit',

    subject: gettext('Prefix List'),

    url: '/cluster/sdn/prefix-lists',

    config: {
        entry: null,
    },

    isCreate: false,

    items: [
        {
            xtype: 'proxmoxtextfield',
            fieldLabel: gettext('Name'),
            name: 'id',
        },
    ],

    initComponent: function () {
        let me = this;
        me.method = me.isCreate ? 'POST' : 'PUT';
        me.callParent();

        me.setValues(me.getEntry());
    },
});

Ext.define('PVE.sdn.EditPrefixListEntryWindow', {
    extend: 'Proxmox.window.Edit',

    subject: gettext('Prefix List Entry'),

    url: '/cluster/sdn/prefix-lists',

    config: {
        entry: null,
    },

    isCreate: false,

    items: [
        {
            xtype: 'proxmoxKVComboBox',
            fieldLabel: gettext('Action'),
            name: 'action',
            comboItems: [
                ['permit', gettext('Permit')],
                ['deny', gettext('Deny')],
            ],
            allowBlank: false,
        },
        {
            xtype: 'proxmoxtextfield',
            fieldLabel: gettext('Prefix'),
            name: 'prefix',
            vtype: 'IP64CIDRAddress',
        },
        {
            xtype: 'proxmoxtextfield',
            fieldLabel: gettext('Prefix <='),
            name: 'le',
        },
        {
            xtype: 'proxmoxtextfield',
            fieldLabel: gettext('Prefix >='),
            name: 'ge',
        },
    ],

    initComponent: function () {
        let me = this;
        me.method = me.isCreate ? 'POST' : 'PUT';
        me.callParent();

        me.setValues(me.getEntry());
    },
});

Ext.define('PVE.sdn.PrefixListView', {
    extend: 'Ext.grid.GridPanel',
    alias: ['widget.pveSDNPrefixListView'],

    emptyText: gettext('No prefix list configured'),

    tbar: [
        {
            text: gettext('Add'),
            xtype: 'button',
            handler: 'addPrefixList',
        },
        {
            text: gettext('Remove'),
            xtype: 'button',
            handler: 'removePrefixList',
            bind: {
                disabled: '{!prefixListGrid.selection}',
            },
        },
        {
            text: gettext('Reload'),
            xtype: 'button',
            handler: 'reload',
        },
    ],

    columns: [
        {
            text: gettext('Name'),
            dataIndex: 'id',
            flex: 1,
            renderer: function (value, metaData, rec) {
                return PVE.Utils.render_sdn_pending(rec, value, 'id', 1);
            },
        },
        {
            text: gettext('State'),
            width: 100,
            dataIndex: 'state',
            renderer: function (value, metaData, rec) {
                return PVE.Utils.render_sdn_pending_state(rec, value);
            },
        },
    ],
});

Ext.define('PVE.sdn.PrefixListEntriesView', {
    extend: 'Ext.grid.GridPanel',
    alias: ['widget.pveSDNPrefixListEntriesView'],

    emptyText: gettext('Prefix List has no entries configured.'),

    config: {
        prefixList: null,
    },

    viewConfig: {
        plugins: [
            {
                ptype: 'gridviewdragdrop',
            },
        ],
    },

    listeners: {
        drop: 'saveEntries',
        itemdblclick: 'editPrefixListEntry',
    },

    columns: [
        {
            width: 40,
            resizable: false,
            sortable: false,
            hideable: false,
            menuDisabled: true,
            renderer: function (value, metaData, record, rowIdx, colIdx) {
                metaData.tdCls = Ext.baseCSSPrefix + 'grid-cell-special';
                return "<i class='pve-grid-fa fa fa-fw fa-reorder cursor-move'></i>";
            },
        },
        {
            text: gettext('Action'),
            dataIndex: 'action',
            flex: 1,
        },
        {
            text: gettext('Prefix'),
            dataIndex: 'prefix',
            flex: 1,
        },
        {
            text: gettext('Prefix <='),
            dataIndex: 'le',
            flex: 1,
        },
        {
            text: gettext('Prefix >='),
            dataIndex: 'ge',
            flex: 1,
        },
    ],

    tbar: [
        {
            text: gettext('Add'),
            xtype: 'button',
            handler: 'addPrefixListEntry',
            bind: {
                disabled: '{!prefixListGrid.selection}',
            },
        },
        {
            text: gettext('Edit'),
            xtype: 'button',
            handler: 'editPrefixListEntry',
            bind: {
                disabled: '{!prefixListEntriesGrid.selection}',
            },
        },
        {
            text: gettext('Remove'),
            xtype: 'button',
            handler: 'removePrefixListEntry',
            bind: {
                disabled: '{!prefixListEntriesGrid.selection}',
            },
        },
    ],
});

Ext.define('PVE.sdn.PrefixListPanel', {
    extend: 'Ext.panel.Panel',
    alias: ['widget.pveSDNPrefixLists'],

    emptyText: gettext('No prefix list configured'),

    viewModel: {
        stores: {
            prefixLists: {
                autoLoad: true,
                model: 'PVE.sdn.PrefixList',
                proxy: {
                    type: 'proxmox',
                    url: '/api2/json/cluster/sdn/prefix-lists?pending=1',
                },
            },
            prefixListEntries: {
                model: 'PVE.sdn.PrefixListEntry',
                proxy: {
                    type: 'proxmox',
                    reader: {
                        transform: {
                            fn: function (response) {
                                let entries = response.data.entries ?? [];
                                return entries.map(PVE.Parser.parsePropertyString);
                            },
                        },
                    },
                },
            },
        },
        formulas: {
            entryGridEmptyText: function (get) {
                let selection = get('prefixListGrid.selection');

                return selection
                    ? gettext('Prefix List has no entries configured.')
                    : gettext('no Prefix List selected');
            },
        },
    },

    controller: {
        reload: function () {
            let me = this;

            let prefixList = me.getViewModel().get('prefixListGrid.selection');

            me.getViewModel()
                .getStore('prefixLists')
                .load((records, _operation, success) => {
                    if (!success || !prefixList) {
                        return;
                    }

                    let newPrefixList = records.find((record) => {
                        return record.getId() === prefixList.getId();
                    });

                    me.lookupReference('prefixListGrid').setSelection(newPrefixList);
                });
        },
        saveEntries: function () {
            let me = this;

            let prefixList = me.getViewModel().get('prefixListGrid.selection');

            let entries = me
                .getViewModel()
                .getStore('prefixListEntries')
                .getData()
                .items.map((item) => {
                    let data = item.data;
                    delete data.id;

                    return PVE.Parser.printPropertyString(data);
                });

            let params = {};

            if (entries.length > 0) {
                params.entries = entries;
            } else {
                params = { delete: ['entries'] };
            }

            Proxmox.Async.api2({
                url: `/api2/extjs/cluster/sdn/prefix-lists/${prefixList.getId()}`,
                params,
                method: 'PUT',
            })
                .catch(Proxmox.Utils.alertResponseFailure)
                .finally(() => {
                    me.reload(prefixList);
                });
        },
        selectPrefixList: function (gridPanel, record, index, options) {
            let me = this;

            let url = `/api2/extjs/cluster/sdn/prefix-lists/${record.getId()}`;
            let entryStore = me.getViewModel().getStore('prefixListEntries');

            entryStore.getProxy().setUrl(url);
            entryStore.load();
        },
        addPrefixList: function () {
            let me = this;

            Ext.create('PVE.sdn.EditPrefixListWindow', {
                autoShow: true,
                isCreate: true,
                listeners: {
                    close: () => me.reload(),
                },
            });
        },
        removePrefixList: function () {
            let me = this;
            let prefixList = me.getViewModel().get('prefixListGrid.selection');

            Ext.Msg.show({
                title: gettext('Confirm'),
                icon: Ext.Msg.WARNING,
                message: Ext.String.format(gettext('Remove prefix list "{0}"?'), prefixList.getId()),
                buttons: Ext.Msg.YESNO,
                defaultFocus: 'no',
                callback: function (btn) {
                    if (btn !== 'yes') {
                        return;
                    }

                    Proxmox.Async.api2({
                        url: `/api2/extjs/cluster/sdn/prefix-lists/${prefixList.getId()}`,
                        method: 'DELETE',
                    })
                        .catch(Proxmox.Utils.alertResponseFailure)
                        .finally(() => {
                            me.reload(prefixList);
                        });
                },
            });
        },
        addPrefixListEntry: function () {
            let panel = this;

            Ext.create('PVE.sdn.EditPrefixListEntryWindow', {
                autoShow: true,
                isCreate: true,
                submit: function () {
                    let me = this;

                    panel.getViewModel().getStore('prefixListEntries').add(me.getValues());
                    panel.saveEntries();

                    me.close();
                },
            });
        },
        editPrefixListEntry: function () {
            let panel = this;

            let entry = panel.getViewModel().get('prefixListEntriesGrid.selection');

            if (!entry) {
                console.warn('no prefix list entry selected!');
                return;
            }

            Ext.create('PVE.sdn.EditPrefixListEntryWindow', {
                autoShow: true,
                isCreate: false,
                entry: entry.data,
                submit: function () {
                    let me = this;
                    entry.set(me.getValues());

                    panel.saveEntries();

                    me.close();
                },
            });
        },
        removePrefixListEntry: function () {
            let me = this;

            let entry = me.getViewModel().get('prefixListEntriesGrid.selection');

            Ext.Msg.show({
                title: gettext('Confirm'),
                icon: Ext.Msg.WARNING,
                message: gettext('Remove prefix list entry?'),
                buttons: Ext.Msg.YESNO,
                defaultFocus: 'no',
                callback: function (btn) {
                    if (btn !== 'yes') {
                        return;
                    }

                    me.getViewModel().getStore('prefixListEntries').remove(entry);
                    me.saveEntries();
                },
            });
        },
    },

    layout: 'border',

    items: [
        {
            xtype: 'pveSDNPrefixListView',
            region: 'west',
            width: '50%',
            border: false,
            split: true,
            reference: 'prefixListGrid',
            bind: {
                store: '{prefixLists}',
            },
            listeners: {
                select: 'selectPrefixList',
            },
        },
        {
            xtype: 'pveSDNPrefixListEntriesView',
            region: 'center',
            border: false,
            bind: {
                prefixList: '{prefixListGrid.selection}',
                store: '{prefixListEntries}',
                emptyText: '{entryGridEmptyText}',
            },
            reference: 'prefixListEntriesGrid',
        },
    ],
});
