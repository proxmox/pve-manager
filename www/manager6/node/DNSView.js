Ext.define('PVE.node.DNSView', {
    extend: 'PVE.grid.ObjectGrid',
    alias: ['widget.pveNodeDNSView'],

    onlineHelp: 'sysadmin_network_configuration',

    initComponent : function() {
	var me = this;

	var nodename = me.pveSelNode.data.node;
	if (!nodename) {
	    throw "no node name specified";
	}

	var run_editor = function() {
	    var win = Ext.create('PVE.node.DNSEdit', { 
		pveSelNode: me.pveSelNode
	    });
	    win.show();
	};

	Ext.apply(me, {
	    url: "/api2/json/nodes/" + nodename + "/dns",
	    cwidth1: 130,
	    interval: 1000,
	    rows: {
		search: { header: 'Search domain', required: true },
		dns1: { header: gettext('DNS server') + " 1", required: true },
		dns2: { header: gettext('DNS server') + " 2" },
		dns3: { header: gettext('DNS server') + " 3" }
	    },
	    tbar: [ 
		{
		    text: gettext("Edit"),
		    handler: run_editor
		}
	    ],
	    listeners: {
		itemdblclick: run_editor
	    }
	});

	me.callParent();

	me.on('activate', me.rstore.startUpdate);
	me.on('destroy', me.rstore.stopUpdate);	
    }
});
