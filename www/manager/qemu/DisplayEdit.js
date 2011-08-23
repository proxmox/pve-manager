Ext.define('PVE.qemu.DisplayEdit', {
    extend: 'PVE.window.Edit',

    initComponent : function() {
	var me = this;

	Ext.apply(me, {
	    title: "Edit display settings",
	    width: 350,
	    items: {
		xtype: 'DisplaySelector',
		name: 'vga',
		value: '',
		fieldLabel: 'Graphic card'
	    }
	});

	me.callParent();

	me.load();
    }
});
