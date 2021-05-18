Ext.define('PVE.storage.IScsiScan', {
    extend: 'Ext.form.field.ComboBox',
    alias: 'widget.pveIScsiScan',

    queryParam: 'portal',
    valueField: 'target',
    displayField: 'target',
    matchFieldWidth: false,
    listConfig: {
	loadingText: gettext('Scanning...'),
	width: 350,
    },
    doRawQuery: function() {
	// do nothing
    },

    onTriggerClick: function() {
	var me = this;

	if (!me.queryCaching || me.lastQuery !== me.portal) {
	    me.store.removeAll();
	}

	me.allQuery = me.portal;

	me.callParent();
    },

    setPortal: function(portal) {
	var me = this;

	me.portal = portal;
    },

    initComponent: function() {
	var me = this;

	if (!me.nodename) {
	    me.nodename = 'localhost';
	}

	var store = Ext.create('Ext.data.Store', {
	    fields: ['target', 'portal'],
	    proxy: {
		type: 'proxmox',
		url: '/api2/json/nodes/' + me.nodename + '/scan/iscsi',
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
	var me = this;

	values.content = values.luns ? 'images' : 'none';
	delete values.luns;

	return me.callParent([values]);
    },

    setValues: function(values) {
	values.luns = values.content.indexOf('images') !== -1;
	this.callParent([values]);
    },

    initComponent: function() {
	var me = this;

	me.column1 = [
	    {
		xtype: me.isCreate ? 'textfield' : 'displayfield',
		name: 'portal',
		value: '',
		fieldLabel: 'Portal',
		allowBlank: false,
		listeners: {
		    change: function(f, value) {
			if (me.isCreate) {
			    var exportField = me.down('field[name=target]');
			    exportField.setPortal(value);
			    exportField.setValue('');
			}
		    },
		},
	    },
	    {
		readOnly: !me.isCreate,
		xtype: me.isCreate ? 'pveIScsiScan' : 'displayfield',
		name: 'target',
		value: '',
		fieldLabel: 'Target',
		allowBlank: false,
	    },
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
