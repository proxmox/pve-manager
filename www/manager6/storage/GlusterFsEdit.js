Ext.define('PVE.storage.GlusterFsScan', {
    extend: 'Ext.form.field.ComboBox',
    alias: 'widget.pveGlusterFsScan',

    queryParam: 'server',

    valueField: 'volname',
    displayField: 'volname',
    matchFieldWidth: false,
    listConfig: {
	loadingText: 'Scanning...',
	width: 350
    },
    doRawQuery: function() {
    },

    onTriggerClick: function() {
	var me = this;

	if (!me.queryCaching || me.lastQuery !== me.glusterServer) {
	    me.store.removeAll();
	}

	me.allQuery = me.glusterServer;

	me.callParent();
    },

    setServer: function(server) {
	var me = this;

	me.glusterServer = server;
    },

    initComponent : function() {
	var me = this;

	if (!me.nodename) {
	    me.nodename = 'localhost';
	}

	var store = Ext.create('Ext.data.Store', {
	    fields: [ 'volname' ],
	    proxy: {
		type: 'pve',
		url: '/api2/json/nodes/' + me.nodename + '/scan/glusterfs'
	    }
	});

	store.sort('volname', 'ASC');

	Ext.apply(me, {
	    store: store
	});

	me.callParent();
    }
});

Ext.define('PVE.storage.GlusterFsInputPanel', {
    extend: 'PVE.panel.InputPanel',
    controller: 'storageEdit',

    onGetValues: function(values) {
	var me = this;

	if (me.isCreate) {
	    values.type = 'glusterfs';
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
		xtype: me.isCreate ? 'textfield' : 'displayfield',
		name: 'storage',
		value: me.storageId || '',
		fieldLabel: 'ID',
		vtype: 'StorageId',
		allowBlank: false
	    },
	    {
		xtype: me.isCreate ? 'textfield' : 'displayfield',
		name: 'server',
		value: '',
		fieldLabel: gettext('Server'),
		allowBlank: false,
		listeners: {
		    change: function(f, value) {
			if (me.isCreate) {
			    var volumeField = me.down('field[name=volume]');
			    volumeField.setServer(value);
			    volumeField.setValue('');
			}
		    }
		}
	    },
	    {
		xtype: me.isCreate ? 'pvetextfield' : 'displayfield',
		name: 'server2',
		value: '',
		fieldLabel: gettext('Second Server'),
		allowBlank: true
	    },
	    {
		xtype: me.isCreate ? 'pveGlusterFsScan' : 'displayfield',
		name: 'volume',
		value: '',
		fieldLabel: 'Volume name',
		allowBlank: false
	    },
	    {
		xtype: 'pveContentTypeSelector',
		cts: ['images', 'iso', 'backup', 'vztmpl'],
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

Ext.define('PVE.storage.GlusterFsEdit', {
    extend: 'PVE.window.Edit',

    initComponent : function() {
	var me = this;

	me.isCreate = !me.storageId;

	if (me.isCreate) {
            me.url = '/api2/extjs/storage';
            me.method = 'POST';
        } else {
            me.url = '/api2/extjs/storage/' + me.storageId;
            me.method = 'PUT';
        }

	var ipanel = Ext.create('PVE.storage.GlusterFsInputPanel', {
	    isCreate: me.isCreate,
	    storageId: me.storageId
	});

	Ext.apply(me, {
            subject: PVE.Utils.format_storage_type('glusterfs'),
	    isAdd: true,
	    items: [ ipanel ]
	});

	me.callParent();

	if (!me.isCreate) {
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
