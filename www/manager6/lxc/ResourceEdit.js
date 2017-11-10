/*jslint confusion: true */
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

    onlineHelp: 'pct_cpu',

    insideWizard: false,

    onGetValues: function(values) {
	var me = this;

	PVE.Utils.delete_if_default(values, 'cores', '', me.insideWizard);
	// cpu{limit,unit} aren't in the wizard so create is always false
	PVE.Utils.delete_if_default(values, 'cpulimit', '0', 0);
	PVE.Utils.delete_if_default(values, 'cpuunits', '1024', 0);

	return values;
    },

    initComponent : function() {
	var me = this;

	var column1 = [
            {
                xtype: 'pveIntegerField',
                name: 'cores',
		minValue: 1,
		maxValue: 128,
		value: me.insideWizard ? 1 : '',
		fieldLabel: gettext('Cores'),
		allowBlank: true,
                emptyText: gettext('unlimited')
            }
	];

	var column2 = [
	    {
		xtype: 'numberfield',
		name: 'cpulimit',
		minValue: 0,
		value: '',
		step: 1,
		fieldLabel: gettext('CPU limit'),
		labelWidth: labelWidth,
		allowBlank: true,
                emptyText: gettext('unlimited')
	    },
	    {
		xtype: 'pveIntegerField',
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
	    me.column1 = column1;
	} else {
	    me.column1 = column1;
	    me.column2 = column2;
	}
   
	me.callParent();
    }
});

Ext.define('PVE.lxc.MemoryInputPanel', {
    extend: 'PVE.panel.InputPanel',
    alias: 'widget.pveLxcMemoryInputPanel',

    onlineHelp: 'pct_memory',

    insideWizard: false,

    initComponent : function() {
	var me = this;

	var items = [
	    {
		xtype: 'pveIntegerField',
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
		xtype: 'pveIntegerField',
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

	if (me.insideWizard) {
	    me.column1 = items;
	} else {
	    me.items = items;
	}
 
	me.callParent();
    }
});
