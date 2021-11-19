Ext.define('PVE.panel.OpenIDInputPanel', {
    extend: 'PVE.panel.AuthBase',
    xtype: 'pveAuthOpenIDPanel',
    mixins: ['Proxmox.Mixin.CBind'],

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

    columnT: [
	{
	    xtype: 'textfield',
	    name: 'issuer-url',
	    fieldLabel: gettext('Issuer URL'),
	    allowBlank: false,
	},
    ],

    column1: [
	{
	    xtype: 'proxmoxtextfield',
	    fieldLabel: gettext('Client ID'),
	    name: 'client-id',
	    allowBlank: false,
	},
	{
	    xtype: 'proxmoxtextfield',
	    fieldLabel: gettext('Client Key'),
	    cbind: {
		deleteEmpty: '{!isCreate}',
	    },
	    name: 'client-key',
	},
    ],

    column2: [
	{
	    xtype: 'proxmoxcheckbox',
	    fieldLabel: gettext('Autocreate Users'),
	    name: 'autocreate',
	    value: 0,
	    cbind: {
		deleteEmpty: '{!isCreate}',
	    },
	},
	{
	    xtype: 'pmxDisplayEditField',
	    name: 'username-claim',
	    fieldLabel: gettext('Username Claim'),
	    editConfig: {
		xtype: 'proxmoxKVComboBox',
		editable: true,
		comboItems: [
		    ['__default__', Proxmox.Utils.defaultText],
		    ['subject', 'subject'],
		    ['username', 'username'],
		    ['email', 'email'],
		],
	    },
	    cbind: {
		value: get => get('isCreate') ? '__default__' : Proxmox.Utils.defaultText,
		deleteEmpty: '{!isCreate}',
		editable: '{isCreate}',
	    },
	},
    ],

    initComponent: function() {
	let me = this;

	if (me.type !== 'openid') {
	    throw 'invalid type';
	}

	me.callParent();
    },
});

