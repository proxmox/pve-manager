Ext.define('PVE.storage.Browser', {
    extend: 'PVE.panel.Config',
    alias: 'widget.PVE.storage.Browser',

    initComponent: function() {
        var me = this;

	var nodename = me.pveSelNode.data.node;
	if (!nodename) 
	    throw "no node name specified";

	var storeid = me.pveSelNode.data.storage;
	if (!storeid) 
	    throw "no storage ID specified";

	Ext.apply(me, {
	    title: "Storage '" + storeid + "'" + "' on node '" + nodename + "'",
	    hstateid: 'storagetab',
	    items: [
		{
		    title: 'Summary',
		    //xtype: 'pveStorageSummary',
		    itemId: 'summary'
		},
		{
		    //xtype: 'pveStorageContent',
		    title: 'Content',
		    itemId: 'content'
		},
		{
		    title: 'Permissions',
		    itemId: 'permissions',
		    html: 'Permissions '
		}
	    ]
	});

	me.callParent();
   }
});
