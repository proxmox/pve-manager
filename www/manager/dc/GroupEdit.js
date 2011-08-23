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
            title: me.create ? "Create Group" :  "Edit Group '" + me.groupid + "'",
            url: url,
            method: method,
            items: [
                {
		    xtype: 'pvetextfield',
		    fieldLabel: 'GroupID',
		    name: 'groupid',
		    value: me.groupid,
		    allowBlank: false
		},
                {
		    xtype: 'pvetextfield',
		    fieldLabel: 'Comment',
		    name: 'comment',
		    value: me.groupid,
		    allowBlank: false
		}
            ]
        });

        me.callParent();

        if (!me.create) {
            me.load();
        }
    }
});

