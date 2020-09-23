Ext.define('Proxmox.form.PBSEncryptionCheckbox', {
    extend: 'Ext.form.field.Checkbox',
    xtype: 'pbsEncryptionCheckbox',

    inputValue: true,

    viewModel: {
	data: {
	    value: null,
	    originalValue: null,
	},
	formulas: {
	    blabel: (get) => {
		let v = get('value');
		let original = get('originalValue');
		if (!get('isCreate') && original) {
		    if (!v) {
			return gettext('Warning: Existing encryption key will be deleted!');
		    }
		    return gettext('Active');
		} else {
		    return gettext('Auto-generate a client encryption key, saved privately on cluster filesystem');
		}
	    },
	},
    },

    bind: {
	value: '{value}',
	boxLabel: '{blabel}',
    },
    resetOriginalValue: function() {
	let me = this;
	let vm = me.getViewModel();
	vm.set('originalValue', me.value);

	me.callParent(arguments);
    },

    getSubmitData: function() {
	let me = this;
	let val = me.getSubmitValue();
	if (!me.isCreate) {
	    if (val === null) {
	       return { 'delete': 'encryption-key' };
	    } else if (val && !!val !== !!me.originalValue) {
	       return { 'encryption-key': 'autogen' };
	    }
	} else if (val) {
	   return { 'encryption-key': 'autogen' };
	}
	return null;
    },

    initComponent: function() {
	let me = this;
	me.callParent();

	let vm = me.getViewModel();
	vm.set('isCreate', me.isCreate);
    },
});
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
		allowBlank: false,
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
	    { // FIXME: prune settings
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
		xtype: 'proxmoxtextfield',
		name: 'fingerprint',
		value: me.isCreate ? null : undefined,
		fieldLabel: gettext('Fingerprint'),
		emptyText: gettext('Server certificate SHA-256 fingerprint, required for self-signed certificates'),
		regex: /[A-Fa-f0-9]{2}(:[A-Fa-f0-9]{2}){31}/,
		regexText: gettext('Example') + ': AB:CD:EF:...',
		allowBlank: true,
	    },
	    {
		// FIXME: allow uploading their own, maybe export for root@pam?
		xtype: 'pbsEncryptionCheckbox',
		name: 'encryption-key',
		isCreate: me.isCreate,
		fieldLabel: gettext('Encryption Key'),
	    },
	    {
		xtype: 'displayfield',
		userCls: 'pmx-hint',
		value: `Proxmox Backup Server is currently in beta.`,
	    },
	];

	me.callParent();
    },
});
