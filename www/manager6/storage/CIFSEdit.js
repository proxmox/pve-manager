Ext.define('PVE.storage.CIFSScan', {
    extend: 'Ext.form.field.ComboBox',
    alias: 'widget.pveCIFSScan',

    queryParam: 'server',

    valueField: 'share',
    displayField: 'share',
    matchFieldWidth: false,
    listConfig: {
        loadingText: gettext('Scanning...'),
        width: 350,
    },
    doRawQuery: Ext.emptyFn,

    onTriggerClick: function () {
        var me = this;

        if (!me.queryCaching || me.lastQuery !== me.cifsServer) {
            me.store.removeAll();
        }

        var params = {};
        if (me.cifsUsername) {
            params.username = me.cifsUsername;
        }
        if (me.cifsPassword) {
            params.password = me.cifsPassword;
        }
        if (me.cifsDomain) {
            params.domain = me.cifsDomain;
        }

        me.store.getProxy().setExtraParams(params);
        me.allQuery = me.cifsServer;

        me.callParent();
    },

    resetProxy: function () {
        let me = this;
        me.lastQuery = null;
        if (!me.readOnly && !me.disabled) {
            if (me.isExpanded) {
                me.collapse();
            }
        }
    },

    setServer: function (server) {
        if (this.cifsServer !== server) {
            this.cifsServer = server;
            this.resetProxy();
        }
    },
    setUsername: function (username) {
        if (this.cifsUsername !== username) {
            this.cifsUsername = username;
            this.resetProxy();
        }
    },
    setPassword: function (password) {
        if (this.cifsPassword !== password) {
            this.cifsPassword = password;
            this.resetProxy();
        }
    },
    setDomain: function (domain) {
        if (this.cifsDomain !== domain) {
            this.cifsDomain = domain;
            this.resetProxy();
        }
    },

    initComponent: function () {
        var me = this;

        if (!me.nodename) {
            me.nodename = 'localhost';
        }

        let store = Ext.create('Ext.data.Store', {
            fields: ['description', 'share'],
            proxy: {
                type: 'proxmox',
                url: '/api2/json/nodes/' + me.nodename + '/scan/cifs',
            },
        });
        store.sort('share', 'ASC');

        Ext.apply(me, {
            store: store,
        });

        me.callParent();

        PVE.Utils.monPickerStoreErrors(me, store);
    },
});

Ext.define('PVE.storage.CIFSInputPanel', {
    extend: 'PVE.panel.StorageBase',

    statics: {
        // The connection fields, also used by the remote storage wizard. Fields of a new storage
        // are editable and update the share scan.
        connectionFields: function (isCreate) {
            let text = (config, scanSetter) => {
                let field = { xtype: isCreate ? 'textfield' : 'displayfield', ...config };
                if (isCreate && scanSetter) {
                    field.listeners = {
                        change: function (f, value) {
                            let shareField = f.up('inputpanel').down('field[name=share]');
                            shareField[scanSetter](value);
                            if (scanSetter === 'setServer') {
                                shareField.setValue('');
                            }
                        },
                    };
                }
                return field;
            };
            return {
                server: text(
                    { name: 'server', value: '', fieldLabel: gettext('Server'), allowBlank: false },
                    'setServer',
                ),
                username: text(
                    {
                        name: 'username',
                        value: '',
                        fieldLabel: gettext('Username'),
                        emptyText: gettext('Guest user'),
                    },
                    'setUsername',
                ),
                password: text(
                    {
                        inputType: 'password',
                        name: 'password',
                        value: isCreate ? '' : '********',
                        emptyText: isCreate ? gettext('None') : '',
                        fieldLabel: gettext('Password'),
                        minLength: 1,
                    },
                    'setPassword',
                ),
                share: {
                    xtype: isCreate ? 'pveCIFSScan' : 'displayfield',
                    name: 'share',
                    value: '',
                    fieldLabel: 'Share',
                    allowBlank: false,
                },
                domain: text(
                    {
                        name: 'domain',
                        value: isCreate ? '' : undefined,
                        fieldLabel: gettext('Domain'),
                        allowBlank: true,
                    },
                    'setDomain',
                ),
                subdir: {
                    xtype: 'pmxDisplayEditField',
                    editable: isCreate,
                    name: 'subdir',
                    fieldLabel: gettext('Subdirectory'),
                    allowBlank: true,
                    emptyText: gettext('/some/path'),
                },
            };
        },

        // Optional connection fields that are left empty are not submitted.
        dropEmptyOptions: function (values) {
            for (const option of ['username', 'password', 'domain', 'subdir']) {
                if (values[option]?.length === 0) {
                    delete values[option];
                }
            }
        },
    },

    onlineHelp: 'storage_cifs',

    onGetValues: function (values) {
        let me = this;

        PVE.storage.CIFSInputPanel.dropEmptyOptions(values);

        return me.callParent([values]);
    },

    initComponent: function () {
        var me = this;

        let connection = PVE.storage.CIFSInputPanel.connectionFields(me.isCreate);

        me.column1 = [
            connection.server,
            connection.username,
            connection.password,
            connection.share,
        ];

        me.column2 = [
            {
                xtype: 'pveContentTypeSelector',
                name: 'content',
                value: 'images',
                multiSelect: true,
                fieldLabel: gettext('Content'),
                allowBlank: false,
            },
            connection.domain,
            connection.subdir,
        ];

        me.callParent();
    },
});
