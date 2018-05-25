Ext.define('PVE.qemu.Summary', {
    extend: 'Ext.panel.Panel',
    alias: 'widget.pveQemuSummary',

    scrollable: true,
    bodyPadding: 5,

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

	var template = !!me.pveSelNode.data.template;
	var rstore = me.statusStore;

	var width = template ? 1 : 0.5;
	var items = [
	    {
		xtype: template ? 'pveTemplateStatusView' : 'pveGuestStatusView',
		responsiveConfig: {
		    'width < 1900': {
			columnWidth: width
		    },
		    'width >= 1900': {
			columnWidth: width / 2
		    }
		},
		itemId: 'gueststatus',
		pveSelNode: me.pveSelNode,
		rstore: rstore
	    },
	    {
		xtype: 'pveNotesView',
		maxHeight: 330,
		itemId: 'notesview',
		pveSelNode: me.pveSelNode,
		responsiveConfig: {
		    'width < 1900': {
			columnWidth: width
		    },
		    'width >= 1900': {
			columnWidth: width / 2
		    }
		}
	    }
	];

	var rrdstore;
	if (!template) {

	    rrdstore = Ext.create('Proxmox.data.RRDStore', {
		rrdurl: "/api2/json/nodes/" + nodename + "/qemu/" + vmid + "/rrddata",
		model: 'pve-rrd-guest'
	    });

	    items.push(
		{
		    xtype: 'proxmoxRRDChart',
		    title: gettext('CPU usage'),
		    pveSelNode: me.pveSelNode,
		    fields: ['cpu'],
		    fieldTitles: [gettext('CPU usage')],
		    store: rrdstore
		},
		{
		    xtype: 'proxmoxRRDChart',
		    title: gettext('Memory usage'),
		    pveSelNode: me.pveSelNode,
		    fields: ['maxmem', 'mem'],
		    fieldTitles: [gettext('Total'), gettext('RAM usage')],
		    store: rrdstore
		},
		{
		    xtype: 'proxmoxRRDChart',
		    title: gettext('Network traffic'),
		    pveSelNode: me.pveSelNode,
		    fields: ['netin','netout'],
		    store: rrdstore
		},
		{
		    xtype: 'proxmoxRRDChart',
		    title: gettext('Disk IO'),
		    pveSelNode: me.pveSelNode,
		    fields: ['diskread','diskwrite'],
		    store: rrdstore
		}
	    );

	}

	Ext.apply(me, {
	    tbar: [ '->', { xtype: 'proxmoxRRDTypeSelector' } ],
	    items: [
		{
		    xtype: 'container',
		    layout: {
			type: 'column'
		    },
		    defaults: {
			minHeight: 330,
			padding: 5,
			plugins: 'responsive',
			responsiveConfig: {
			    'width < 1900': {
				columnWidth: 1
			    },
			    'width >= 1900': {
				columnWidth: 0.5
			    }
			}
		    },
		    items: items
		}
	    ]
	});

	me.callParent();
	if (!template) {
	    rrdstore.startUpdate();
	    me.on('destroy', rrdstore.stopUpdate);
	}
    }
});
