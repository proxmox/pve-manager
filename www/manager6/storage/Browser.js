Ext.define('PVE.storage.Browser', {
    extend: 'PVE.panel.Config',
    alias: 'widget.PVE.storage.Browser',

    onlineHelp: 'chapter_storage',

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


	me.items = [
	    {
		title: gettext('Summary'),
		xtype: 'pveStorageSummary',
		iconCls: 'fa fa-book',
		itemId: 'summary'
	    }
	];

	var caps = Ext.state.Manager.get('GuiCap');

	Ext.apply(me, {
	    title: Ext.String.format(gettext("Storage {0} on node {1}"),
				     "'" + storeid + "'", "'" + nodename + "'"),
	    hstateid: 'storagetab'
	});

	if (caps.storage['Datastore.Allocate']) {
	    me.items.push({
		xtype: 'pveStorageContentView',
		title: gettext('Content'),
		iconCls: 'fa fa-th',
		itemId: 'content'
	    });
	}

	if (caps.storage['Permissions.Modify']) {
	    me.items.push({
		xtype: 'pveACLView',
		title: gettext('Permissions'),
		iconCls: 'fa fa-unlock',
		itemId: 'permissions',
		path: '/storage/' + storeid
	    });
	}

	me.callParent();
   }
});
