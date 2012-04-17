Ext.define('PVE.dc.Config', {
    extend: 'PVE.panel.Config',
    alias: 'widget.PVE.dc.Config',

    initComponent: function() {
        var me = this;

	var caps = Ext.state.Manager.get('GuiCap');

	me.items = [];

	Ext.apply(me, {
	    title: gettext("Datacenter"),
	    hstateid: 'dctab'
	});

	if (caps.dc['Sys.Audit']) {
	    me.items.push([
		{
		    title: gettext('Summary'),
		    xtype: 'pveDcSummary',
		    itemId: 'summary'
		},
		{
		    xtype: 'pveDcOptionView',
		    title: gettext('Options'),
		    itemId: 'options'
		}
	    ]);
	}

	if (caps.storage['Datastore.Allocate'] || caps.dc['Sys.Audit']) {
	    me.items.push({
		xtype: 'pveStorageView',
		title: gettext('Storage'),
		itemId: 'storage'
	    });
	}

	if (caps.dc['Sys.Audit']) {
	    me.items.push({
		xtype: 'pveDcBackupView',
		title: gettext('Backup'),
		itemId: 'backup'
	    });
	}

	me.items.push({
	    xtype: 'pveUserView',
	    title: gettext('Users'),
	    itemId: 'users'
	});

	if (caps.dc['Sys.Audit']) {
	    me.items.push([
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
	    ]);

	    me.items.push({
		xtype: 'pveDcSupport',
		title: gettext('Support'),
		itemId: 'support'
	    });
	}

	me.callParent();
   }
});
