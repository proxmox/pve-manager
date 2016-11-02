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
		type: 'pve',
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
    extend: 'PVE.panel.InputPanel',

    onGetValues: function(values) {
	var me = this;

	if (me.create) {
	    values.type = 'nfs';
	    // hack: for now we always create nvf v3
	    // fixme: make this configurable
	    values.options = 'vers=3';
	} else {
	    delete values.storage;
	}

	values.disable = values.enable ? 0 : 1;
	delete values.enable;

	return values;
    },

    initComponent : function() {
	var me = this;


	me.column1 = [
	    {
		xtype: me.create ? 'textfield' : 'displayfield',
		name: 'storage',
		value: me.storageId || '',
		fieldLabel: 'ID',
		vtype: 'StorageId',
		allowBlank: false
	    },
	    {
		xtype: me.create ? 'textfield' : 'displayfield',
		name: 'server',
		value: '',
		fieldLabel: gettext('Server'),
		allowBlank: false,
		listeners: {
		    change: function(f, value) {
			if (me.create) {
			    var exportField = me.down('field[name=export]');
			    exportField.setServer(value);
			    exportField.setValue('');
			}
		    }
		}
	    },
	    {
		xtype: me.create ? 'pveNFSScan' : 'displayfield',
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
		xtype: 'pveNodeSelector',
		name: 'nodes',
		fieldLabel: gettext('Nodes'),
		emptyText: gettext('All') + ' (' +
		    gettext('No restrictions') +')',
		multiSelect: true,
		autoSelect: false
	    },
	    {
		xtype: 'pvecheckbox',
		name: 'enable',
		checked: true,
		uncheckedValue: 0,
		fieldLabel: gettext('Enable')
	    },
	    {
		xtype: 'pveIntegerField',
		fieldLabel: gettext('Max Backups'),
		name: 'maxfiles',
		minValue: 0,
		maxValue: 365,
		value: me.create ? '1' : undefined,
		allowBlank: false
	    }
	];

	me.callParent();
    }
});

Ext.define('PVE.storage.NFSEdit', {
    extend: 'PVE.window.Edit',

    initComponent : function() {
	var me = this;

	me.create = !me.storageId;

	if (me.create) {
            me.url = '/api2/extjs/storage';
            me.method = 'POST';
        } else {
            me.url = '/api2/extjs/storage/' + me.storageId;
            me.method = 'PUT';
        }

	var ipanel = Ext.create('PVE.storage.NFSInputPanel', {
	    create: me.create,
	    storageId: me.storageId
	});

	Ext.apply(me, {
            subject: 'NFS',
	    isAdd: true,
	    items: [ ipanel ]
	});

	me.callParent();

	if (!me.create) {
	    me.load({
		success:  function(response, options) {
		    var values = response.result.data;
		    var ctypes = values.content || '';

		    values.content = ctypes.split(',');

		    if (values.nodes) {
			values.nodes = values.nodes.split(',');
		    }
		    values.enable = values.disable ? 0 : 1;
		    ipanel.setValues(values);
		}
	    });
	}
    }
});
