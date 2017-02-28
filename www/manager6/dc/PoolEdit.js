Ext.define('PVE.dc.PoolEdit', {
    extend: 'PVE.window.Edit',
    alias: ['widget.pveDcPoolEdit'],

    initComponent : function() {
        var me = this;

        me.isCreate = !me.poolid;

        var url;
        var method;

        if (me.isCreate) {
            url = '/api2/extjs/pools';
            method = 'POST';
        } else {
            url = '/api2/extjs/pools/' + me.poolid;
            method = 'PUT';
        }

        Ext.applyIf(me, {
            subject: gettext('Pool'),
            url: url,
            method: method,
            items: [
                {
		    xtype: me.isCreate ? 'pvetextfield' : 'displayfield',
		    fieldLabel: gettext('Name'),
		    name: 'poolid',
		    value: me.poolid,
		    allowBlank: false
		},
                {
		    xtype: 'textfield',
		    fieldLabel: gettext('Comment'),
		    name: 'comment',
		    allowBlank: true
		}
            ]
        });

        me.callParent();

        if (!me.isCreate) {
            me.load();
        }
    }
});
