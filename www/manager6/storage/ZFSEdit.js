Ext.define('PVE.storage.ZFSInputPanel', {
    extend: 'PVE.panel.StorageBase',

    onGetValues: function(values) {
	var me = this;

	if (me.isCreate) {
	    values.content = 'images';
	}

	values.nowritecache = values.writecache ? 0 : 1;
	delete values.writecache;

	return me.callParent([values]);
    },

    setValues: function diff(values) {
	values.writecache = values.nowritecache ? 0 : 1;
	this.callParent([values]);
    },

    initComponent : function() {
	var me = this;

	me.column1 = [
	    {
		xtype: me.isCreate ? 'textfield' : 'displayfield',
		name: 'portal',
		value: '',
		fieldLabel: gettext('Portal'),
		allowBlank: false
	    },
	    {
		xtype: me.isCreate ? 'textfield' : 'displayfield',
		name: 'pool',
		value: '',
		fieldLabel: gettext('Pool'),
		allowBlank: false
	    },
	    {
		xtype: me.isCreate ? 'textfield' : 'displayfield',
		name: 'blocksize',
		value: '4k',
		fieldLabel: gettext('Block Size'),
		allowBlank: false
	    },
	    {
		xtype: me.isCreate ? 'textfield' : 'displayfield',
		name: 'target',
		value: '',
		fieldLabel: gettext('Target'),
		allowBlank: false
	    },
	    {
		xtype: me.isCreate ? 'textfield' : 'displayfield',
		name: 'comstar_tg',
		value: '',
		fieldLabel: gettext('Target group'),
		allowBlank: true
	    }
	];

	me.column2 = [
	    {
		xtype: me.isCreate ? 'pveiScsiProviderSelector' : 'displayfield',
		name: 'iscsiprovider',
		value: 'comstar',
		fieldLabel: gettext('iSCSI Provider'),
		allowBlank: false
	    },
	    {
		xtype: 'proxmoxcheckbox',
		name: 'sparse',
		checked: false,
		uncheckedValue: 0,
		fieldLabel: gettext('Thin provision')
	    },
	    {
		xtype: 'proxmoxcheckbox',
		name: 'writecache',
		checked: true,
		uncheckedValue: 0,
		fieldLabel: gettext('Write cache')
	    },
	    {
		xtype: me.isCreate ? 'textfield' : 'displayfield',
		name: 'comstar_hg',
		value: '',
		fieldLabel: gettext('Host group'),
		allowBlank: true
	    },
	    {
		xtype: me.isCreate ? 'textfield' : 'displayfield',
		name: 'lio_tpg',
		value: '',
		fieldLabel: gettext('LIO target portal group'),
		allowBlank: true
	    }
	];

	me.callParent();
    }
});
