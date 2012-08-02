Ext.define('PVE.openvz.RessourceInputPanel', {
    extend: 'PVE.panel.InputPanel',
    alias: 'widget.pveOpenVZResourceInputPanel',

    insideWizard: false,

    initComponent : function() {
	var me = this;

	var labelWidth = 120;

	me.column1 = [
	    {
		xtype: 'numberfield',
		name: 'memory',
		minValue: 32,
		maxValue: 512*1024,
		value: '512',
		step: 32,
		fieldLabel: gettext('Memory') + ' (MB)',
		labelWidth: labelWidth,
		allowBlank: false
	    },
	    {
		xtype: 'numberfield',
		name: 'swap',
		minValue: 0,
		maxValue: 128*1024,
		value: '512',
		step: 32,
		fieldLabel: gettext('Swap') + ' (MB)',
		labelWidth: labelWidth,
		allowBlank: false
	    }
	];

	me.column2 = [
	    {
		xtype: 'numberfield',
		name: 'disk',
		minValue: 0.001,
		maxValue: 128*1024,
		decimalPrecision: 3,
		value: '4',
		step: 1,
		fieldLabel: gettext('Disk size') + ' (GB)',
		labelWidth: labelWidth,
		allowBlank: false
	    },
	    {
		xtype: 'numberfield',
		name: 'cpus',
		minValue: 1,
		value: '1',
		step: 1,
		fieldLabel: 'CPUs',
		labelWidth: labelWidth,
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
	    subject: gettext('Resources'),
	    items: Ext.create('PVE.openvz.RessourceInputPanel')
	});

	me.callParent();

	me.load();
    }
});