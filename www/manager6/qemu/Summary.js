Ext.define('PVE.qemu.Summary', {
    extend: 'Ext.panel.Panel',
    alias: 'widget.pveQemuSummary',

    tbar: [ '->', { xtype: 'pveRRDTypeSelector' } ],
    scrollable: true,
    bodyPadding: 10,
    defaults: {
	style: {'padding-top':'10px'},
	width: 800
    },
    initComponent: function() {
        var me = this;

	var nodename = me.pveSelNode.data.node;
	if (!nodename) {
	    throw "no node name specified";
	}

	var vmid = me.pveSelNode.data.vmid;
	if (!vmid) {
	    throw "no VM ID specified";
	}

	if (!me.workspace) {
	    throw "no workspace specified";
	}

	if (!me.statusStore) {
	    throw "no status storage specified";
	}

	var rstore = me.statusStore;

	var statusview = Ext.create('PVE.qemu.StatusView', {
	    title: gettext('Status'),
	    pveSelNode: me.pveSelNode,
	    width: 400,
	    rstore: rstore
	});

	var notesview = Ext.create('PVE.panel.NotesView', {
	    pveSelNode: me.pveSelNode,
	    flex: 1
	});

	var rrdstore = Ext.create('PVE.data.RRDStore', {
	    rrdurl: "/api2/json/nodes/" + nodename + "/qemu/" + vmid + "/rrddata",
	});

	Ext.apply(me, {
	    plugins: {
		ptype: 'lazyitems',
		items: [
		    {
			style: {'padding-top':'0px'},
			layout: {
			    type: 'hbox',
			    align: 'stretchmax'
			},
			border: false,
			items: [ statusview, notesview ]
		    },
		    {
			xtype: 'pveRRDChart',
			title: gettext('CPU usage'),
			pveSelNode: me.pveSelNode,
			fields: ['cpu'],
			fieldTitles: [gettext('CPU usage')],
			store: rrdstore
		    },
		    {
			xtype: 'pveRRDChart',
			title: gettext('Memory usage'),
			pveSelNode: me.pveSelNode,
			fields: ['maxmem', 'mem'],
			fieldTitles: [gettext('Total'), gettext('RAM usage')],
			store: rrdstore
		    },
		    {
			xtype: 'pveRRDChart',
			title: gettext('Network traffic'),
			pveSelNode: me.pveSelNode,
			fields: ['netin','netout'],
			store: rrdstore
		    },
		    {
			xtype: 'pveRRDChart',
			title: gettext('Disk IO'),
			pveSelNode: me.pveSelNode,
			fields: ['diskread','diskwrite'],
			store: rrdstore
		    }
		],
	    },
	    listeners: {
		activate: function() {notesview.load(); rrdstore.startUpdate();},
		hide: rrdstore.stopUpdate,
		destroy: rrdstore.stopUpdate,
	    }
	});

	me.callParent();
    }
});
