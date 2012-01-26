Ext.define('PVE.dc.Config', {
    extend: 'PVE.panel.Config',
    alias: 'widget.PVE.dc.Config',

    initComponent: function() {
        var me = this;

	Ext.apply(me, {
	    title: gettext("Datacenter"),
	    hstateid: 'dctab',
	    items: [
		{
		    title: gettext('Summary'),
		    xtype: 'pveDcSummary',
		    itemId: 'summary'
		},
		{
		    xtype: 'pveDcOptionView',
		    title: gettext('Options'),
		    itemId: 'options'
		},
		{
		    xtype: 'pveStorageView',
		    title: gettext('Storage'),
		    itemId: 'storage'
		},
		{
		    xtype: 'pveDcBackupView',
		    title: gettext('Backup'),
		    itemId: 'backup'
		},
		{
		    xtype: 'pveUserView',
		    title: gettext('Users'),
		    itemId: 'users'
		},
		{
		    xtype: 'pveGroupView',
		    title: gettext('Groups'),
		    itemId: 'groups'
		},
		{
		    xtype: 'pvePoolView',
		    title: gettext('Pools'),
		    itemId: 'pools'
		},
		{
		    xtype: 'pveACLView',
		    title: gettext('Permissions'),
		    itemId: 'permissions'
		},
		{
		    xtype: 'pveRoleView',
		    title: gettext('Roles'),
		    itemId: 'roles'
		},
		{
		    xtype: 'pveAuthView',
		    title: gettext('Authentication'),
		    itemId: 'domains'
		},
		{
		    xtype: 'pveDcHAConfig',
		    title: 'HA',
		    itemId: 'ha'
		}
	    ]
	});

	me.callParent();
   }
});
