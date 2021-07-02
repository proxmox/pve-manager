Ext.define('PVE.panel.OpenIDInputPanel', {
    extend: 'PVE.panel.AuthBase',
    xtype: 'pveAuthOpenIDPanel',

    initComponent: function() {
	let me = this;

	if (me.type !== 'openid') {
	    throw 'invalid type';
	}

	me.columnT = [
	    {
		xtype: 'textfield',
		name: 'issuer-url',
		fieldLabel: gettext('Issuer URL'),
		allowBlank: false,
	    },
	];

	me.column1 = [
	    {
		xtype: 'proxmoxtextfield',
		fieldLabel: gettext('Client ID'),
		name: 'client-id',
		allowBlank: false,
	    },
	    {
		xtype: 'proxmoxtextfield',
		fieldLabel: gettext('Client Key'),
		deleteEmpty: !me.isCreate,
		name: 'client-key',
	    },
	];

	me.column2 = [
	    {
		xtype: 'proxmoxcheckbox',
		fieldLabel: gettext('Autocreate Users'),
		name: 'autocreate',
		value: 0,
		deleteEmpty: !me.isCreate,
	    },
	    {
		xtype: 'pmxDisplayEditField',
		editConfig: {
		    xtype: 'proxmoxKVComboBox',
		},
		editable: me.isCreate,
		name: 'username-claim',
		value: me.isCreate ? '__default__' : Proxmox.Utils.defaultText,
		deleteEmpty: !me.isCreate,
		fieldLabel: gettext('Username Claim'),
		comboItems: [
		    ['__default__', Proxmox.Utils.defaultText],
		    ['subject', 'subject'],
		    ['username', 'username'],
		    ['email', 'email'],
		],
	    },
	];

	me.callParent();
    },
    onGetValues: function(values) {
	let me = this;

	if (!values.verify) {
	    if (!me.isCreate) {
		Proxmox.Utils.assemble_field_data(values, { 'delete': 'verify' });
	    }
	    delete values.verify;
	}

	return me.callParent([values]);
    },
});

