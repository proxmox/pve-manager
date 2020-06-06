Ext.define('PVE.storage.CephFSInputPanel', {
    extend: 'PVE.panel.StorageBase',
    controller: 'cephstorage',

    onlineHelp: 'storage_cephfs',

    viewModel: {
	type: 'cephstorage'
    },

    setValues: function(values) {
	if (values.monhost) {
	    this.viewModel.set('pveceph', false);
	    this.lookupReference('pvecephRef').setValue(false);
	    this.lookupReference('pvecephRef').resetOriginalValue();
	}
	this.callParent([values]);
    },

    initComponent : function() {
	var me = this;

	if (!me.nodename) {
	    me.nodename = 'localhost';
	}
	me.type = 'cephfs';

	me.column1 = [];

	me.column1.push(
	    {
		xtype: 'textfield',
		name: 'monhost',
		vtype: 'HostList',
		value: '',
		bind: {
		    disabled: '{pveceph}',
		    submitValue: '{!pveceph}',
		    hidden: '{pveceph}'
		},
		fieldLabel: 'Monitor(s)',
		allowBlank: false
	    },
	    {
		xtype: 'displayfield',
		reference: 'monhost',
		bind: {
		    disabled: '{!pveceph}',
		    hidden: '{!pveceph}'
		},
		value: '',
		fieldLabel: 'Monitor(s)'
	    },
	    {
		xtype: me.isCreate ? 'textfield' : 'displayfield',
		name: 'username',
		value: 'admin',
		bind:  {
		    disabled: '{pveceph}',
		    submitValue: '{!pveceph}'
		},
		fieldLabel: gettext('User name'),
		allowBlank: true
	    }
	);

	me.column2 = [
	    {
		xtype: 'pveContentTypeSelector',
		cts: ['backup', 'iso', 'vztmpl', 'snippets'],
		fieldLabel: gettext('Content'),
		name: 'content',
		value: 'backup',
		multiSelect: true,
		allowBlank: false
	    },
	    {
		xtype: 'proxmoxintegerfield',
		fieldLabel: gettext('Max Backups'),
		name: 'maxfiles',
		reference: 'maxfiles',
		minValue: 0,
		maxValue: 365,
		value: me.isCreate ? '1' : undefined,
		allowBlank: false
	    }
	];

	me.columnB = [{
	    xtype: 'proxmoxcheckbox',
	    name: 'pveceph',
	    reference: 'pvecephRef',
	    bind : {
		disabled: '{!pvecephPossible}',
		value: '{pveceph}'
	    },
	    checked: true,
	    uncheckedValue: 0,
	    submitValue: false,
	    hidden: !me.isCreate,
	    boxLabel: gettext('Use Proxmox VE managed hyper-converged cephFS')
	}];

	me.callParent();
    }
});
