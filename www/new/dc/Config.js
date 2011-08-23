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
		    title: 'Summary',
		    itemId: 'summary',
		    html: 'summary '
		},
		{
		    title: 'Storage',
		    itemId: 'storage',
		    html: 'storage '
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
