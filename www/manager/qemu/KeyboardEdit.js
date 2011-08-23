Ext.define('PVE.qemu.KeyboardEdit', {
    extend: 'PVE.window.Edit',

    initComponent : function() {
	var me = this;

	Ext.applyIf(me, {
	    title: "Edit keyboard settings",
	    items: {
		xtype: 'VNCKeyboardSelector',
		name: 'keyboard',
		value: '',
		fieldLabel: 'Keyboard Layout'
	    }
	});

	me.callParent();

	me.load();
    }
});
