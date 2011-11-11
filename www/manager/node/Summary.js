Ext.define('PVE.node.Summary', {
    extend: 'Ext.panel.Panel',
    alias: 'widget.pveNodeSummary',

    initComponent: function() {
        var me = this;

	var nodename = me.pveSelNode.data.node;
	if (!nodename) {
	    throw "no node name specified";
	}

	if (!me.statusStore) {
	    throw "no status storage specified";
	}

	var rstore = me.statusStore;

	var statusview = Ext.create('PVE.node.StatusView', {
	    title: 'Status',
	    pveSelNode: me.pveSelNode,
	    style: 'padding-top:0px',
	    rstore: rstore
	});

	var rrdurl = "/api2/png/nodes/" + nodename + "/rrd";
  
	Ext.apply(me, {
	    autoScroll: true,
	    bodyStyle: 'padding:10px',
	    defaults: {
		width: 800,
		style: 'padding-top:10px'
	    },		
	    tbar: [ '->', { xtype: 'pveRRDTypeSelector' } ],
	    items: [
		statusview,
		{
		    xtype: 'pveRRDView',
		    title: "CPU usage %",
		    datasource: 'cpu,iowait',
		    rrdurl: rrdurl
		},
		{
		    xtype: 'pveRRDView',
		    title: "Server load",
		    datasource: 'loadavg',
		    rrdurl: rrdurl
		},
		{
		    xtype: 'pveRRDView',
		    title: "Memory usage",
		    datasource: 'memtotal,memused',
		    rrdurl: rrdurl
		},
		{
		    xtype: 'pveRRDView',
		    title: "Network traffic",
		    datasource: 'netin,netout',
		    rrdurl: rrdurl
		}
	    ]
	});

	me.callParent();
    }
});
