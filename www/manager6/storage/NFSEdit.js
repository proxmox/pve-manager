Ext.define('PVE.storage.NFSScan', {
    extend: 'Ext.form.field.ComboBox',
    alias: 'widget.pveNFSScan',

    queryParam: 'server',

    valueField: 'path',
    displayField: 'path',
    matchFieldWidth: false,
    listConfig: {
        loadingText: gettext('Scanning...'),
        emptyText: PVE.Utils.renderNotFound(gettext('NFS export')),
        width: 350,
    },
    doRawQuery: function () {
        // do nothing
    },

    onTriggerClick: function () {
        var me = this;

        if (!me.queryCaching || me.lastQuery !== me.nfsServer) {
            me.store.removeAll();
        }

        me.allQuery = me.nfsServer;

        me.callParent();
    },

    setServer: function (server) {
        var me = this;

        me.nfsServer = server;
    },

    initComponent: function () {
        var me = this;

        if (!me.nodename) {
            me.nodename = 'localhost';
        }

        var store = Ext.create('Ext.data.Store', {
            fields: ['path', 'options'],
            proxy: {
                type: 'proxmox',
                url: '/api2/json/nodes/' + me.nodename + '/scan/nfs',
            },
        });

        store.sort('path', 'ASC');

        Ext.apply(me, {
            store: store,
        });

        me.callParent();

        PVE.Utils.monPickerStoreErrors(me, store);
    },
});

Ext.define('PVE.storage.NFSInputPanel', {
    extend: 'PVE.panel.StorageBase',

    statics: {
        // The connection fields, also used by the remote storage wizard. Fields of a new storage
        // are editable.
        connectionFields: function (isCreate) {
            let server = {
                xtype: isCreate ? 'textfield' : 'displayfield',
                name: 'server',
                value: '',
                fieldLabel: gettext('Server'),
                allowBlank: false,
            };
            if (isCreate) {
                server.listeners = {
                    change: function (field, value) {
                        let exportField = field.up('inputpanel').down('field[name=export]');
                        exportField.setServer(value);
                        exportField.setValue('');
                    },
                };
            }
            return {
                server: server,
                export: {
                    xtype: isCreate ? 'pveNFSScan' : 'displayfield',
                    name: 'export',
                    value: '',
                    fieldLabel: 'Export',
                    allowBlank: false,
                },
                version: {
                    xtype: 'proxmoxKVComboBox',
                    fieldLabel: gettext('NFS Version'),
                    name: 'nfsversion',
                    value: '__default__',
                    deleteEmpty: false,
                    comboItems: [
                        ['__default__', Proxmox.Utils.defaultText],
                        ['3', '3'],
                        ['4', '4'],
                        ['4.1', '4.1'],
                        ['4.2', '4.2'],
                    ],
                },
            };
        },

        // The mount options with the vers= option of the NFS version field.
        optionsWithVersion: function (options, version) {
            let res = options.filter((item) => !item.match(/^vers=(.*)$/));
            if (version && version !== '__default__') {
                res.push('vers=' + version);
            }
            return res.join(',');
        },
    },

    onlineHelp: 'storage_nfs',

    options: [],

    onGetValues: function (values) {
        var me = this;

        values.options = PVE.storage.NFSInputPanel.optionsWithVersion(
            me.options,
            values.nfsversion,
        );
        delete values.nfsversion;
        if (values.options === '') {
            delete values.options;
            if (!me.isCreate) {
                values.delete = 'options';
            }
        }

        return me.callParent([values]);
    },

    setValues: function (values) {
        var me = this;
        if (values.options) {
            me.options = values.options.split(',');
            me.options.forEach(function (item) {
                var match = item.match(/^vers=(.*)$/);
                if (match) {
                    values.nfsversion = match[1];
                }
            });
        }
        return me.callParent([values]);
    },

    initComponent: function () {
        var me = this;

        let connection = PVE.storage.NFSInputPanel.connectionFields(me.isCreate);

        me.column1 = [
            connection.server,
            connection.export,
            {
                xtype: 'pveContentTypeSelector',
                name: 'content',
                value: 'images',
                multiSelect: true,
                fieldLabel: gettext('Content'),
                allowBlank: false,
            },
        ];

        me.advancedColumn2 = [connection.version];

        me.callParent();
    },
});
