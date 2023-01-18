Ext.define('PVE.storage.ZFSPoolSelector', {
    extend: 'PVE.form.ComboBoxSetStoreNode',
    alias: 'widget.pveZFSPoolSelector',
    valueField: 'pool',
    displayField: 'pool',
    queryMode: 'local',
    editable: false,
    allowBlank: false,

    listConfig: {
	columns: [
	    {
		dataIndex: 'pool',
		flex: 1,
	    },
	],
	emptyText: gettext('No ZFS Pools found'),
    },

    config: {
	apiSuffix: '/scan/zfs',
    },

    showNodeSelector: true,

    setNodeName: function(value) {
	let me = this;
	me.callParent([value]);
	me.getStore().load();
    },

    initComponent: function() {
	let me = this;

	if (!me.nodename) {
	    me.nodename = 'localhost';
	}

	let store = Ext.create('Ext.data.Store', {
	    autoLoad: {}, // true,
	    fields: ['pool', 'size', 'free'],
	    proxy: {
		type: 'proxmox',
		url: `${me.apiBaseUrl}${me.nodename}${me.apiSuffix}`,
	    },
	});
	store.sort('pool', 'ASC');

	Ext.apply(me, {
	    store: store,
	});

	me.callParent();
    },
});

Ext.define('PVE.storage.ZFSPoolInputPanel', {
    extend: 'PVE.panel.StorageBase',

    onlineHelp: 'storage_zfspool',

    initComponent: function() {
	let me = this;

	me.column1 = [];

	if (me.isCreate) {
	    me.column1.push(Ext.create('PVE.storage.ZFSPoolSelector', {
		name: 'pool',
		fieldLabel: gettext('ZFS Pool'),
		reference: 'zfsPoolSelector',
		allowBlank: false,
		listeners: {
		    nodechanged: function(value) {
			me.lookup('storageNodeRestriction').setValue(value);
		    },
		},
	    }));
	} else {
	    me.column1.push(Ext.createWidget('displayfield', {
		name: 'pool',
		value: '',
		fieldLabel: gettext('ZFS Pool'),
		allowBlank: false,
	    }));
	}

	// value is an array,
	// while before it was a string
	me.column1.push({
	    xtype: 'pveContentTypeSelector',
	    cts: ['images', 'rootdir'],
	    fieldLabel: gettext('Content'),
	    name: 'content',
	    value: ['images', 'rootdir'],
	    multiSelect: true,
	    allowBlank: false,
	});
	me.column2 = [
	    {
		xtype: 'proxmoxcheckbox',
		name: 'sparse',
		checked: false,
		uncheckedValue: 0,
		fieldLabel: gettext('Thin provision'),
	    },
	    {
		xtype: 'textfield',
		name: 'blocksize',
		emptyText: '8k',
		fieldLabel: gettext('Block Size'),
		allowBlank: true,
	    },
	];

	me.callParent();
    },
});
