Ext.define('PVE.storage.ZFSPoolSelector', {
    extend: 'Ext.form.field.ComboBox',
    alias: 'widget.pveZFSPoolSelector',
    valueField: 'pool',
    displayField: 'pool',
    queryMode: 'local',
    editable: false,
    listConfig: {
	loadingText: gettext('Scanning...'),
    },
    initComponent : function() {
	var me = this;

	if (!me.nodename) {
	    me.nodename = 'localhost';
	}

	var store = Ext.create('Ext.data.Store', {
	    autoLoad: {}, // true,
	    fields: [ 'pool', 'size', 'free' ],
	    proxy: {
		type: 'proxmox',
		url: '/api2/json/nodes/' + me.nodename + '/scan/zfs',
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

    initComponent : function() {
	var me = this;

	me.column1 = [];

	if (me.isCreate) {
	    me.column1.push(Ext.create('PVE.storage.ZFSPoolSelector', {
		name: 'pool',
		fieldLabel: gettext('ZFS Pool'),
		allowBlank: false,
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
	me.column1.push(
	    {xtype: 'pveContentTypeSelector',
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
