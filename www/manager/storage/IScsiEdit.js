Ext.define('PVE.storage.IScsiScan', {
    extend: 'Ext.form.field.ComboBox',
    alias: 'widget.pveIScsiScan',

    queryParam: 'portal',

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

	Ext.apply(me, {
	    store: store,
	    valueField: 'target',
	    displayField: 'target',
	    matchFieldWidth: false,
	    listConfig: {
		loadingText: gettext('Scanning...'),
		listeners: {
		    // hack: call setHeight to show scroll bars correctly
		    refresh: function(list) {
			var lh = PVE.Utils.gridLineHeigh();
			var count = store.getCount();
			list.setHeight(lh * ((count > 10) ? 10 : count));
		    }
		},
		width: 350
	    }
	});

	me.callParent();
    }
});

Ext.define('PVE.storage.IScsiInputPanel', {
    extend: 'PVE.panel.InputPanel',

    onGetValues: function(values) {
	var me = this;

	if (me.create) {
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
		xtype: me.create ? 'textfield' : 'displayfield',
		name: 'storage',
		height: 22, // hack: set same height as text fields
		value: me.storageId || '',
		fieldLabel: 'ID',
		vtype: 'StorageId',
		allowBlank: false
	    },
	    {
		xtype: me.create ? 'textfield' : 'displayfield',
		height: 22, // hack: set same height as text fields
		name: 'portal',
		value: '',
		fieldLabel: gettext('Portal'),
		allowBlank: false,
		listeners: {
		    change: function(f, value) {
			if (me.create) {
			    var exportField = me.down('field[name=target]');
			    exportField.setPortal(value);
			    exportField.setValue('');
			}
		    }
		}
	    },
	    {
		readOnly: !me.create,
		xtype: me.create ? 'pveIScsiScan' : 'displayfield',
		name: 'target',
		value: '',
		fieldLabel: gettext('Target'),
		allowBlank: false
	    }
	];

	me.column2 = [
	    {
		xtype: 'PVE.form.NodeSelector',
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
 
	me.create = !me.storageId;

	if (me.create) {
            me.url = '/api2/extjs/storage';
            me.method = 'POST';
        } else {
            me.url = '/api2/extjs/storage/' + me.storageId;
            me.method = 'PUT';
        }

	var ipanel = Ext.create('PVE.storage.IScsiInputPanel', {
	    create: me.create,
	    storageId: me.storageId
	});
	
	Ext.apply(me, {
            subject: gettext('iSCSI target'),
	    isAdd: true,
	    items: [ ipanel ]
	});

	me.callParent();

	if (!me.create) {
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
