Ext.define('PVE.storage.ESXIInputPanel', {
    extend: 'PVE.panel.StorageBase',

    onGetValues: function(values) {
	let me = this;

	if (values.password?.length === 0) {
	    delete values.password;
	}
	if (values.username?.length === 0) {
	    delete values.username;
	}

	return me.callParent([values]);
    },

    initComponent: function() {
	var me = this;

	me.column1 = [
	    {
		xtype: 'pmxDisplayEditField',
		editable: me.isCreate,
		name: 'server',
		fieldLabel: gettext('Server'),
		allowBlank: false,
	    },
	    {
		xtype: 'pmxDisplayEditField',
		editable: me.isCreate,
		name: 'username',
		fieldLabel: gettext('Username'),
		allowBlank: false,
	    },
	    {
		xtype: 'pmxDisplayEditField',
		editable: me.isCreate,
		name: 'password',
		value: me.isCreate ? '' : '********',
		minLength: 1,
		editConfig: {
		    inputType: 'password',
		    name: 'password',
		},
		fieldLabel: gettext('Password'),
		allowBlank: false,
	    },
	];

	me.callParent();
    },
});
