Ext.define('PVE.storage.SheepdogInputPanel', {
    extend: 'PVE.panel.StorageBase',

    onGetValues: function(values) {
	var me = this;

	if (me.isCreate) {
            values.content = 'images';
	}

	return me.callParent([values]);
    },

    initComponent : function() {
	var me = this;

	me.column1 = [
	    {
		xtype: me.isCreate ? 'textfield' : 'displayfield',
		name: 'portal',
		value: '127.0.0.1:7000',
		fieldLabel: gettext('Gateway'),
		allowBlank: false
	    }
	];
	me.column2 = [];

	me.callParent();
    }
});
