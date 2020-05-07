Ext.define('PVE.node.ACMEAccountCreate', {
    extend: 'Proxmox.window.Edit',

    width: 400,
    title: gettext('Register Account'),
    isCreate: true,
    method: 'POST',
    submitText: gettext('Register'),
    url: '/cluster/acme/account',
    showTaskViewer: true,

    items: [
	{
	    xtype: 'proxmoxtextfield',
	    fieldLabel: gettext('Name'),
	    name: 'name',
	    emptyText: 'default',
	    allowBlank: true,
	},
	{
	    xtype: 'proxmoxComboGrid',
	    name: 'directory',
	    allowBlank: false,
	    valueField: 'url',
	    displayField: 'name',
	    fieldLabel: gettext('ACME Directory'),
	    store: {
		autoLoad: true,
		fields: ['name', 'url'],
		idProperty: ['name'],
		proxy: {
		    type: 'proxmox',
		    url: '/api2/json/cluster/acme/directories'
		},
		sorters: {
		    property: 'name',
		    order: 'ASC'
		}
	    },
	    listConfig: {
		columns: [
		    {
			header: gettext('Name'),
			dataIndex: 'name',
			flex: 1
		    },
		    {
			header: gettext('URL'),
			dataIndex: 'url',
			flex: 1
		    }
		]
	    },
	    listeners: {
		change: function(combogrid, value) {
		    var me = this;
		    if (!value) {
			return;
		    }

		    var disp = me.up('window').down('#tos_url_display');
		    var field = me.up('window').down('#tos_url');
		    var checkbox = me.up('window').down('#tos_checkbox');

		    disp.setValue(gettext('Loading'));
		    field.setValue(undefined);
		    checkbox.setValue(undefined);

		    Proxmox.Utils.API2Request({
			url: '/cluster/acme/tos',
			method: 'GET',
			params: {
			    directory: value
			},
			success: function(response, opt) {
			    me.up('window').down('#tos_url').setValue(response.result.data);
			    me.up('window').down('#tos_url_display').setValue(response.result.data);
			},
			failure: function(response, opt) {
			    Ext.Msg.alert(gettext('Error'), response.htmlStatus);
			}
		    });
		}
	    }
	},
	{
	    xtype: 'displayfield',
	    itemId: 'tos_url_display',
	    fieldLabel: gettext('Terms of Service'),
	    renderer: PVE.Utils.render_optional_url,
	    name: 'tos_url_display'
	},
	{
	    xtype: 'hidden',
	    itemId: 'tos_url',
	    name: 'tos_url'
	},
	{
	    xtype: 'proxmoxcheckbox',
	    itemId: 'tos_checkbox',
	    fieldLabel: gettext('Accept TOS'),
	    submitValue: false,
	    validateValue: function(value) {
		if (value && this.checked) {
		    return true;
		}
		return false;
	    }
	},
	{
	    xtype: 'textfield',
	    name: 'contact',
	    vtype: 'email',
	    allowBlank: false,
	    fieldLabel: gettext('E-Mail')
	}
    ]

});

Ext.define('PVE.node.ACMEAccountView', {
    extend: 'Proxmox.window.Edit',

    width: 600,
    fieldDefaults: {
	labelWidth: 140
    },

    title: gettext('Account'),

    items: [
	{
	    xtype: 'displayfield',
	    fieldLabel: gettext('E-Mail'),
	    name: 'email'
	},
	{
	    xtype: 'displayfield',
	    fieldLabel: gettext('Created'),
	    name: 'createdAt'
	},
	{
	    xtype: 'displayfield',
	    fieldLabel: gettext('Status'),
	    name: 'status'
	},
	{
	    xtype: 'displayfield',
	    fieldLabel: gettext('Directory'),
	    renderer: PVE.Utils.render_optional_url,
	    name: 'directory'
	},
	{
	    xtype: 'displayfield',
	    fieldLabel: gettext('Terms of Services'),
	    renderer: PVE.Utils.render_optional_url,
	    name: 'tos'
	}
    ],

    initComponent: function() {
	var me = this;

	if (!me.accountname) {
	    throw "no account name defined";
	}

	me.url = '/cluster/acme/account/' + me.accountname;

	me.callParent();

	// hide OK/Reset button, because we just want to show data
	me.down('toolbar[dock=bottom]').setVisible(false);

	me.load({
	    success: function(response) {
		var data = response.result.data;
		data.email = data.account.contact[0];
		data.createdAt = data.account.createdAt;
		data.status = data.account.status;
		me.setValues(data);
	    }
	});
    }
});

Ext.define('PVE.node.ACMEDomainEdit', {
    extend: 'Proxmox.window.Edit',
    alias: 'widget.pveACMEDomainEdit',

    subject: gettext('Domain'),
    isCreate: false,
    width: 450,
    onlineHelp: 'sysadmin_certificate_management',

    items: [
	{
	    xtype: 'inputpanel',
	    onGetValues: function(values) {
		let me = this;
		let win = me.up('pveACMEDomainEdit');
		let nodeconfig = win.nodeconfig;
		let olddomain = win.domain || {};

		let params = {
		    digest: nodeconfig.digest,
		};

		let configkey = olddomain.configkey;
		let acmeObj = PVE.Parser.parseACME(nodeconfig.acme);

		if (values.type === 'dns') {
		    if (!olddomain.configkey || olddomain.configkey === 'acme') {
			// look for first free slot
			for (let i = 0; i < PVE.Utils.acmedomain_count; i++) {
			    if (nodeconfig[`acmedomain${i}`] === undefined) {
				configkey = `acmedomain${i}`;
				break;
			    }
			}
			if (olddomain.domain) {
			    // we have to remove the domain from the acme domainlist
			    PVE.Utils.remove_domain_from_acme(acmeObj, olddomain.domain);
			    params.acme = PVE.Parser.printACME(acmeObj);
			}
		    }

		    delete values.type;
		    params[configkey] = PVE.Parser.printPropertyString(values, 'domain');
		} else {
		    if (olddomain.configkey && olddomain.configkey !== 'acme') {
			// delete the old dns entry
			params.delete = [olddomain.configkey];
		    }

		    // add new, remove old and make entries unique
		    PVE.Utils.add_domain_to_acme(acmeObj, values.domain);
		    PVE.Utils.remove_domain_from_acme(acmeObj, olddomain.domain);
		    params.acme = PVE.Parser.printACME(acmeObj);
		}

		return params;
	    },
	    items: [
		{
		    xtype: 'proxmoxKVComboBox',
		    name: 'type',
		    fieldLabel: gettext('Challenge Type'),
		    allowBlank: false,
		    value: 'standalone',
		    comboItems: [
			['standalone', 'HTTP'],
			['dns', 'DNS'],
		    ],
		    validator: function(value) {
			let me = this;
			let win = me.up('pveACMEDomainEdit');
			let oldconfigkey = win.domain ? win.domain.configkey : undefined;
			let val = me.getValue();
			if (val === 'dns' && (!oldconfigkey || oldconfigkey === 'acme')) {
			    // we have to check if there is a 'acmedomain' slot left
			    let found = false;
			    for (let i = 0; i < PVE.Utils.acmedomain_count; i++) {
				if (!win.nodeconfig[`acmedomain${i}`]) {
				    found = true;
				}
			    }
			    if (!found) {
				return gettext('Only 5 Domains with type DNS can be configured');
			    }
			}

			return true;
		    },
		    listeners: {
			change: function(cb, value) {
			    let me = this;
			    let view = me.up('pveACMEDomainEdit');
			    let pluginField = view.down('field[name=plugin]');
			    pluginField.setDisabled(value !== 'dns');
			    pluginField.setHidden(value !== 'dns');
			},
		    },
		},
		{
		    xtype: 'hidden',
		    name: 'alias',
		},
		{
		    xtype: 'pveACMEPluginSelector',
		    name: 'plugin',
		    disabled: true,
		    hidden: true,
		    allowBlank: false,
		},
		{
		    xtype: 'proxmoxtextfield',
		    name: 'domain',
		    allowBlank: false,
		    vtype: 'DnsName',
		    value: '',
		    fieldLabel: gettext('Domain'),
		},
	    ],
	},
    ],

    initComponent: function() {
	let me = this;

	if (!me.nodename) {
	    throw 'no nodename given';
	}

	if (!me.nodeconfig) {
	    throw 'no nodeconfig given';
	}

	me.isCreate = !me.domain;
	if (me.isCreate) {
	    me.domain = `${me.nodename}.`; // TODO: FQDN of node
	}

	me.url = `/api2/extjs/nodes/${me.nodename}/config`;

	me.callParent();

	if (!me.isCreate) {
	    me.setValues(me.domain);
	} else {
	    me.setValues({ domain: me.domain });
	}
    },
});

Ext.define('pve-acme-domains', {
    extend: 'Ext.data.Model',
    fields: ['domain', 'type', 'alias', 'plugin', 'configkey'],
    idProperty: 'domain',
});

Ext.define('PVE.node.ACME', {
    extend: 'Ext.grid.Panel',
    alias: 'widget.pveACMEView',

    margin: '10 0 0 0',
    title: 'ACME',

    emptyText: gettext('No Domains configured'),

    viewModel: {
	data: {
	    domaincount: 0,
	    account: undefined, // the account we display
	    configaccount: undefined, // the account set in the config
	    accountEditable: false,
	    accountsAvailable: false,
	},

	formulas: {
	    canOrder: (get) => !!get('account') && get('domaincount') > 0,
	    editBtnIcon: (get) => 'fa black fa-' + (get('accountEditable') ? 'check' : 'pencil'),
	    accountTextHidden: (get) => get('accountEditable') || !get('accountsAvailable'),
	    accountValueHidden: (get) => !get('accountEditable') || !get('accountsAvailable'),
	},
    },

    controller: {
	xclass: 'Ext.app.ViewController',

	init: function(view) {
	    let accountSelector = this.lookup('accountselector');
	    accountSelector.store.on('load', this.onAccountsLoad, this);
	},

	onAccountsLoad: function(store, records, success) {
	    let me = this;
	    let vm = me.getViewModel();
	    let configaccount = vm.get('configaccount');
	    vm.set('accountsAvailable', records.length > 0);
	    if (me.autoChangeAccount && records.length > 0) {
		me.changeAccount(records[0].data.name, () => {
		    vm.set('accountEditable', false);
		    me.reload();
		});
		me.autoChangeAccount = false;
	    } else if (configaccount) {
		if (store.findExact('name', configaccount) !== -1) {
		    vm.set('account', configaccount);
		} else {
		    vm.set('account', null);
		}
	    }
	},

	addDomain: function() {
	    let me = this;
	    let view = me.getView();

	    Ext.create('PVE.node.ACMEDomainEdit', {
		nodename: view.nodename,
		nodeconfig: view.nodeconfig,
		apiCallDone: function() {
		    me.reload();
		},
	    }).show();
	},

	editDomain: function() {
	    let me = this;
	    let view = me.getView();

	    let selection = view.getSelection();
	    if (selection.length < 1) return;

	    Ext.create('PVE.node.ACMEDomainEdit', {
		nodename: view.nodename,
		nodeconfig: view.nodeconfig,
		domain: selection[0].data,
		apiCallDone: function() {
		    me.reload();
		},
	    }).show();
	},

	removeDomain: function() {
	    let me = this;
	    let view = me.getView();
	    let selection = view.getSelection();
	    if (selection.length < 1) return;

	    let rec = selection[0].data;
	    let params = {};
	    if (rec.configkey !== 'acme') {
		params.delete = rec.configkey;
	    } else {
		let acme = PVE.Parser.parseACME(view.nodeconfig.acme);
		PVE.Utils.remove_domain_from_acme(acme, rec.domain);
		params.acme = PVE.Parser.printACME(acme);
	    }

	    Proxmox.Utils.API2Request({
		method: 'PUT',
		url: `/nodes/${view.nodename}/config`,
		params,
		success: function(response, opt) {
		    me.reload();
		},
		failure: function(response, opt) {
		    Ext.Msg.alert(gettext('Error'), response.htmlStatus);
		},
	    });
	},

	toggleEditAccount: function() {
	    let me = this;
	    let vm = me.getViewModel();
	    let editable = vm.get('accountEditable');
	    if (editable) {
		me.changeAccount(vm.get('account'), function() {
		    vm.set('accountEditable', false);
		    me.reload();
		});
	    } else {
		vm.set('accountEditable', true);
	    }
	},

	changeAccount: function(account, callback) {
	    let me = this;
	    let view = me.getView();
	    let params = {};

	    let acme = PVE.Parser.parseACME(view.nodeconfig.acme);
	    acme.account = account;
	    params.acme = PVE.Parser.printACME(acme);

	    Proxmox.Utils.API2Request({
		method: 'PUT',
		waitMsgTarget: view,
		url: `/nodes/${view.nodename}/config`,
		params,
		success: function(response, opt) {
		    if (Ext.isFunction(callback)) {
			callback();
		    }
		},
		failure: function(response, opt) {
		    Ext.Msg.alert(gettext('Error'), response.htmlStatus);
		},
	    });
	},

	order: function() {
	    let me = this;
	    let view = me.getView();

	    Proxmox.Utils.API2Request({
		method: 'POST',
		params: {
		    force: 1,
		},
		url: `/nodes/${view.nodename}/certificates/acme/certificate`,
		success: function(response, opt) {
		    Ext.create('Proxmox.window.TaskViewer', {
		        upid: response.result.data,
		        taskDone: function(success) {
			    me.orderFinished(success);
		        },
		    }).show();
		},
		failure: function(response, opt) {
		    Ext.Msg.alert(gettext('Error'), response.htmlStatus);
		},
	    });
	},

	orderFinished: function(success) {
	    if (!success) return;
	    var txt = gettext('pveproxy will be restarted with new certificates, please reload the GUI!');
	    Ext.getBody().mask(txt, ['pve-static-mask']);
	    // reload after 10 seconds automatically
	    Ext.defer(function() {
		window.location.reload(true);
	    }, 10000);
	},

	reload: function() {
	    let me = this;
	    let view = me.getView();
	    view.rstore.load();
	},

	addAccount: function() {
	    let me = this;
	    Ext.create('PVE.node.ACMEAccountCreate', {
		autoShow: true,
		taskDone: function() {
		    me.reload();
		    let accountSelector = me.lookup('accountselector');
		    me.autoChangeAccount = true;
		    accountSelector.store.load();
		},
	    });
	},
    },

    tbar: [
	{
	    xtype: 'proxmoxButton',
	    text: gettext('Add'),
	    handler: 'addDomain',
	    selModel: false,
	},
	{
	    xtype: 'proxmoxButton',
	    text: gettext('Edit'),
	    disabled: true,
	    handler: 'editDomain',
	},
	{
	    xtype: 'proxmoxStdRemoveButton',
	    handler: 'removeDomain',
	},
	'-',
	{
	    xtype: 'button',
	    reference: 'order',
	    text: gettext('Order Certificates Now'),
	    bind: {
		disabled: '{!canOrder}',
	    },
	    handler: 'order',
	},
	'-',
	{
	    xtype: 'displayfield',
	    value: gettext('Using Account') + ':',
	    bind: {
		hidden: '{!accountsAvailable}',
	    },
	},
	{
	    xtype: 'displayfield',
	    reference: 'accounttext',
	    renderer: (val) => val || Proxmox.Utils.NoneText,
	    bind: {
		value: '{account}',
		hidden: '{accountTextHidden}',
	    },
	},
	{
	    xtype: 'pveACMEAccountSelector',
	    hidden: true,
	    reference: 'accountselector',
	    bind: {
		value: '{account}',
		hidden: '{accountValueHidden}',
	    },
	},
	{
	    xtype: 'button',
	    iconCls: 'fa black fa-pencil',
	    baseCls: 'x-plain',
	    userCls: 'pointer',
	    bind: {
		iconCls: '{editBtnIcon}',
		hidden: '{!accountsAvailable}',
	    },
	    handler: 'toggleEditAccount',
	},
	{
	    xtype: 'displayfield',
	    value: gettext('No Account available.'),
	    bind: {
		hidden: '{accountsAvailable}',
	    },
	},
	{
	    xtype: 'button',
	    hidden: true,
	    reference: 'accountlink',
	    text: gettext('Add ACME Account'),
	    bind: {
		hidden: '{accountsAvailable}',
	    },
	    handler: 'addAccount',
	},
    ],

    updateStore: function(store, records, success) {
	let me = this;
	let data = [];
	let rec;
	if (success && records.length > 0) {
	    rec = records[0];
	} else {
	    rec = {
		data: {},
	    };
	}

	me.nodeconfig = rec.data; // save nodeconfig for updates

	let account = 'default';

	if (rec.data.acme) {
	    let obj = PVE.Parser.parseACME(rec.data.acme);
	    (obj.domains || []).forEach(domain => {
		if (domain === '') return;
		let record = {
		    domain,
		    type: 'standalone',
		    configkey: 'acme',
		};
		data.push(record);
	    });

	    if (obj.account) {
		account = obj.account;
	    }
	}

	let vm = me.getViewModel();
	let oldaccount = vm.get('account');

	// account changed, and we do not edit currently, load again to verify
	if (oldaccount !== account && !vm.get('accountEditable')) {
	    vm.set('configaccount', account);
	    me.lookup('accountselector').store.load();
	}

	for (let i = 0; i < PVE.Utils.acmedomain_count; i++) {
	    let acmedomain = rec.data[`acmedomain${i}`];
	    if (!acmedomain) continue;

	    let record = PVE.Parser.parsePropertyString(acmedomain, 'domain');
	    record.type = 'dns';
	    record.configkey = `acmedomain${i}`;
	    data.push(record);
	}

	vm.set('domaincount', data.length);
	me.store.loadData(data, false);
    },

    listeners: {
	itemdblclick: 'editDomain',
    },

    columns: [
	{
	    dataIndex: 'domain',
	    flex: 5,
	    text: gettext('Domain'),
	},
	{
	    dataIndex: 'type',
	    flex: 1,
	    text: gettext('Type'),
	},
	{
	    dataIndex: 'plugin',
	    flex: 1,
	    text: gettext('Plugin'),
	},
    ],

    initComponent: function() {
	var me = this;

	if (!me.nodename) {
	    throw "no nodename given";
	}

	me.rstore = Ext.create('Proxmox.data.UpdateStore', {
	    interval: 10 * 1000,
	    autoStart: true,
	    storeid: `pve-node-domains-${me.nodename}`,
	    proxy: {
		type: 'proxmox',
		url: `/api2/json/nodes/${me.nodename}/config`,
	    },
	});

	me.store = Ext.create('Ext.data.Store', {
	    model: 'pve-acme-domains',
	    sorters: 'domain',
	});

	me.callParent();
	me.mon(me.rstore, 'load', 'updateStore', me);
	Proxmox.Utils.monStoreErrors(me, me.rstore);
    },
});
