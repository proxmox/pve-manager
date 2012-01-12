Ext.define('PVE.storage.Browser', {
    extend: 'PVE.panel.Config',
    alias: 'widget.PVE.storage.Browser',

    initComponent: function() {
        var me = this;

	var nodename = me.pveSelNode.data.node;
	if (!nodename) {
	    throw "no node name specified";
	}

	var storeid = me.pveSelNode.data.storage;
	if (!storeid) {
	    throw "no storage ID specified";
	}

	Ext.apply(me, {
	    title: Ext.String.format(gettext("Storage {0} on node {1}"), 
				     "'" + storeid + "'", "'" + nodename + "'"),
	    hstateid: 'storagetab',
	    items: [
		{
		    title: gettext('Summary'),
		    xtype: 'pveStorageSummary',
		    itemId: 'summary'
		},
		{
		    xtype: 'pveStorageContentView',
		    title: gettext('Content'),
		    itemId: 'content'
		},
		{
		    xtype: 'pveACLView',
		    title: gettext('Permissions'),
		    itemId: 'permissions',
		    path: '/storage/' + storeid
		}
	    ]
	});

	me.callParent();
   }
});
