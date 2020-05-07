Ext.define('pve-acme-accounts', {
    extend: 'Ext.data.Model',
    fields: ['name'],
    proxy: {
	type: 'proxmox',
	    url: "/api2/json/cluster/acme/account",
    },
    idProperty: 'name',
});

Ext.define('pve-acme-plugins', {
    extend: 'Ext.data.Model',
    fields: ['type', 'plugin'],
    proxy: {
	type: 'proxmox',
	url: "/api2/json/cluster/acme/plugins",
    },
    idProperty: 'plugin',
});

Ext.define('PVE.dc.ACMEAccountView', {
    extend: 'Ext.grid.Panel',
    alias: 'widget.pveACMEAccountView',

    title: gettext('Accounts'),

    controller: {
	xclass: 'Ext.app.ViewController',

	addAccount: function() {
	    let me = this;
	    let view = me.getView();
	    let defaultExists = view.getStore().findExact('name', 'default') !== -1;
	    Ext.create('PVE.node.ACMEAccountCreate', {
		defaultExists,
		taskDone: function() {
		    me.reload();
		},
	    }).show();
	},

	viewAccount: function() {
	    let me = this;
	    let view = me.getView();
	    let selection = view.getSelection();
	    if (selection.length < 1) return;
	    Ext.create('PVE.node.ACMEAccountView', {
		accountname: selection[0].data.name,
	    }).show();
	},

	reload: function() {
	    let me = this;
	    let view = me.getView();
	    view.getStore().rstore.load();
	},

	showTaskAndReload: function(options, success, response) {
	    let me = this;
	    if (!success) return;

	    let upid = response.result.data;
	    Ext.create('Proxmox.window.TaskProgress', {
		upid,
		taskDone: function() {
		    me.reload();
		},
	    }).show();
	},
    },

    minHeight: 150,
    emptyText: gettext('No Accounts configured'),

    columns: [
	{
	    dataIndex: 'name',
	    text: gettext('Name'),
	    renderer: Ext.String.htmlEncode,
	    flex: 1,
	},
    ],

    tbar: [
	{
	    xtype: 'proxmoxButton',
	    text: gettext('Add'),
	    selModel: false,
	    handler: 'addAccount',
	},
	{
	    xtype: 'proxmoxButton',
	    text: gettext('View'),
	    handler: 'viewAccount',
	    disabled: true,
	},
	{
	    xtype: 'proxmoxStdRemoveButton',
	    baseurl: '/cluster/acme/account',
	    callback: 'showTaskAndReload',
	},
    ],

    listeners: {
	itemdblclick: 'viewAccount',
    },

    store: {
	type: 'diff',
	autoDestroy: true,
	autoDestroyRstore: true,
	rstore: {
	    type: 'update',
	    storeid: 'pve-acme-accounts',
	    model: 'pve-acme-accounts',
	    autoStart: true,
	},
	sorters: 'name',
    },
});

Ext.define('PVE.dc.ACMEPluginView', {
    extend: 'Ext.grid.Panel',
    alias: 'widget.pveACMEPluginView',

    title: gettext('Challenge Plugins'),

    controller: {
	xclass: 'Ext.app.ViewController',

	addPlugin: function() {
	    let me = this;
	    Ext.create('PVE.dc.ACMEPluginEditor', {
		isCreate: true,
		apiCallDone: function() {
		    me.reload();
		},
	    }).show();
	},

	editPlugin: function() {
	    let me = this;
	    let view = me.getView();
	    let selection = view.getSelection();
	    if (selection.length < 1) return;
	    let plugin = selection[0].data.plugin;
	    Ext.create('PVE.dc.ACMEPluginEditor', {
		url: `/cluster/acme/plugins/${plugin}`,
		apiCallDone: function() {
		    me.reload();
		},
	    }).show();
	},

	reload: function() {
	    let me = this;
	    let view = me.getView();
	    view.getStore().rstore.load();
	},
    },

    minHeight: 150,
    emptyText: gettext('No Plugins configured'),

    columns: [
	{
	    dataIndex: 'plugin',
	    text: gettext('Plugin'),
	    renderer: Ext.String.htmlEncode,
	    flex: 1,
	},
	{
	    dataIndex: 'api',
	    text: gettext('API'),
	    renderer: Ext.String.htmlEncode,
	    flex: 1,
	},
    ],

    tbar: [
	{
	    xtype: 'proxmoxButton',
	    text: gettext('Add'),
	    handler: 'addPlugin',
	    selModel: false,
	},
	{
	    xtype: 'proxmoxButton',
	    text: gettext('Edit'),
	    handler: 'editPlugin',
	    disabled: true,
	},
	{
	    xtype: 'proxmoxStdRemoveButton',
	    baseurl: '/cluster/acme/plugins',
	    callback: 'reload',
	},
    ],

    listeners: {
	itemdblclick: 'editPlugin',
    },

    store: {
	type: 'diff',
	autoDestroy: true,
	autoDestroyRstore: true,
	rstore: {
	    type: 'update',
	    storeid: 'pve-acme-plugins',
	    model: 'pve-acme-plugins',
	    autoStart: true,
	    filters: item => !!item.data.api,
	},
	sorters: 'plugin',
    },
});

Ext.define('PVE.dc.ACMEClusterView', {
    extend: 'Ext.panel.Panel',
    alias: 'widget.pveACMEClusterView',

    onlineHelp: 'sysadmin_certificate_management',

    items: [
	{
	    region: 'north',
	    border: false,
	    xtype: 'pveACMEAccountView',
	},
	{
	    region: 'center',
	    border: false,
	    xtype: 'pveACMEPluginView',
	},
    ],
});
