Ext.define('PVE.storage.TPoolSelector', {
    extend: 'PVE.form.ComboBoxSetStoreNode',
    alias: 'widget.pveTPSelector',

    queryParam: 'vg',
    valueField: 'lv',
    displayField: 'lv',
    editable: false,
    allowBlank: false,

    listConfig: {
	emptyText: gettext("No thinpool found"),
	columns: [
	    {
		dataIndex: 'lv',
		flex: 1,
	    },
	],
    },

    config: {
	apiSuffix: '/scan/lvmthin',
    },

    reload: function() {
	let me = this;
	if (!me.isDisabled()) {
	    me.getStore().load();
	}
    },

    setVG: function(myvg) {
	let me = this;
	me.vg = myvg;
	me.getStore().getProxy().setExtraParams({ vg: myvg });
	me.reload();
    },

    setNodeName: function(value) {
	let me = this;
	me.callParent([value]);
	me.reload();
    },

    initComponent: function() {
	let me = this;

	if (!me.nodename) {
	    me.nodename = 'localhost';
	}

	let store = Ext.create('Ext.data.Store', {
	    fields: ['lv'],
	    proxy: {
		type: 'proxmox',
		url: `${me.apiBaseUrl}${me.nodename}${me.apiSuffix}`,
	    },
	});

	store.sort('lv', 'ASC');

	Ext.apply(me, {
	    store: store,
	});

	me.callParent();
    },
});

Ext.define('PVE.storage.BaseVGSelector', {
    extend: 'PVE.form.ComboBoxSetStoreNode',
    alias: 'widget.pveBaseVGSelector',

    valueField: 'vg',
    displayField: 'vg',
    queryMode: 'local',
    editable: false,
    allowBlank: false,

    listConfig: {
	columns: [
	    {
		dataIndex: 'vg',
		flex: 1,
	    },
	],
    },

    showNodeSelector: true,

    config: {
	apiSuffix: '/scan/lvm',
    },

    setNodeName: function(value) {
	let me = this;
	me.callParent([value]);
	me.getStore().load();
    },

    initComponent: function() {
	let me = this;

	if (!me.nodename) {
	    me.nodename = 'localhost';
	}

	let store = Ext.create('Ext.data.Store', {
	    autoLoad: {},
	    fields: ['vg', 'size', 'free'],
	    proxy: {
		type: 'proxmox',
		url: `${me.apiBaseUrl}${me.nodename}${me.apiSuffix}`,
	    },
	});

	Ext.apply(me, {
	    store: store,
	});

	me.callParent();
    },
});

Ext.define('PVE.storage.LvmThinInputPanel', {
    extend: 'PVE.panel.StorageBase',

    onlineHelp: 'storage_lvmthin',

    initComponent: function() {
	let me = this;

	me.column1 = [];

	let vgnameField = Ext.createWidget(me.isCreate ? 'textfield' : 'displayfield', {
	    name: 'vgname',
	    hidden: !!me.isCreate,
	    disabled: !!me.isCreate,
	    value: '',
	    fieldLabel: gettext('Volume group'),
	    allowBlank: false,
	});

	let thinpoolField = Ext.createWidget(me.isCreate ? 'textfield' : 'displayfield', {
	    name: 'thinpool',
	    hidden: !!me.isCreate,
	    disabled: !!me.isCreate,
	    value: '',
	    fieldLabel: gettext('Thin Pool'),
	    allowBlank: false,
	});

	if (me.isCreate) {
	    me.column1.push(Ext.create('PVE.storage.BaseVGSelector', {
		name: 'vgname',
		fieldLabel: gettext('Volume group'),
		reference: 'volumeGroupSelector',
		listeners: {
		    nodechanged: function(value) {
			me.lookup('thinPoolSelector').setNodeName(value);
			me.lookup('storageNodeRestriction').setValue(value);
		    },
		    change: function(f, value) {
			if (me.isCreate) {
			    let vgField = me.lookup('thinPoolSelector');
			    vgField.setVG(value);
			    vgField.setValue('');
			}
		    },
		},
	    }));

	    me.column1.push(Ext.create('PVE.storage.TPoolSelector', {
		name: 'thinpool',
		fieldLabel: gettext('Thin Pool'),
		reference: 'thinPoolSelector',
		allowBlank: false,
	    }));
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
