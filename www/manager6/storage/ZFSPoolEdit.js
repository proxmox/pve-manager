Ext.define('PVE.storage.ZFSPoolSelector', {
    extend: 'Ext.form.field.ComboBox',
    alias: 'widget.pveZFSPoolSelector',
    valueField: 'pool',
    displayField: 'pool',
    queryMode: 'local',
    editable: false,
    listConfig: {
	loadingText: gettext('Scanning...')
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
		type: 'pve',
		url: '/api2/json/nodes/' + me.nodename + '/scan/zfs'
	    }
	});

	store.sort('pool', 'ASC');

	Ext.apply(me, {
	    store: store
	});

	me.callParent();
    }
});

Ext.define('PVE.storage.ZFSPoolInputPanel', {
    extend: 'PVE.panel.InputPanel',

    onGetValues: function(values) {
	var me = this;

	if (me.isCreate) {
	    values.type = 'zfspool';
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
	    }
	];

	if (me.isCreate) {
	    me.column1.push(Ext.create('PVE.storage.ZFSPoolSelector', {
		name: 'pool',
		fieldLabel: gettext('ZFS Pool'),
		allowBlank: false
	    }));
	} else {
	    me.column1.push(Ext.createWidget('displayfield', {
		name: 'pool',
		value: '',
		fieldLabel: gettext('ZFS Pool'),
		allowBlank: false
	    }));
	}

	// value is an array,
	// while before it was a string
	/*jslint confusion: true*/
	me.column1.push(
	    {xtype: 'pveContentTypeSelector',
	     cts: ['images', 'rootdir'],
	     fieldLabel: gettext('Content'),
	     name: 'content',
	     value: ['images', 'rootdir'],
	     multiSelect: true,
	     allowBlank: false
	});
	/*jslint confusion: false*/
	me.column2 = [
	    {
		xtype: 'pvecheckbox',
		name: 'enable',
		checked: true,
		uncheckedValue: 0,
		fieldLabel: gettext('Enable')
	    },
	    {
		xtype: 'pvecheckbox',
		name: 'sparse',
		checked: false,
		uncheckedValue: 0,
		fieldLabel: gettext('Thin provision')
	    },
	    {
		xtype: 'textfield',
		name: 'blocksize',
		emptyText: '8k',
		fieldLabel: gettext('Block Size'),
		allowBlank: true
	    }
	];

	if (me.isCreate || me.storageId !== 'local') {
	    me.column2.unshift({
		xtype: 'pveNodeSelector',
		name: 'nodes',
		fieldLabel: gettext('Nodes'),
		emptyText: gettext('All') + ' (' +
		    gettext('No restrictions') +')',
		multiSelect: true,
		autoSelect: false
	    });
	}

	me.callParent();
    }
});

Ext.define('PVE.storage.ZFSPoolEdit', {
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

	var ipanel = Ext.create('PVE.storage.ZFSPoolInputPanel', {
	    isCreate: me.isCreate,
	    storageId: me.storageId
	});

	Ext.apply(me, {
            subject: PVE.Utils.format_storage_type('zfspool'),
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
