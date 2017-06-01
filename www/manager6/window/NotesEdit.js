Ext.define('PVE.window.NotesEdit', {
    extend: 'PVE.window.Edit',

    initComponent : function() {
	var me = this;

	Ext.apply(me, {
	    title: gettext('Notes'),
	    width: 600,
	    height: '400px',
	    resizable: true,
	    layout: 'fit',
	    defaultButton: undefined,
	    items: {
		xtype: 'textarea',
		name: 'description',
		height: '100%',
		value: '',
		hideLabel: true
	    }
	});

	me.callParent();

	me.load();
    }
});
