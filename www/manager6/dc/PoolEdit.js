Ext.define('PVE.dc.PoolEdit', {
    extend: 'Proxmox.window.Edit',
    alias: ['widget.pveDcPoolEdit'],
    mixins: ['Proxmox.Mixin.CBind'],

    subject: gettext('Pool'),

    cbindData: {
        poolid: '',
        isCreate: (cfg) => !cfg.poolid,
    },

    cbind: {
        url: (get) => `/api2/extjs/pools/${!get('isCreate') ? '?poolid=' + get('poolid') : ''}`,
        method: (get) => (get('isCreate') ? 'POST' : 'PUT'),
    },

    items: [
        {
            xtype: 'inputpanel',
            onGetValues: function (values) {
                if (Ext.isString(values.parentPool) && values.parentPool.length > 0) {
                    values.poolid = values.parentPool + '/' + values.poolid;
                }
                delete values.parentPool;
                return values;
            },
            items: [
                {
                    xtype: 'pmxDisplayEditField',
                    fieldLabel: gettext('Name'),
                    cbind: {
                        editable: '{isCreate}',
                        value: '{poolid}',
                    },
                    editConfig: {
                        regex: /^[^/]+$/,
                    },
                    name: 'poolid',
                    allowBlank: false,
                },
                {
                    xtype: 'pvePoolSelector',
                    name: 'parentPool',
                    fieldLabel: gettext('Parent Pool'),
                    allowBlank: true,
                    maxLevel: 2,
                    emptyText: Proxmox.Utils.NoneText,
                    cbind: {
                        disabled: '{!isCreate}',
                        hidden: '{!isCreate}',
                    },
                },
                {
                    xtype: 'textfield',
                    fieldLabel: gettext('Comment'),
                    name: 'comment',
                    allowBlank: true,
                },
            ],
        },
    ],

    initComponent: function () {
        let me = this;
        me.callParent();
        if (me.poolid) {
            me.load({
                success: function (response) {
                    let data = response.result.data;
                    if (Ext.isArray(data)) {
                        me.setValues(data[0]);
                    } else {
                        me.setValues(data);
                    }
                },
            });
        }
    },
});
