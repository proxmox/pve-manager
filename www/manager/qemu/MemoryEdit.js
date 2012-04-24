Ext.define('PVE.qemu.MemoryInputPanel', {
    extend: 'PVE.panel.InputPanel',
    alias: 'widget.PVE.qemu.MemoryInputPanel',

    insideWizard: false,

    initComponent : function() {
	var me = this;

	var labelWidth = 120;

	var items = {
	    xtype: 'numberfield',
	    name: 'memory',
	    minValue: 32,
	    maxValue: 512*1024,
	    value: '512',
	    step: 32,
	    fieldLabel: gettext('Memory') + ' (MB)',
	    labelWidth: labelWidth,
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
	    items: Ext.create('PVE.qemu.MemoryInputPanel')
	});

	me.callParent();

	me.load();
    }
});