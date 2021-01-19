Ext.define('PVE.storage.VgSelector', {
    extend: 'Ext.form.field.ComboBox',
    alias: 'widget.pveVgSelector',
    valueField: 'vg',
    displayField: 'vg',
    queryMode: 'local',
    editable: false,
    initComponent: function() {
	var me = this;

	if (!me.nodename) {
	    me.nodename = 'localhost';
	}

	var store = Ext.create('Ext.data.Store', {
	    autoLoad: {}, // true,
	    fields: ['vg', 'size', 'free'],
	    proxy: {
		type: 'proxmox',
		url: '/api2/json/nodes/' + me.nodename + '/scan/lvm',
	    },
	});

	store.sort('vg', 'ASC');

	Ext.apply(me, {
	    store: store,
	    listConfig: {
		loadingText: gettext('Scanning...'),
	    },
	});

	me.callParent();
    },
});

Ext.define('PVE.storage.BaseStorageSelector', {
    extend: 'Ext.form.field.ComboBox',
    alias: 'widget.pveBaseStorageSelector',

    existingGroupsText: gettext("Existing volume groups"),
    queryMode: 'local',
    editable: false,
    value: '',
    valueField: 'storage',
    displayField: 'text',
    initComponent: function() {
	var me = this;

	var store = Ext.create('Ext.data.Store', {
	    autoLoad: {
		addRecords: true,
		params: {
		    type: 'iscsi',
		},
	    },
	    fields: ['storage', 'type', 'content',
		      {
			  name: 'text',
			  convert: function(value, record) {
			      if (record.data.storage) {
				  return record.data.storage + " (iSCSI)";
			      } else {
				  return me.existingGroupsText;
			      }
			  },
		      }],
	    proxy: {
		type: 'proxmox',
		url: '/api2/json/storage/',
	    },
	});

	store.loadData([{ storage: '' }], true);

	store.sort('storage', 'ASC');

	Ext.apply(me, {
	    store: store,
	});

	me.callParent();
    },
});

Ext.define('PVE.storage.LVMInputPanel', {
    extend: 'PVE.panel.StorageBase',

    onlineHelp: 'storage_lvm',

    initComponent: function() {
	var me = this;

	me.column1 = [];

	var vgnameField = Ext.createWidget(me.isCreate ? 'textfield' : 'displayfield', {
	    name: 'vgname',
	    hidden: !!me.isCreate,
	    disabled: !!me.isCreate,
	    value: '',
	    fieldLabel: gettext('Volume group'),
	    allowBlank: false,
	});

	if (me.isCreate) {
	    var vgField = Ext.create('PVE.storage.VgSelector', {
		name: 'vgname',
		fieldLabel: gettext('Volume group'),
		allowBlank: false,
	    });

	    var baseField = Ext.createWidget('pveFileSelector', {
		name: 'base',
		hidden: true,
		disabled: true,
		nodename: 'localhost',
		storageContent: 'images',
		fieldLabel: gettext('Base volume'),
		allowBlank: false,
	    });

	    me.column1.push({
		xtype: 'pveBaseStorageSelector',
		name: 'basesel',
		fieldLabel: gettext('Base storage'),
		submitValue: false,
		listeners: {
		    change: function(f, value) {
			if (value) {
			    vgnameField.setVisible(true);
			    vgnameField.setDisabled(false);
			    vgField.setVisible(false);
			    vgField.setDisabled(true);
			    baseField.setVisible(true);
			    baseField.setDisabled(false);
			} else {
			    vgnameField.setVisible(false);
			    vgnameField.setDisabled(true);
			    vgField.setVisible(true);
			    vgField.setDisabled(false);
			    baseField.setVisible(false);
			    baseField.setDisabled(true);
			}
			baseField.setStorage(value);
		    },
		},
	    });

	    me.column1.push(baseField);

	    me.column1.push(vgField);
	}

	me.column1.push(vgnameField);

	// here value is an array,
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
		name: 'shared',
		uncheckedValue: 0,
		fieldLabel: gettext('Shared'),
	    },
	];

	me.callParent();
    },
});
