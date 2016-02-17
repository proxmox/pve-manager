Ext.define('PVE.node.DNSEdit', {
    extend: 'PVE.window.Edit',
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
                fieldLabel: gettext('Search domain'),
                name: 'search',
                allowBlank: false
	    },
	    {
		xtype: 'pvetextfield',
                fieldLabel: gettext('DNS server') + " 1",
		vtype: 'IP64Address',
		skipEmptyText: true,
                name: 'dns1'
	    },
	    {
		xtype: 'pvetextfield',
		fieldLabel: gettext('DNS server') + " 2",
		vtype: 'IP64Address',
		skipEmptyText: true,
                name: 'dns2'
	    },
	    {
		xtype: 'pvetextfield',
                fieldLabel: gettext('DNS server') + " 3",
		vtype: 'IP64Address',
		skipEmptyText: true,
                name: 'dns3'
	    }
	];

	Ext.applyIf(me, {
	    subject: gettext('DNS'),
	    url: "/api2/extjs/nodes/" + nodename + "/dns",
	    fieldDefaults: {
		labelWidth: 120
	    }
	});

	me.callParent();

	me.load();
    }
});
