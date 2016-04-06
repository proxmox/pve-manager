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

	Ext.apply(me, {
	    store: store,
	});

	me.callParent();
    }
});

Ext.define('PVE.storage.GlusterFsInputPanel', {
    extend: 'PVE.panel.InputPanel',

    onGetValues: function(values) {
	var me = this;

	if (me.create) {
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
			    var volumeField = me.down('field[name=volume]');
			    volumeField.setServer(value);
			    volumeField.setValue('');
			}
		    }
		}
	    },
	    {
		xtype: me.create ? 'pvetextfield' : 'displayfield',
		name: 'server2',
		value: '',
		fieldLabel: gettext('Second Server'),
		allowBlank: true,
	    },
	    {
		xtype: me.create ? 'pveGlusterFsScan' : 'displayfield',
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
		xtype: 'numberfield',
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

Ext.define('PVE.storage.GlusterFsEdit', {
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

	var ipanel = Ext.create('PVE.storage.GlusterFsInputPanel', {
	    create: me.create,
	    storageId: me.storageId
	});

	Ext.apply(me, {
            subject: PVE.Utils.format_storage_type('glusterfs'),
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
