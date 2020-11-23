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
		type: 'proxmox',
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
    extend: 'PVE.panel.StorageBase',

    onlineHelp: 'storage_glusterfs',

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
			    var volumeField = me.down('field[name=volume]');
			    volumeField.setServer(value);
			    volumeField.setValue('');
			}
		    }
		}
	    },
	    {
		xtype: me.isCreate ? 'proxmoxtextfield' : 'displayfield',
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
		cts: ['images', 'iso', 'backup', 'vztmpl', 'snippets'],
		name: 'content',
		value: 'images',
		multiSelect: true,
		fieldLabel: gettext('Content'),
		allowBlank: false
	    }
	];

	me.callParent();
    }
});
