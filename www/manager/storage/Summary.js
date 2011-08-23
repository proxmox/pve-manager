Ext.define('PVE.storage.Summary', {
    extend: 'Ext.panel.Panel',
    alias: 'widget.pveStorageSummary',

    initComponent: function() {
        var me = this;

	var nodename = me.pveSelNode.data.node;
	if (!nodename) {
	    throw "no node name specified";
	}

	var storage = me.pveSelNode.data.storage;
	if (!storage) {
	    throw "no storage ID specified";
	}

	var statusview = Ext.create('PVE.storage.StatusView', {
	    title: 'Status',
	    pveSelNode: me.pveSelNode,
	    style: 'padding-top:0px'
	});

	var rstore = statusview.rstore;

	var rrdurl = "/api2/png/nodes/" + nodename + "/storage/" + storage + "/rrd";

	Ext.apply(me, {
	    autoScroll: true,
	    bodyStyle: 'padding:10px',
	    defaults: {
		style: 'padding-top:10px',
		width: 800
	    },		
	    tbar: [
		'->',
		{
		    xtype: 'pveRRDTypeSelector'
		}
	    ],
	    items: [
		statusview,
		{
		    xtype: 'pveRRDView',
		    title: "Usage",
		    pveSelNode: me.pveSelNode,
		    datasource: 'total,used',
		    rrdurl: rrdurl
		}
	    ]
	});

	me.on('show', rstore.startUpdate);
	me.on('hide', rstore.stopUpdate);
	me.on('destroy', rstore.stopUpdate);	

	me.callParent();
    }
});
