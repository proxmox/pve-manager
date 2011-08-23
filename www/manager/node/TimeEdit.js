Ext.define('PVE.node.TimeEdit', {
    extend: 'PVE.window.Edit',
    requires: ['PVE.data.TimezoneStore'],
    alias: ['widget.pveNodeTimeEdit'],

    initComponent : function() {
	var me = this;

	var nodename = me.pveSelNode.data.node;
	if (!nodename) {
	    throw "no node name specified";
	}

	Ext.applyIf(me, {
	    title: "Set time zone",
	    url: "/api2/extjs/nodes/" + nodename + "/time",
	    fieldDefaults: {
		labelWidth: 70
            },
	    width: 400,
	    items: {
		xtype: 'combo',
		fieldLabel: 'Time zone',
		name: 'timezone',
		queryMode: 'local',
		store: new PVE.data.TimezoneStore({autoDestory: true}),
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
