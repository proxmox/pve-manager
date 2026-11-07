Ext.define('PVE.storage.ZFSInputPanel', {
    extend: 'PVE.panel.StorageBase',

    statics: {
        // The view model flags of the provider-specific fields for an iSCSI provider.
        providerState: function (provider) {
            return {
                isLIO: provider === 'LIO',
                isComstar: provider === 'comstar',
                hasWriteCacheOption: provider === 'comstar' || provider === 'istgt',
            };
        },

        // The fields, also used by the remote storage wizard. Fields of a new storage are editable.
        // Provider-specific fields bind to the providerState() flags: for a new storage they are
        // disabled for other providers, and with hideInactive also hidden.
        fields: function (isCreate, hideInactive) {
            let text = (config) => ({
                xtype: isCreate ? 'textfield' : 'displayfield',
                value: '',
                ...config,
            });
            let onlyFor = (flag) => {
                if (!isCreate) {
                    return { hidden: `{!${flag}}` };
                }
                let bind = { disabled: `{!${flag}}` };
                if (hideInactive) {
                    bind.hidden = `{!${flag}}`;
                }
                return bind;
            };
            let lioTpg = text({
                name: 'lio_tpg',
                bind: onlyFor('isLIO'),
                allowBlank: false,
                fieldLabel: gettext('Target portal group'),
            });
            if (isCreate && hideInactive) {
                // inactive for the default provider until the binding applies
                lioTpg.disabled = true;
                lioTpg.hidden = true;
            }
            return {
                portal: text({ name: 'portal', fieldLabel: gettext('Portal'), allowBlank: false }),
                pool: text({ name: 'pool', fieldLabel: gettext('Pool'), allowBlank: false }),
                blocksize: text({
                    name: 'blocksize',
                    value: '4k',
                    fieldLabel: gettext('Block Size'),
                    allowBlank: false,
                    validator: PVE.Utils.validateZfsBlocksize,
                }),
                target: text({ name: 'target', fieldLabel: gettext('Target'), allowBlank: false }),
                comstarTg: text({
                    name: 'comstar_tg',
                    fieldLabel: gettext('Target group'),
                    bind: onlyFor('isComstar'),
                    allowBlank: true,
                }),
                provider: {
                    xtype: isCreate ? 'pveiScsiProviderSelector' : 'displayfield',
                    name: 'iscsiprovider',
                    value: 'comstar',
                    fieldLabel: gettext('iSCSI Provider'),
                    allowBlank: false,
                },
                sparse: {
                    xtype: 'proxmoxcheckbox',
                    name: 'sparse',
                    checked: false,
                    uncheckedValue: 0,
                    fieldLabel: gettext('Thin provision'),
                },
                writecache: {
                    xtype: 'proxmoxcheckbox',
                    name: 'writecache',
                    checked: true,
                    bind: onlyFor('hasWriteCacheOption'),
                    uncheckedValue: 0,
                    fieldLabel: gettext('Write cache'),
                },
                comstarHg: text({
                    name: 'comstar_hg',
                    bind: onlyFor('isComstar'),
                    fieldLabel: gettext('Host group'),
                    allowBlank: true,
                }),
                lioTpg: lioTpg,
            };
        },

        // The API takes the inverse of the write cache checkbox.
        submitWriteCache: function (values) {
            values.nowritecache = values.writecache ? 0 : 1;
            delete values.writecache;
        },
    },

    viewModel: {
        parent: null,
        data: {
            isLIO: false,
            isComstar: true,
            hasWriteCacheOption: true,
        },
    },

    controller: {
        xclass: 'Ext.app.ViewController',
        control: {
            'field[name=iscsiprovider]': {
                change: 'changeISCSIProvider',
            },
        },
        changeISCSIProvider: function (f, newVal, oldVal) {
            this.getViewModel().set(PVE.storage.ZFSInputPanel.providerState(newVal));
        },
    },

    onGetValues: function (values) {
        var me = this;

        if (me.isCreate) {
            values.content = 'images';
        }

        PVE.storage.ZFSInputPanel.submitWriteCache(values);

        return me.callParent([values]);
    },

    setValues: function (values) {
        values.writecache = values.nowritecache ? 0 : 1;
        this.callParent([values]);
    },

    initComponent: function () {
        var me = this;

        let fields = PVE.storage.ZFSInputPanel.fields(me.isCreate);

        me.column1 = [
            fields.portal,
            fields.pool,
            fields.blocksize,
            fields.target,
            fields.comstarTg,
        ];

        me.column2 = [
            fields.provider,
            fields.sparse,
            fields.writecache,
            fields.comstarHg,
            fields.lioTpg,
        ];

        me.callParent();
    },
});
