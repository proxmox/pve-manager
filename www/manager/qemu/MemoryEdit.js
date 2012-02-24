Ext.define('PVE.qemu.MemoryInputPanel', {
    extend: 'PVE.panel.InputPanel',
    alias: 'widget.PVE.qemu.MemoryInputPanel',

    insideWizard: false,

    initComponent : function() {
	var me = this;

	var items = {
	    xtype: 'numberfield',
	    name: 'memory',
	    minValue: 32,
	    maxValue: 128*1024,
	    value: '512',
	    step: 32,
	    fieldLabel: gettext('Memory') + ' (MB)',
	    allowBlank: false
	};

	if (me.insideWizard) {
	    me.column1 = items;
	} else {
	    me.items = items;
	}

	me.callParent();
    }
});

Ext.define('PVE.qemu.MemoryEdit', {
    extend: 'PVE.window.Edit',

    initComponent : function() {
	var me = this;
	
	Ext.apply(me, {
	    subject: gettext('Memory'),
	    fieldDefaults: { labelWidth: 120 },
	    items: Ext.create('PVE.qemu.MemoryInputPanel')
	});

	me.callParent();

	me.load();
    }
});