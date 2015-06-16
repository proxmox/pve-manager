Ext.define('PVE.dc.GroupEdit', {
    extend: 'PVE.window.Edit',
    alias: ['widget.pveDcGroupEdit'],

    initComponent : function() {
        var me = this;

        me.create = !me.groupid;

        var url;
        var method;

        if (me.create) {
            url = '/api2/extjs/access/groups';
            method = 'POST';
        } else {
            url = '/api2/extjs/access/groups/' + me.groupid;
            method = 'PUT';
        }

        Ext.applyIf(me, {
            subject: gettext('Group'),
            url: url,
            method: method,
            items: [
                {
		    xtype: me.create ? 'pvetextfield' : 'displayfield',
		    fieldLabel: gettext('Name'),
		    name: 'groupid',
		    value: me.groupid,
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

        if (!me.create) {
            me.load();
        }
    }
});
