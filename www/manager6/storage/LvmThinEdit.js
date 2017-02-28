Ext.define('PVE.storage.TPoolSelector', {
    extend: 'Ext.form.field.ComboBox',
    alias: 'widget.pveTPSelector',

    queryParam: 'vg',
    valueField: 'lv',
    displayField: 'lv',
    editable: false,

    doRawQuery: function() {
    },

    onTriggerClick: function() {
	var me = this;

	if (!me.queryCaching || me.lastQuery !== me.vg) {
	    me.store.removeAll();
	}

	me.allQuery = me.vg;

	me.callParent();
    },

    setVG: function(myvg) {
	var me = this;

	me.vg = myvg;
    },

    initComponent : function() {
	var me = this;

	if (!me.nodename) {
	    me.nodename = 'localhost';
	}

	var store = Ext.create('Ext.data.Store', {
	    fields: [ 'lv' ],
	    proxy: {
		type: 'pve',
		url: '/api2/json/nodes/' + me.nodename + '/scan/lvmthin'
	    }
	});

	store.sort('lv', 'ASC');

	Ext.apply(me, {
	    store: store,
	    listConfig: {
		loadingText: gettext('Scanning...')
	    }
	});

	me.callParent();
    }
});

Ext.define('PVE.storage.BaseVGSelector', {
    extend: 'Ext.form.field.ComboBox',
    alias: 'widget.pveBaseVGSelector',

    valueField: 'vg',
    displayField: 'vg',
    queryMode: 'local',
    editable: false,
    initComponent : function() {
	var me = this;

	if (!me.nodename) {
	    me.nodename = 'localhost';
	}

	var store = Ext.create('Ext.data.Store', {
	    autoLoad: {},
	    fields: [ 'vg', 'size', 'free'],
	    proxy: {
		type: 'pve',
		url: '/api2/json/nodes/' + me.nodename + '/scan/lvm'
	    }
	});

	Ext.apply(me, {
	    store: store,
	    listConfig: {
		loadingText: gettext('Scanning...')
	    }
	});

	me.callParent();
    }
});

Ext.define('PVE.storage.LvmThinInputPanel', {
    extend: 'PVE.panel.InputPanel',

    onGetValues: function(values) {
	var me = this;

	if (me.isCreate) {
	    values.type = 'lvmthin';
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
		submitValue: !!me.isCreate,
		allowBlank: false
	    }
	];

	var vgnameField = Ext.createWidget(me.isCreate ? 'textfield' : 'displayfield', {
	    name: 'vgname',
	    hidden: !!me.isCreate,
	    disabled: !!me.isCreate,
	    value: '',
	    fieldLabel: gettext('Volume group'),
	    allowBlank: false
	});

	var thinpoolField = Ext.createWidget(me.isCreate ? 'textfield' : 'displayfield', {
	    name: 'thinpool',
	    hidden: !!me.isCreate,
	    disabled: !!me.isCreate,
	    value: '',
	    fieldLabel: gettext('Thin Pool'),
	    allowBlank: false
	});

	if (me.isCreate) {
	    var vgField = Ext.create('PVE.storage.TPoolSelector', {
		name: 'thinpool',
		fieldLabel: gettext('Thin Pool'),
		allowBlank: false
	    });

	    me.column1.push({
		xtype: 'pveBaseVGSelector',
		name: 'vgname',
		fieldLabel: gettext('Volume group'),
		listeners: {
		    change: function(f, value) {
			if (me.isCreate) {
			    vgField.setVG(value);
			    vgField.setValue('');
			}
		    }
		}
	    });

	    me.column1.push(vgField);
	}

	me.column1.push(vgnameField);

	me.column1.push(thinpoolField);

	// here value is an array,
	// while before it was a string
	/*jslint confusion: true*/
	me.column1.push({
	    xtype: 'pveContentTypeSelector',
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
	    }
	];

	me.callParent();
    }
});

Ext.define('PVE.storage.LvmThinEdit', {
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

	var ipanel = Ext.create('PVE.storage.LvmThinInputPanel', {
	    isCreate: me.isCreate,
	    storageId: me.storageId
	});

	Ext.apply(me, {
            subject: PVE.Utils.format_storage_type('lvmthin'),
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
