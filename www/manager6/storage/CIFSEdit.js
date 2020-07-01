Ext.define('PVE.storage.CIFSScan', {
    extend: 'Ext.form.field.ComboBox',
    alias: 'widget.pveCIFSScan',

    queryParam: 'server',

    valueField: 'share',
    displayField: 'share',
    matchFieldWidth: false,
    listConfig: {
	loadingText: gettext('Scanning...'),
	width: 350,
    },
    doRawQuery: Ext.emptyFn,

    onTriggerClick: function() {
	var me = this;

	if (!me.queryCaching || me.lastQuery !== me.cifsServer) {
	    me.store.removeAll();
	}

	var params = {};
	if (me.cifsUsername && me.cifsPassword) {
	    params.username =  me.cifsUsername;
	    params.password = me.cifsPassword;
	}

	if (me.cifsDomain) {
	    params.domain = me.cifsDomain;
	}

	me.store.getProxy().setExtraParams(params);
	me.allQuery = me.cifsServer;

	me.callParent();
    },

    setServer: function(server) {
	this.cifsServer = server;
    },

    setUsername: function(username) {
	this.cifsUsername = username;
    },
    setPassword: function(password) {
	this.cifsPassword = password;
    },
    setDomain: function(domain) {
	this.cifsDomain = domain;
    },

    initComponent: function() {
	var me = this;

	if (!me.nodename) {
	    me.nodename = 'localhost';
	}

	let store = Ext.create('Ext.data.Store', {
	    fields: ['description', 'share'],
	    proxy: {
		type: 'proxmox',
		url: '/api2/json/nodes/' + me.nodename + '/scan/cifs',
	    },
	});
	store.sort('share', 'ASC');

	Ext.apply(me, {
	    store: store,
	});

	me.callParent();
    },
});

Ext.define('PVE.storage.CIFSInputPanel', {
    extend: 'PVE.panel.StorageBase',

    onlineHelp: 'storage_cifs',

    initComponent: function() {
	var me = this;

	var passwordfield = Ext.createWidget(me.isCreate ? 'textfield' : 'displayfield', {
	    inputType: 'password',
	    name: 'password',
	    value: me.isCreate ? '' : '********',
	    fieldLabel: gettext('Password'),
	    allowBlank: false,
	    disabled: me.isCreate,
	    minLength: 1,
	    listeners: {
		change: function(f, value) {
		    if (me.isCreate) {
			var exportField = me.down('field[name=share]');
			exportField.setPassword(value);
		    }
		},
	    },
	});

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
			    var exportField = me.down('field[name=share]');
			    exportField.setServer(value);
			}
		    },
		},
	    },
	    {
		xtype: me.isCreate ? 'textfield' : 'displayfield',
		name: 'username',
		value: '',
		fieldLabel: gettext('Username'),
		emptyText: gettext('Guest user'),
		allowBlank: true,
		listeners: {
		    change: function(f, value) {
			if (!me.isCreate) {
			    return;
			}
			var exportField = me.down('field[name=share]');
			exportField.setUsername(value);

			if (value === "") {
			    passwordfield.disable();
			} else {
			    passwordfield.enable();
			}
			passwordfield.validate();
		    },
		},
	    },
	    passwordfield,
	    {
		xtype: me.isCreate ? 'pveCIFSScan' : 'displayfield',
		name: 'share',
		value: '',
		fieldLabel: 'Share',
		allowBlank: false,
	    },
	];

	me.column2 = [
	    {
		xtype: 'proxmoxintegerfield',
		fieldLabel: gettext('Max Backups'),
		name: 'maxfiles',
		reference: 'maxfiles',
		minValue: 0,
		maxValue: 365,
		value: me.isCreate ? '1' : undefined,
		allowBlank: false,
	    },
	    {
		xtype: 'pveContentTypeSelector',
		name: 'content',
		value: 'images',
		multiSelect: true,
		fieldLabel: gettext('Content'),
		allowBlank: false,
	    },
	    {
		xtype: me.isCreate ? 'textfield' : 'displayfield',
		name: 'domain',
		value: me.isCreate ? '' : undefined,
		fieldLabel: gettext('Domain'),
		allowBlank: true,
		listeners: {
		    change: function(f, value) {
			if (me.isCreate) {
			    let exportField = me.down('field[name=share]');
			    exportField.setDomain(value);
			}
		    },
		},
	    },
	];

	me.callParent();
    },
});
