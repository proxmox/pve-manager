Ext.define('PVE.storage.IScsiScan', {
    extend: 'PVE.form.ComboBoxSetStoreNode',
    alias: 'widget.pveIScsiScan',

    queryParam: 'portal',
    valueField: 'target',
    displayField: 'target',
    matchFieldWidth: false,
    listConfig: {
	loadingText: gettext('Scanning...'),
	width: 350,
    },
    config: {
	apiSuffix: '/scan/iscsi',
    },
    doRawQuery: function() {
	// do nothing
    },

    onTriggerClick: function() {
	let me = this;

	if (!me.queryCaching || me.lastQuery !== me.portal) {
	    me.store.removeAll();
	}

	me.allQuery = me.portal;

	me.callParent();
    },

    setPortal: function(portal) {
	let me = this;
	me.portal = portal;
    },

    initComponent: function() {
	let me = this;

	if (!me.nodename) {
	    me.nodename = 'localhost';
	}

	let store = Ext.create('Ext.data.Store', {
	    fields: ['target', 'portal'],
	    proxy: {
		type: 'proxmox',
		url: `${me.apiBaseUrl}${me.nodename}${me.apiSuffix}`,
	    },
	});
	store.sort('target', 'ASC');

	Ext.apply(me, {
	    store: store,
	});

	me.callParent();
    },
});

Ext.define('PVE.storage.IScsiInputPanel', {
    extend: 'PVE.panel.StorageBase',

    onlineHelp: 'storage_open_iscsi',

    onGetValues: function(values) {
	let me = this;

	values.content = values.luns ? 'images' : 'none';
	delete values.luns;

	return me.callParent([values]);
    },

    setValues: function(values) {
	values.luns = values.content.indexOf('images') !== -1;
	this.callParent([values]);
    },

    initComponent: function() {
	let me = this;

	me.column1 = [
	    {
		xtype: 'pveStorageScanNodeSelector',
		disabled: !me.isCreate,
		hidden: !me.isCreate,
		listeners: {
		    change: {
			fn: function(field, value) {
			    me.lookup('iScsiTargetScan').setNodeName(value);
			    me.lookup('storageNodeRestriction').setValue(value);
			},
		    },
		},
	    },
	    {
		xtype: me.isCreate ? 'textfield' : 'displayfield',
		name: 'portal',
		value: '',
		fieldLabel: 'Portal',
		allowBlank: false,
		listeners: {
		    change: function(f, value) {
			if (me.isCreate) {
			    let exportField = me.down('field[name=target]');
			    exportField.setPortal(value);
			    exportField.setValue('');
			}
		    },
		},
	    },
	    Ext.createWidget(me.isCreate ? 'pveIScsiScan' : 'displayfield', {
		readOnly: !me.isCreate,
		name: 'target',
		value: '',
		fieldLabel: gettext('Target'),
		allowBlank: false,
		reference: 'iScsiTargetScan',
	    }),
	];

	me.column2 = [
	    {
		xtype: 'checkbox',
		name: 'luns',
		checked: true,
		fieldLabel: gettext('Use LUNs directly'),
	    },
	];

	me.callParent();
    },
});
