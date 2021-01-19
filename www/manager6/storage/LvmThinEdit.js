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

    initComponent: function() {
	var me = this;

	if (!me.nodename) {
	    me.nodename = 'localhost';
	}

	var store = Ext.create('Ext.data.Store', {
	    fields: ['lv'],
	    proxy: {
		type: 'proxmox',
		url: '/api2/json/nodes/' + me.nodename + '/scan/lvmthin',
	    },
	});

	store.sort('lv', 'ASC');

	Ext.apply(me, {
	    store: store,
	    listConfig: {
		loadingText: gettext('Scanning...'),
	    },
	});

	me.callParent();
    },
});

Ext.define('PVE.storage.BaseVGSelector', {
    extend: 'Ext.form.field.ComboBox',
    alias: 'widget.pveBaseVGSelector',

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
	    autoLoad: {},
	    fields: ['vg', 'size', 'free'],
	    proxy: {
		type: 'proxmox',
		url: '/api2/json/nodes/' + me.nodename + '/scan/lvm',
	    },
	});

	Ext.apply(me, {
	    store: store,
	    listConfig: {
		loadingText: gettext('Scanning...'),
	    },
	});

	me.callParent();
    },
});

Ext.define('PVE.storage.LvmThinInputPanel', {
    extend: 'PVE.panel.StorageBase',

    onlineHelp: 'storage_lvmthin',

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

	var thinpoolField = Ext.createWidget(me.isCreate ? 'textfield' : 'displayfield', {
	    name: 'thinpool',
	    hidden: !!me.isCreate,
	    disabled: !!me.isCreate,
	    value: '',
	    fieldLabel: gettext('Thin Pool'),
	    allowBlank: false,
	});

	if (me.isCreate) {
	    var vgField = Ext.create('PVE.storage.TPoolSelector', {
		name: 'thinpool',
		fieldLabel: gettext('Thin Pool'),
		allowBlank: false,
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
		    },
		},
	    });

	    me.column1.push(vgField);
	}

	me.column1.push(vgnameField);

	me.column1.push(thinpoolField);

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

	me.column2 = [];

	me.callParent();
    },
});
