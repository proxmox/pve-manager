Ext.define('PVE.storage.IScsiScan', {
    extend: 'Ext.form.field.ComboBox',
    alias: 'widget.pveIScsiScan',

    queryParam: 'portal',
    valueField: 'target',
    displayField: 'target',
    matchFieldWidth: false,
    listConfig: {
	loadingText: gettext('Scanning...'),
	width: 350
    },
    doRawQuery: function() {
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

    initComponent : function() {
	var me = this;

	if (!me.nodename) {
	    me.nodename = 'localhost';
	}

	var store = Ext.create('Ext.data.Store', {
	    fields: [ 'target', 'portal' ],
	    proxy: {
		type: 'pve',
		url: '/api2/json/nodes/' + me.nodename + '/scan/iscsi'
	    }
	});

	store.sort('target', 'ASC');

	Ext.apply(me, {
	    store: store
	});

	me.callParent();
    }
});

Ext.define('PVE.storage.IScsiInputPanel', {
    extend: 'PVE.panel.InputPanel',

    onGetValues: function(values) {
	var me = this;

	if (me.isCreate) {
	    values.type = 'iscsi';
	} else {
	    delete values.storage;
	}

	values.content = values.luns ? 'images' : 'none';
	delete values.luns;

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
		    }
		}
	    },
	    {
		readOnly: !me.isCreate,
		xtype: me.isCreate ? 'pveIScsiScan' : 'displayfield',
		name: 'target',
		value: '',
		fieldLabel: 'Target',
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
		xtype: 'checkbox',
		name: 'luns',
		checked: true,
		fieldLabel: gettext('Use LUNs directly')
	    }
	];

	me.callParent();
    }
});

Ext.define('PVE.storage.IScsiEdit', {
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

	var ipanel = Ext.create('PVE.storage.IScsiInputPanel', {
	    isCreate: me.isCreate,
	    storageId: me.storageId
	});

	Ext.apply(me, {
            subject: PVE.Utils.format_storage_type('iscsi'),
	    isAdd: true,
	    items: [ ipanel ]
	});

	me.callParent();

	if (!me.isCreate) {
	    me.load({
		success:  function(response, options) {
		    var values = response.result.data;
		    var ctypes = values.content || '';

		    if (values.storage === 'local') {
			values.content = ctypes.split(',');
		    }
		    if (values.nodes) {
			values.nodes = values.nodes.split(',');
		    }
		    values.enable = values.disable ? 0 : 1;
		    values.luns = (values.content === 'images') ? true : false;

		    ipanel.setValues(values);
		}
	    });
	}
    }
});
