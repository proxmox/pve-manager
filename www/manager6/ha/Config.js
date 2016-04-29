Ext.define('PVE.panel.HA', {
    extend: 'PVE.panel.SubConfig',
    alias: 'widget.pveHAPanel',

    configPrefix: 'ha',

    initComponent: function() {
	/*jslint confusion: true */
        var me = this;

	var items = [
	    {
		title: gettext('Status'),
		xtype: 'pveHAStatusView',
		itemId: 'status'
	    },
	    {
		title: gettext('Resources'),
		xtype: 'pveHAResourcesView',
		itemId: 'resources'
	    },
	    {
		title: gettext('Groups'),
		xtype: 'pveHAGroupsView',
		itemId: 'groups'
	    },
	    {
		title: gettext('Fencing'),
		xtype: 'pveFencingView',
		itemId: 'fencing'
	    }
	];

	Ext.apply(me, {
	    defaults: {
		border: false,
		pveSelNode: me.pveSelNode
	    },
	    plugins: [{
		ptype: 'lazyitems',
		items: items
	    }]
	});

	me.callParent();
    }
});
