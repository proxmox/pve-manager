Ext.define('PVE.node.ACMEEditor', {
    extend: 'Proxmox.window.Edit',
    xtype: 'pveACMEEditor',

    subject: gettext('Domains'),
    items: [
	{
	    xtype: 'inputpanel',
	    items: [
		{
		    xtype: 'textarea',
		    fieldLabel: gettext('Domains'),
		    emptyText: "domain1.example.com\ndomain2.example.com",
		    name: 'domains'
		}
	    ],
	    onGetValues: function(values) {
		if (!values.domains) {
		    return {
			'delete': 'acme'
		    };
		}
		var domains = values.domains.split(/\n/).join(';');
		return {
		    'acme': 'domains=' + domains
		};
	    }
	}
    ],

    initComponent: function() {
	var me = this;
	me.callParent();

	me.load({
	    success: function(response, opts) {
		var res = PVE.Parser.parseACME(response.result.data.acme);
		if (res) {
		    res.domains = res.domains.join(' ');
		    me.setValues(res);
		}
	    }
	});
    }
});

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
		let acmeObj = PVE.Parser.parseACME(nodeconfig.acme) || {};

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
		    fieldLabel: gettext('Type'),
		    allowBlank: false,
		    comboItems: [
			['standalone', 'standalone'],
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
			    view.down('field[name=plugin]').setDisabled(value !== 'dns');
			},
		    },
		},
		{
		    xtype: 'hidden',
		    name: 'alias',
		},
		{
		    xtype: 'proxmoxtextfield',
		    name: 'domain',
		    allowBlank: false,
		    fieldLabel: gettext('Domain'),
		},
		{
		    xtype: 'pveACMEPluginSelector',
		    name: 'plugin',
		    disabled: true,
		    allowBlank: false,
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

	me.url = `/api2/extjs/nodes/${me.nodename}/config`;

	me.callParent();

	if (!me.isCreate) {
	    me.setValues(me.domain);
	}
    },
});

Ext.define('PVE.node.ACME', {
    extend: 'Proxmox.grid.ObjectGrid',
    xtype: 'pveACMEView',

    margin: '10 0 0 0',
    title: 'ACME',

    tbar: [
	{
	    xtype: 'button',
	    itemId: 'edit',
	    text: gettext('Edit Domains'),
	    handler: function() {
		this.up('grid').run_editor();
	    }
	},
	{
	    xtype: 'button',
	    itemId: 'createaccount',
	    text: gettext('Register Account'),
	    handler: function() {
		var me = this.up('grid');
		var win = Ext.create('PVE.node.ACMEAccountCreate', {
		    taskDone: function() {
			me.load_account();
			me.reload();
		    }
		});
		win.show();
	    }
	},
	{
	    xtype: 'button',
	    itemId: 'viewaccount',
	    text: gettext('View Account'),
	    handler: function() {
		var me = this.up('grid');
		var win = Ext.create('PVE.node.ACMEAccountView', {
		    accountname: 'default'
		});
		win.show();
	    }
	},
	{
	    xtype: 'button',
	    itemId: 'order',
	    text: gettext('Order Certificate'),
	    handler: function() {
		var me = this.up('grid');

		Proxmox.Utils.API2Request({
		    method: 'POST',
		    params: {
			force: 1
		    },
		    url: '/nodes/' + me.nodename + '/certificates/acme/certificate',
		    success: function(response, opt) {
			var win = Ext.create('Proxmox.window.TaskViewer', {
			    upid: response.result.data,
			    taskDone: function(success) {
				me.certificate_order_finished(success);
			    }
			});
			win.show();
		    },
		    failure: function(response, opt) {
			Ext.Msg.alert(gettext('Error'), response.htmlStatus);
		    }
		});
	    }
	}
    ],

    certificate_order_finished: function(success) {
	if (!success) {
	    return;
	}
	var txt = gettext('pveproxy will be restarted with new certificates, please reload the GUI!');
	Ext.getBody().mask(txt, ['pve-static-mask']);
	// reload after 10 seconds automatically
	Ext.defer(function() {
	    window.location.reload(true);
	}, 10000);
    },

    set_button_status: function() {
	var me = this;

	var account = !!me.account;
	var acmeObj = PVE.Parser.parseACME(me.getObjectValue('acme'));
	var domains = acmeObj ? acmeObj.domains.length : 0;

	var order = me.down('#order');
	order.setVisible(account);
	order.setDisabled(!account || !domains);

	me.down('#createaccount').setVisible(!account);
	me.down('#viewaccount').setVisible(account);
    },

    load_account: function() {
	var me = this;

	// for now we only use the 'default' account
	Proxmox.Utils.API2Request({
	    url: '/cluster/acme/account/default',
	    success: function(response, opt) {
		me.account = response.result.data;
		me.set_button_status();
	    },
	    failure: function(response, opt) {
		me.account = undefined;
		me.set_button_status();
	    }
	});
    },

    run_editor: function() {
	var me = this;
	var win = Ext.create(me.rows.acme.editor, me.editorConfig);
	win.show();
	win.on('destroy', me.reload, me);
    },

    listeners: {
	itemdblclick: 'run_editor'
    },

    // account data gets loaded here
    account: undefined,

    disableSelection: true,

    initComponent: function() {
	var me = this;

	if (!me.nodename) {
	    throw "no nodename given";
	}

	me.url = '/api2/json/nodes/' + me.nodename + '/config';

	me.editorConfig = {
	    url: '/api2/extjs/nodes/' + me.nodename + '/config'
	};
	/*jslint confusion: true*/
	/*acme is a string above*/
	me.rows = {
	    acme: {
		defaultValue: '',
		header: gettext('Domains'),
		editor: 'PVE.node.ACMEEditor',
		renderer: function(value) {
		    var acmeObj = PVE.Parser.parseACME(value);
		    if (acmeObj) {
			return acmeObj.domains.join('<br>');
		    }
		    return Proxmox.Utils.noneText;
		}
	    }
	};
	/*jslint confusion: false*/

	me.callParent();
	me.mon(me.rstore, 'load', me.set_button_status, me);
	me.rstore.startUpdate();
	me.load_account();
    }
});
