Ext.define('PVE.storage.Summary', {
    extend: 'Ext.panel.Panel',
    alias: 'widget.pveStorageSummary',
    scrollable: true,
    bodyPadding: 10,
    defaults: {
	style: {'padding-top':'10px'},
	width: 770
    },
    tbar: [
	'->',
	{
	    xtype: 'proxmoxRRDTypeSelector'
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

	var rstore  = Ext.create('PVE.data.ObjectStore', {
	    url: "/api2/json/nodes/" + nodename + "/storage/" + storage + "/status",
	    interval: 1000
	});

	var statusview = Ext.create('PVE.storage.StatusView', {
	    pveSelNode: me.pveSelNode,
	    rstore: rstore,
	    style: {'padding-top':'0px'}
	});

	var rrdstore = Ext.create('Proxmox.data.RRDStore', {
	    rrdurl:  "/api2/json/nodes/" + nodename + "/storage/" + storage + "/rrddata",
	    model: 'pve-rrd-storage'
	});

	Ext.apply(me, {
	    items: [
		statusview,
		{
		    xtype: 'proxmoxRRDChart',
		    title: gettext('Usage'),
		    fields: ['total','used'],
		    fieldTitles: ['Total Size', 'Used Size'],
		    store: rrdstore
		}
	    ],
	    listeners: {
		activate: function() { rstore.startUpdate(); rrdstore.startUpdate(); },
		destroy: function() { rstore.stopUpdate(); rrdstore.stopUpdate(); }
	    }
	});

	me.callParent();
    }
});
