Ext.define('PVE.pool.Config', {
    extend: 'PVE.panel.Config',
    alias: 'widget.pvePoolConfig',

    initComponent: function() {
        var me = this;

	var pool = me.pveSelNode.data.pool;
	if (!pool) {
	    throw "no pool specified";
	}

	Ext.apply(me, {
	    title: Ext.String.format(gettext("Resource Pool") + ': ' + pool),
	    hstateid: 'pooltab',
	    items: [
		{
		    title: gettext('Summary'),
		    xtype: 'pvePoolSummary',
		    itemId: 'summary'
		},
		{
		    title: gettext('Members'),
		    xtype: 'pvePoolMembers',
		    pool: pool,
		    itemId: 'members'
		},
		{
		    xtype: 'pveACLView',
		    title: gettext('Permissions'),
		    itemId: 'permissions',
		    path: '/pool/' + pool
		}
	    ]
	});

	me.callParent();
   }
});
