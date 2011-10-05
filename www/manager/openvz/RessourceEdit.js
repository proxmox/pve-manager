Ext.define('PVE.openvz.RessourceInputPanel', {
    extend: 'PVE.panel.InputPanel',
    alias: 'widget.pveOpenVZResourceInputPanel',

    insideWizard: false,

    initComponent : function() {
	var me = this;

	me.column1 = [
	    {
		xtype: 'numberfield',
		name: 'memory',
		minValue: 32,
		maxValue: 128*1024,
		value: '512',
		step: 32,
		fieldLabel: 'Memory (MB)',
		allowBlank: false
	    },
	    {
		xtype: 'numberfield',
		name: 'swap',
		minValue: 0,
		maxValue: 128*1024,
		value: '512',
		step: 32,
		fieldLabel: 'Swap (MB)',
		allowBlank: false
	    }
	];

	me.column2 = [
	    {
		xtype: 'numberfield',
		name: 'disk',
		minValue: 0.5,
		value: '4',
		step: 1,
		fieldLabel: 'Disk space (GB)',
		allowBlank: false
	    },
	    {
		xtype: 'numberfield',
		name: 'cpus',
		minValue: 1,
		value: '1',
		step: 1,
		fieldLabel: 'CPUs',
		allowBlank: false
	    }
	];

	me.callParent();
    }
});

Ext.define('PVE.openvz.RessourceEdit', {
    extend: 'PVE.window.Edit',

    initComponent : function() {
	var me = this;
	
	Ext.apply(me, {
	    title: "Edit ressource settings",
	    items: Ext.create('PVE.openvz.RessourceInputPanel')
	});

	me.callParent();

	me.load();
    }
});