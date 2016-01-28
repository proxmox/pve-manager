/*
 * Datacenter config panel, located in the center of the ViewPort after the Datacenter view is selected
 */

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
	    me.items.push({
	    title: gettext('Summary'),
		xtype: 'pveDcSummary',
		itemId: 'summary'
		});

	    me.items.push({
	    xtype: 'pveDcOptionView',
		title: gettext('Options'),
		itemId: 'options'
		});
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
	    me.items.push({
		    xtype: 'pveGroupView',
		    title: gettext('Groups'),
		    itemId: 'groups'
		});

	    me.items.push({
		    xtype: 'pvePoolView',
		    title: gettext('Pools'),
		    itemId: 'pools'
		});

	    me.items.push({
		    xtype: 'pveACLView',
		    title: gettext('Permissions'),
		    itemId: 'permissions'
		});

	    me.items.push({
		    xtype: 'pveRoleView',
		    title: gettext('Roles'),
		    itemId: 'roles'
		});

	    me.items.push({
		    xtype: 'pveAuthView',
		    title: gettext('Authentication'),
		    itemId: 'domains'
		});

	    me.items.push({
//		    xtype: 'pveHAPanel',
//		    title: 'HA',
	        xtype: 'gridpanel',
	        title: 'HATODO',
	        phstateid: me.hstateid,
		    itemId: 'ha'
		});

	    me.items.push({
//		    xtype: 'pveFirewallPanel',
//		    title: gettext('Firewall'),
	        xtype: 'gridpanel',
	        title: 'FireTODO',
		    base_url: '/cluster/firewall',
		    fwtype: 'dc',
		    phstateid: me.hstateid,
		    itemId: 'firewall'
		});

	    me.items.push({
		xtype: 'pveDcSupport',
		title: gettext('Support'),
		itemId: 'support'
	    });
	}

	me.callParent();
   }
});
