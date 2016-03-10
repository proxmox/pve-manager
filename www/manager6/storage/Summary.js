Ext.define('PVE.storage.Summary', {
    extend: 'Ext.panel.Panel',
    alias: 'widget.pveStorageSummary',
    scrollable: true,
    bodyPadding: 10,
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
	    pveSelNode: me.pveSelNode,
	    style: 'padding-top:0px'
	});

	var rstore = statusview.rstore;

	var rrdurl = "/api2/png/nodes/" + nodename + "/storage/" + storage + "/rrd";

	Ext.apply(me, {
	    items: [
		statusview,
		{
		    xtype: 'pveRRDView',
		    title: gettext('Usage'),
		    pveSelNode: me.pveSelNode,
		    datasource: 'total,used',
		    rrdurl: rrdurl
		}
	    ]
	});

	me.on('activate', rstore.startUpdate);
	me.on('hide', rstore.stopUpdate);
	me.on('destroy', rstore.stopUpdate);

	me.callParent();
    }
});
