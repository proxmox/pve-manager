Ext.define('PVE.node.TimeEdit', {
    extend: 'PVE.window.Edit',
    alias: ['widget.pveNodeTimeEdit'],

    initComponent : function() {
	var me = this;

	var nodename = me.pveSelNode.data.node;
	if (!nodename) {
	    throw "no node name specified";
	}

	Ext.applyIf(me, {
	    subject: gettext('Time zone'),
	    url: "/api2/extjs/nodes/" + nodename + "/time",
	    fieldDefaults: {
		labelWidth: 70
            },
	    width: 400,
	    items: {
		xtype: 'combo',
		fieldLabel: gettext('Time zone'),
		name: 'timezone',
		queryMode: 'local',
		store: Ext.create('PVE.data.TimezoneStore'),
		valueField: 'zone',
		displayField: 'zone',
		triggerAction: 'all',
		forceSelection: true,
		editable: false,
		allowBlank: false
	    }
	});

	me.callParent();

	me.load();
    }
});
