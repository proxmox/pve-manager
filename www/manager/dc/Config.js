Ext.define('PVE.dc.Config', {
    extend: 'PVE.panel.Config',
    alias: 'widget.PVE.dc.Config',

    initComponent: function() {
        var me = this;

	Ext.apply(me, {
	    title: "Datacenter",
	    hstateid: 'dctab',
	    items: [
		{
		    xtype: 'pveDcOptionView',
		    title: 'Options',
		    itemId: 'options'
		},
		{
		    xtype: 'pveStorageView',
		    title: 'Storage',
		    itemId: 'storage'
		},
		{
		    title: 'Backup',
		    itemId: 'backup',
		    html: 'Backup/vzdump Configuration - not implemented!'
		},
		{
		    xtype: 'pveUserView',
		    title: 'Users',
		    itemId: 'users'
		},
		{
		    xtype: 'pveGroupView',
		    title: 'Groups',
		    itemId: 'groups'
		},
		{
		    xtype: 'pveACLView',
		    title: 'Permissions',
		    itemId: 'permissions'
		},
		{
		    xtype: 'pveRoleView',
		    title: 'Roles',
		    itemId: 'roles'
		},
		{
		    xtype: 'pveAuthView',
		    title: 'Authentication',
		    itemId: 'domains'
		}
	    ]
	});

	me.callParent();
   }
});
