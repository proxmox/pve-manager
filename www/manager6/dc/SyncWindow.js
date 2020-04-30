Ext.define('PVE.dc.SyncWindow', {
    extend: 'Ext.window.Window',

    title: gettext('Realm Sync'),

    width: 600,
    bodyPadding: 10,
    modal: true,
    resizable: false,

    controller: {
	xclass: 'Ext.app.ViewController',

	control: {
	    'form': {
		validitychange: function(field, valid) {
		    let me = this;
		    me.lookup('preview_btn').setDisabled(!valid);
		    me.lookup('sync_btn').setDisabled(!valid);
		},
	    },
	    'button': {
		click: function(btn) {
		    if (btn.reference === 'help_btn') return;
		    this.sync_realm(btn.reference === 'preview_btn');
		},
	    },
	},

	sync_realm: function(is_preview) {
	    let me = this;
	    let view = me.getView();
	    let ipanel = me.lookup('ipanel');
	    let params = ipanel.getValues();
	    params['dry-run'] = is_preview ? 1 : 0;
	    Proxmox.Utils.API2Request({
		url: `/access/domains/${view.realm}/sync`,
		waitMsgTarget: view,
		method: 'POST',
		params,
		failure: function(response) {
		    view.show();
		    Ext.Msg.alert(gettext('Error'), response.htmlStatus);
		},
		success: function(response) {
		    view.hide();
		    Ext.create('Proxmox.window.TaskViewer', {
			upid: response.result.data,
			listeners: {
			    destroy: function() {
				if (is_preview) {
				    view.show();
				} else {
				    view.close();
				}
			    },
			},
		    }).show();
		},
	    });
	},
    },

    items: [
	{
	    xtype: 'form',
	    reference: 'form',
	    border: false,
	    fieldDefaults: {
		labelWidth: 100,
		anchor: '100%',
	    },
	    items: [{
		xtype: 'inputpanel',
		reference: 'ipanel',
		column1: [
		    {
			xtype: 'proxmoxKVComboBox',
			name: 'scope',
			fieldLabel: gettext('Scope'),
			value: '',
			emptyText: gettext('No default available'),
			deleteEmpty: false,
			allowBlank: false,
			comboItems: [
			    ['users', gettext('Users')],
			    ['groups', gettext('Groups')],
			    ['both', gettext('Users and Groups')],
			],
		    },
		    {
			xtype: 'proxmoxKVComboBox',
			value: '',
			emptyText: gettext('No default available'),
			deleteEmpty: false,
			allowBlank: false,
			comboItems: [
			    ['1', Proxmox.Utils.yesText],
			    ['0', Proxmox.Utils.noText],
			],
			name: 'full',
			fieldLabel: gettext('Full'),
		    },
		],

		column2: [
		    {
			xtype: 'proxmoxKVComboBox',
			value: '1',
			deleteEmpty: false,
			allowBlank: false,
			comboItems: [
			    ['1', Proxmox.Utils.yesText],
			    ['0', Proxmox.Utils.noText],
			],
			name: 'enable-new',
			fieldLabel: gettext('Enable new'),
		    },
		    {
			xtype: 'proxmoxKVComboBox',
			value: '',
			emptyText: gettext('No default available'),
			deleteEmpty: false,
			allowBlank: false,
			comboItems: [
			    ['1', Proxmox.Utils.yesText],
			    ['0', Proxmox.Utils.noText],
			],
			name: 'purge',
			fieldLabel: gettext('Purge ACLs'),
		    },
		],

		columnB: [
		    {
			xtype: 'displayfield',
			reference: 'defaulthint',
			value: gettext('Default sync options can be set by editing the realm.'),
			userCls: 'pmx-hint',
			hidden: true
		    },
		],
	    }],
	},
    ],

    buttons: [
	{
	    xtype: 'proxmoxHelpButton',
	    reference: 'help_btn',
	    onlineHelp: 'pveum_ldap_sync',
	    hidden: false,
	},
	'->',
	{
	    text: gettext('Preview'),
	    reference: 'preview_btn',
	},
	{
	    text: gettext('Sync'),
	    reference: 'sync_btn',
	},
    ],

    initComponent: function() {
	let me = this;

	if (!me.realm) {
	    throw "no realm defined";
	}

	me.callParent();

	Proxmox.Utils.API2Request({
	    url: `/access/domains/${me.realm}`,
	    waitMsgTarget: me,
	    method: 'GET',
	    failure: function(response) {
		Ext.Msg.alert(gettext('Error'), response.htmlStatus);
		me.close();
	    },
	    success: function(response) {
		let default_options = response.result.data['sync-defaults-options'];
		if (default_options) {
		    let options = PVE.Parser.parsePropertyString(default_options);
		    let ipanel = me.lookup('ipanel');
		    ipanel.setValues(options);
		} else {
		    me.lookup('defaulthint').setVisible(true);
		}

		// check validity for button state
		me.lookup('form').isValid();
	    },
	});
    },
});
