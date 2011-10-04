Ext.define('PVE.window.NotesEdit', {
    extend: 'PVE.window.Edit',

    initComponent : function() {
	var me = this;

	Ext.apply(me, {
	    title: "Notes",
	    width: 600,
	    layout: 'fit',
	    items: {
		xtype: 'textarea',
		name: 'description',
		rows: 7,
		value: '',
		hideLabel: true
	    }
	});

	me.callParent();

	me.load();
    }
});
