Ext.define('PVE.storage.NFSScan', {
    extend: 'Ext.form.field.ComboBox',
    alias: 'widget.pveNFSScan',

    queryParam: 'server',

    valueField: 'path',
    displayField: 'path',
    matchFieldWidth: false,
    listConfig: {
	loadingText: gettext('Scanning...'),
	width: 350
    },
    doRawQuery: function() {
    },

    onTriggerClick: function() {
	var me = this;

	if (!me.queryCaching || me.lastQuery !== me.nfsServer) {
	    me.store.removeAll();
	}

	me.allQuery = me.nfsServer;

	me.callParent();
    },

    setServer: function(server) {
	var me = this;

	me.nfsServer = server;
    },

    initComponent : function() {
	var me = this;

	if (!me.nodename) {
	    me.nodename = 'localhost';
	}

	var store = Ext.create('Ext.data.Store', {
	    fields: [ 'path', 'options' ],
	    proxy: {
		type: 'proxmox',
		url: '/api2/json/nodes/' + me.nodename + '/scan/nfs'
	    }
	});

	store.sort('path', 'ASC');

	Ext.apply(me, {
	    store: store
	});

	me.callParent();
    }
});

Ext.define('PVE.storage.NFSInputPanel', {
    extend: 'PVE.panel.StorageBase',

    onlineHelp: 'storage_nfs',

    onGetValues: function(values) {
	var me = this;

	if (me.isCreate) {
	    // hack: for now we always create nvf v3
	    // fixme: make this configurable
	    values.options = 'vers=3';
	}

	return me.callParent([values]);
    },

    initComponent : function() {
	var me = this;


	me.column1 = [
	    {
		xtype: me.isCreate ? 'textfield' : 'displayfield',
		name: 'server',
		value: '',
		fieldLabel: gettext('Server'),
		allowBlank: false,
		listeners: {
		    change: function(f, value) {
			if (me.isCreate) {
			    var exportField = me.down('field[name=export]');
			    exportField.setServer(value);
			    exportField.setValue('');
			}
		    }
		}
	    },
	    {
		xtype: me.isCreate ? 'pveNFSScan' : 'displayfield',
		name: 'export',
		value: '',
		fieldLabel: 'Export',
		allowBlank: false
	    },
	    {
		xtype: 'pveContentTypeSelector',
		name: 'content',
		value: 'images',
		multiSelect: true,
		fieldLabel: gettext('Content'),
		allowBlank: false
	    }
	];

	me.column2 = [
	    {
		xtype: 'proxmoxintegerfield',
		fieldLabel: gettext('Max Backups'),
		disabled: true,
		name: 'maxfiles',
		reference: 'maxfiles',
		minValue: 0,
		maxValue: 365,
		value: me.isCreate ? '1' : undefined,
		allowBlank: false
	    }
	];

	me.callParent();
    }
});
