Ext.define('PVE.storage.PBSInputPanel', {
    extend: 'PVE.panel.StorageBase',

    //onlineHelp: 'storage_pbs',

    initComponent: function() {
	var me = this;

	me.column1 = [
	    {
		xtype: me.isCreate ? 'textfield' : 'displayfield',
		name: 'server',
		value: '',
		vtype: 'DnsOrIp',
		fieldLabel: gettext('Server'),
		allowBlank: false,
	    },
	    {
		xtype: me.isCreate ? 'textfield' : 'displayfield',
		name: 'username',
		value: '',
		emptyText: gettext('Example') + ': admin@pbs',
		fieldLabel: gettext('Username'),
		regex: /\S+@\w+/,
		regexText: gettext('Example') + ': admin@pbs',
		allowBlank: false,
	    },
	    {
		xtype: me.isCreate ? 'textfield' : 'displayfield',
		inputType: 'password',
		name: 'password',
		value: me.isCreate ? '' : '********',
		emptyText: me.isCreate ? gettext('None') : '',
		fieldLabel: gettext('Password'),
		minLength: 5,
	    },
	    {
		xtype: me.isCreate ? 'textfield' : 'displayfield',
		name: 'datastore',
		value: '',
		fieldLabel: 'Datastore',
		allowBlank: false,
	    },
	];

	me.column2 = [
	    {  // FIXME: prune settings
		xtype: 'proxmoxintegerfield',
		fieldLabel: gettext('Max Backups'),
		name: 'maxfiles',
		reference: 'maxfiles',
		minValue: 0,
		maxValue: 365,
		value: me.isCreate ? '0' : undefined,
		allowBlank: false,
	    },
	    {
		xtype: 'displayfield',
		name: 'content',
		value: 'backup',
		submitValue: true,
		fieldLabel: gettext('Content'),
	    },
	];

	me.columnB = [
	    {
		xtype: 'textfield',
		name: 'fingerprint',
		value: me.isCreate ? '' : undefined,
		fieldLabel: gettext('Fingerprint'),
		emptyText: gettext(`Server certificate SHA-256 fingerprint, required for self-signed certificates`),
		regex: /[A-Fa-f0-9]{2}(:[A-Fa-f0-9]{2}){31}/,
		regexText: gettext('Example') + ': AB:CD:EF:...',
		allowBlank: true,
	    },
	];

	me.callParent();
    },
});
