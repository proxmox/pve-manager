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
		name: 'server',
		fieldLabel: gettext('Server'),
		editable: me.isCreate,
		emptyText: gettext('IP address or hostname'),
		allowBlank: false,
	    },
	    {
		xtype: 'textfield',
		name: 'username',
		fieldLabel: gettext('Username'),
		allowBlank: false,
	    },
	    {
		xtype: 'proxmoxtextfield',
		name: 'password',
		fieldLabel: gettext('Password'),
		inputType: 'password',
		emptyText: gettext('Unchanged'),
		minLength: 1,
		allowBlank: !me.isCreate,
	    },
	];

	me.column2 = [
	    {
		xtype: 'proxmoxcheckbox',
		name: 'skip-cert-verification',
		fieldLabel: gettext('Skip Certificate Verification'),
		value: false,
		uncheckedValue: 0,
		defaultValue: 0,
		deleteDefaultValue: !me.isCreate,
	    },
	];

	me.callParent();
    },
});
