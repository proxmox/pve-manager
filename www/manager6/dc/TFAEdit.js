Ext.define('PVE.window.TFAEdit', {
    extend: 'Ext.window.Window',
    mixins: ['Proxmox.Mixin.CBind'],

    modal: true,
    resizable: false,
    title: gettext('Two Factor Authentication'),
    subject: 'TFA',
    url: '/api2/extjs/access/tfa',
    width: 512,

    layout: {
	type: 'vbox',
	align: 'stretch'
    },

    updateQrCode: function() {
	var me = this;
	var values = me.lookup('totp-form').getValues();
	var algorithm = values.algorithm;
	if (!algorithm) {
	    algorithm = 'SHA1';
	}

	me.qrcode.makeCode(
	    'otpauth://totp/' + encodeURIComponent(values.name) +
	    '?secret=' + values.secret +
	    '&period=' + values.step +
	    '&digits=' + values.digits +
	    '&algorithm=' + algorithm +
	    '&issuer=' + encodeURIComponent(values.issuer)
	);

	me.lookup('challenge').setVisible(true);
	me.down('#qrbox').setVisible(true);
    },

    showError: function(error) {
	var ErrorNames = {
	    '1': gettext('Other Error'),
	    '2': gettext('Bad Request'),
	    '3': gettext('Configuration Unsupported'),
	    '4': gettext('Device Ineligible'),
	    '5': gettext('Timeout')
	};
	Ext.Msg.alert(
	    gettext('Error'),
	    "U2F Error: " + (ErrorNames[error] || Proxmox.Utils.unknownText)
	);
    },

    doU2FChallenge: function(response) {
	var me = this;

	var data = response.result.data;
	me.lookup('password').setDisabled(true);
	var msg = Ext.Msg.show({
	    title: 'U2F: '+gettext('Setup'),
	    message: gettext('Please press the button on your U2F Device'),
	    buttons: []
	});
	Ext.Function.defer(function() {
	    u2f.register(data.appId, [data], [], function(data) {
		msg.close();
		if (data.errorCode) {
		    me.showError(data.errorCode);
		} else {
		    me.respondToU2FChallenge(data);
		}
	    });
	}, 500, me);
    },

    respondToU2FChallenge: function(data) {
	var me = this;
	var params = {
	    userid: me.userid,
	    action: 'confirm',
	    response: JSON.stringify(data)
	};
	if (Proxmox.UserName !== 'root@pam') {
	    params.password = me.lookup('password').value;
	}
	Proxmox.Utils.API2Request({
	    url: '/api2/extjs/access/tfa',
	    params: params,
	    method: 'PUT',
	    success: function() {
		me.close();
		Ext.Msg.show({
		    title: gettext('Success'),
		    message: gettext('U2F Device successfully connected.'),
		    buttons: Ext.Msg.OK
		});
	    },
	    failure: function(response, opts) {
		Ext.Msg.alert(gettext('Error'), response.htmlStatus);
	    }
	});
    },

    viewModel: {
	data: {
	    in_totp_tab: true,
	    tfa_required: false,
	    u2f_available: true,
	}
    },

    afterLoadingRealm: function(realm_tfa_type) {
	var me = this;
	var viewmodel = me.getViewModel();
	if (!realm_tfa_type) {
	    // There's no TFA enforced by the realm, everything works.
	    viewmodel.set('u2f_available', true);
	    viewmodel.set('tfa_required', false);
	} else if (realm_tfa_type === 'oath') {
	    // The realm explicitly requires TOTP
	    viewmodel.set('tfa_required', true);
	    viewmodel.set('u2f_available', false);
	} else {
	    // The realm enforces some other TFA type (yubico)
	    me.close();
	    Ext.Msg.alert(
		gettext('Error'),
		Ext.String.format(
		    gettext("Custom 2nd factor configuration is not supported on realms with '{0}' TFA."),
		    realm_tfa_type
		)
	    );
	}
	//me.lookup('delete-button').setDisabled(has_tfa_configured);
	//me.lookup('u2f-panel').setDisabled(has_tfa_configured);
    },

    controller: {
	xclass: 'Ext.app.ViewController',
	control: {
	    'field[qrupdate=true]': {
		change: function() {
		    var me = this.getView();
		    me.updateQrCode();
		}
	    },
	    '#': {
		show: function() {
		    var me = this.getView();
		    me.down('#qrbox').getEl().appendChild(me.qrdiv);
		    me.down('#qrbox').setVisible(false);

		    if (Proxmox.UserName === 'root@pam') {
			me.lookup('password').setVisible(false);
			me.lookup('password').setDisabled(true);
		    }
		    me.lookup('challenge').setVisible(false);
		}
	    },
	    '#tfatabs': {
		tabchange: function(panel, newcard) {
		    var viewmodel = this.getViewModel();
		    viewmodel.set('in_totp_tab', newcard.itemId === 'totp-panel');
		}
	    }
	},

	applySettings: function() {
	    var me = this;
	    var values = me.lookup('totp-form').getValues();
	    var params = {
		userid: me.getView().userid,
		action: 'new',
		key: values.secret,
		config: PVE.Parser.printPropertyString({
		    type: 'oath',
		    digits: values.digits,
		    step: values.step,
		}),
		// this is used to verify that the client generates the correct codes:
		response: me.lookup('challenge').value,
	    };

	    if (Proxmox.UserName !== 'root@pam') {
		params.password = me.lookup('password').value;
	    }

	    Proxmox.Utils.API2Request({
		url: '/api2/extjs/access/tfa',
		params: params,
		method: 'PUT',
		waitMsgTarget: me.getView(),
		success: function(response, opts) {
		    me.getView().close();
		},
		failure: function(response, opts) {
		    Ext.Msg.alert(gettext('Error'), response.htmlStatus);
		}
	    });
	},

	deleteTFA: function() {
	    var me = this;
	    var values = me.lookup('totp-form').getValues();
	    var params = {
		userid: me.getView().userid,
		action: 'delete',
	    };

	    if (Proxmox.UserName !== 'root@pam') {
		params.password = me.lookup('password').value;
	    }

	    Proxmox.Utils.API2Request({
		url: '/api2/extjs/access/tfa',
		params: params,
		method: 'PUT',
		waitMsgTarget: me.getView(),
		success: function(response, opts) {
		    me.getView().close();
		},
		failure: function(response, opts) {
		    Ext.Msg.alert(gettext('Error'), response.htmlStatus);
		}
	    });
	},

	randomizeSecret: function() {
	    var me = this;
	    var rnd = new Uint8Array(16);
	    window.crypto.getRandomValues(rnd);
	    var data = '';
	    rnd.forEach(function(b) {
		// just use the first 5 bit
		b = b & 0x1f;
		if (b < 26) {
		    // A..Z
		    data += String.fromCharCode(b + 0x41);
		} else {
		    // 2..7
		    data += String.fromCharCode(b-26 + 0x32);
		}
	    });
	    me.lookup('tfa-secret').setValue(data);
	},

	startU2FRegistration: function() {
	    var me = this;

	    var params = {
		userid: me.getView().userid,
		action: 'new'
	    };

	    if (Proxmox.UserName !== 'root@pam') {
		params.password = me.lookup('password').value;
	    }

	    Proxmox.Utils.API2Request({
		url: '/api2/extjs/access/tfa',
		params: params,
		method: 'PUT',
		waitMsgTarget: me.getView(),
		success: function(response) {
		    me.getView().doU2FChallenge(response);
		},
		failure: function(response, opts) {
		    Ext.Msg.alert(gettext('Error'), response.htmlStatus);
		}
	    });
	}
    },

    items: [
	{
	    xtype: 'tabpanel',
	    itemId: 'tfatabs',
	    border: false,
	    items: [
		{
		    xtype: 'panel',
		    title: 'TOTP',
		    itemId: 'totp-panel',
		    border: false,
		    layout: {
			type: 'vbox',
			align: 'stretch'
		    },
		    items: [
			{
			    xtype: 'form',
			    layout: 'anchor',
			    border: false,
			    reference: 'totp-form',
			    fieldDefaults: {
				labelWidth: 120,
				anchor: '100%',
				padding: '0 5',
			    },
			    items: [
				{
				    layout: 'hbox',
				    border: false,
				    padding: '5 0',
				    items: [{
					xtype: 'textfield',
					fieldLabel: gettext('Secret'),
					name: 'secret',
					reference: 'tfa_secret',
					validateValue: function(value) {
					    return value.match(/^[A-Z2-7=]$/);
					},
					qrupdate: true,
					flex: 4
				    },
				    {
					xtype: 'button',
					text: gettext('Randomize'),
					reference: 'randomize_button',
					handler: 'randomizeSecret',
					flex: 1
				    }]
				},
				{
				    xtype: 'numberfield',
				    fieldLabel: gettext('Time period'),
				    name: 'step',
				    value: 30,
				    minValue: 10,
				    qrupdate: true,
				},
				{
				    xtype: 'numberfield',
				    fieldLabel: gettext('Digits'),
				    name: 'digits',
				    value: 6,
				    minValue: 6,
				    maxValue: 8,
				    qrupdate: true,
				},
				{
				    xtype: 'textfield',
				    fieldLabel: gettext('Issuer Name'),
				    name: 'issuer',
				    value: 'Proxmox Web UI',
				    qrupdate: true,
				},
				{
				    xtype: 'textfield',
				    hidden: true,
				    name: 'name',
				    cbind: {
					value: '{userid}',
				    },
				    qrupdate: true,
				}
			    ]
			},
			{
			    xtype: 'box',
			    itemId: 'qrbox',
			    visible: false, // will be enabled when generating a qr code
			    style: {
				'background-color': 'white',
				padding: '5px',
				width: '266px',
				height: '266px',
			    }
			},
			{
			    xtype: 'textfield',
			    fieldLabel: gettext('Code'),
			    labelWidth: 120,
			    reference: 'challenge',
			    padding: '0 5',
			    emptyText: gettext('verify TOTP authentication code')
			}
		    ]
		},
		{
		    title: 'U2F',
		    itemId: 'u2f-panel',
		    reference: 'u2f-panel',
		    border: false,
		    padding: '5 5',
		    layout: {
			type: 'vbox',
			align: 'middle'
		    },
		    bind: {
			disabled: '{!u2f_available}'
		    },
		    items: [
			{
			    xtype: 'label',
			    width: 500,
			    text: gettext('To register a U2F device, connect the device, then click the button and follow the instructions.'),
			}
		    ]
		}
	    ]
	},
	{
	    xtype: 'textfield',
	    inputType: 'password',
	    fieldLabel: gettext('Password'),
	    minLength: 5,
	    reference: 'password',
	    padding: '0 5',
	    labelWidth: 120,
	    emptyText: gettext('verify current password')
	}
    ],

    buttons: [
	{
	    text: gettext('Apply'),
	    handler: 'applySettings',
	    bind: {
		hidden: '{!in_totp_tab}',
		disabled: '{!user_tfa}'
	    }
	},
	{
	    xtype: 'button',
	    text: gettext('Register U2F Device'),
	    handler: 'startU2FRegistration',
	    bind: {
		hidden: '{in_totp_tab}'
	    }
	},
	{
	    text: gettext('Delete'),
	    reference: 'delete-button',
	    handler: 'deleteTFA',
	    bind: {
		disabled: '{tfa_required}'
	    }
	}
    ],

    initComponent: function() {
	var me = this;

	me.qrdiv = document.createElement('center');
	me.qrcode = new QRCode(me.qrdiv, {
	    //text: "This is not the qr code you're looking for",
	    width: 256,
	    height: 256,
	    correctLevel: QRCode.CorrectLevel.M
	});

	var store = new Ext.data.Store({
	    model: 'pve-domains',
	    autoLoad: true
	});

	store.on('load', function() {
	    var user_realm = me.userid.split('@')[1];
	    var realm = me.store.findRecord('realm', user_realm);
	    me.afterLoadingRealm(realm && realm.data && realm.data.tfa);
	}, me);

	Ext.apply(me, { store: store });

	me.callParent();
    }
});
