var labelWidth = 120;

Ext.define('PVE.lxc.MemoryEdit', {
    extend: 'PVE.window.Edit',

    initComponent : function() {
	var me = this;

	Ext.apply(me, {
	    subject: gettext('Memory'),
	    items: Ext.create('PVE.lxc.MemoryInputPanel')
	});

	me.callParent();

	me.load();
    }
});


Ext.define('PVE.lxc.CPUEdit', {
    extend: 'PVE.window.Edit',

    initComponent : function() {
	var me = this;

	Ext.apply(me, {
	    subject: gettext('CPU'),
	    items: Ext.create('PVE.lxc.CPUInputPanel')
	});

	me.callParent();

	me.load();
    }
});

Ext.define('PVE.lxc.CPUInputPanel', {
    extend: 'PVE.panel.InputPanel',
    alias: 'widget.pveLxcCPUInputPanel',

    insideWizard: false,

    initComponent : function() {
	var me = this;

	var items = [
	    {
		xtype: 'numberfield',
		name: 'cpulimit',
		minValue: 0,
		value: '1',
		step: 1,
		fieldLabel: gettext('CPU limit'),
		labelWidth: labelWidth,
		allowBlank: false
	    },
	    {
		xtype: 'numberfield',
		name: 'cpuunits',
		fieldLabel: gettext('CPU units'),
		value: 1024,
		minValue: 8,
		maxValue: 500000,
		labelWidth: labelWidth,
		allowBlank: false
	    }
	];

 	if (me.insideWizard) {
	    me.column1 = items;
	} else {
	    me.items = items;
	}
   
	me.callParent();
    }
});

Ext.define('PVE.lxc.MemoryInputPanel', {
    extend: 'PVE.panel.InputPanel',
    alias: 'widget.pveLxcMemoryInputPanel',

    insideWizard: false,

    initComponent : function() {
	var me = this;

	var items = [
	    {
		xtype: 'numberfield',
		name: 'memory',
		minValue: 32,
		maxValue: 512*1024,
		value: '512',
		step: 32,
		fieldLabel: gettext('Memory (MB)'),
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
		fieldLabel: gettext('Swap (MB)'),
		labelWidth: labelWidth,
		allowBlank: false
	    }
	];

	if (me.insideWizard) {
	    me.column1 = items;
	} else {
	    me.items = items;
	}
 
	me.callParent();
    }
});
