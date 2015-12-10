Ext.define('PVE.qemu.BiosEdit', {
    extend: 'PVE.window.Edit',

    initComponent : function() {
	var me = this;

	Ext.applyIf(me, {
	    subject: 'BIOS',
	    items: {
		xtype: 'pveQemuBiosSelector',
		name: 'bios',
		value: '',
		fieldLabel: 'BIOS'
	    }
	});

	me.callParent();

	me.load();
    }
});
