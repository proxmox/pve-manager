Ext.define('PVE.qemu.DisplayEdit', {
    extend: 'PVE.window.Edit',

    initComponent : function() {
	var me = this;

	Ext.apply(me, {
	    subject: gettext('Display'),
	    width: 350,
	    items: {
		xtype: 'DisplaySelector',
		name: 'vga',
		value: '',
		fieldLabel: gettext('Graphic card')
	    }
	});

	me.callParent();

	me.load();
    }
});
