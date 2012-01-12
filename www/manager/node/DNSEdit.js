Ext.define('PVE.node.DNSEdit', {
    extend: 'PVE.window.Edit',
    requires: [
	'PVE.Utils'
    ],

    alias: ['widget.pveNodeDNSEdit'],

    initComponent : function() {
	var me = this;

	var nodename = me.pveSelNode.data.node;
	if (!nodename) {
	    throw "no node name specified";
	}

	me.items = [
	    {
		xtype: 'textfield',
                fieldLabel: 'Search domain',
                name: 'search',
                allowBlank: false
	    },
	    {
		xtype: 'pvetextfield',
                fieldLabel: 'First DNS server',
		vtype: 'IPAddress',
		skipEmptyText: true,
                name: 'dns1'
	    },
	    {
		xtype: 'pvetextfield',
		fieldLabel: 'Second DNS server',
		vtype: 'IPAddress',
		skipEmptyText: true,
                name: 'dns2'
	    },
	    {
		xtype: 'pvetextfield',
                fieldLabel: 'Third DNS server',
		vtype: 'IPAddress',
		skipEmptyText: true,
                name: 'dns3'
	    }
	];

	Ext.applyIf(me, {
	    subject: 'DNS',
	    url: "/api2/extjs/nodes/" + nodename + "/dns",
	    fieldDefaults: {
		labelWidth: 120
	    }
	});

	me.callParent();

	me.load();
    }
});
