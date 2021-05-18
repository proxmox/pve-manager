/*global u2f,QRCode*/
Ext.define('PVE.window.TFAEdit', {
    extend: 'Ext.window.Window',
    mixins: ['Proxmox.Mixin.CBind'],

    onlineHelp: 'pveum_tfa_auth', // fake to ensure this gets a link target

    modal: true,
    resizable: false,
    title: gettext('Two Factor Authentication'),
    subject: 'TFA',
    url: '/api2/extjs/access/tfa',
    width: 512,

    layout: {
	type: 'vbox',
	align: 'stretch',
    },

    updateQrCode: function() {
	var me = this;
	var values = me.lookup('totp_form').getValues();
	var algorithm = values.algorithm;
	if (!algorithm) {
	    algorithm = 'SHA1';
	}

	me.qrcode.makeCode(
	    'otpauth://totp/' +
	    encodeURIComponent(values.issuer) +
	    ':' +
	    encodeURIComponent(values.userid) +
	    '?secret=' + values.secret +
	    '&period=' + values.step +
	    '&digits=' + values.digits +
	    '&algorithm=' + algorithm +
	    '&issuer=' + encodeURIComponent(values.issuer),
	);

	me.lookup('challenge').setVisible(true);
	me.down('#qrbox').setVisible(true);
    },

    showError: function(error) {
	Ext.Msg.alert(
	    gettext('Error'),
	    PVE.Utils.render_u2f_error(error),
	);
    },

    doU2FChallenge: function(res) {
	let me = this;

	let challenge = res.result.data;
	me.lookup('password').setDisabled(true);
	let msg = Ext.Msg.show({
	    title: 'U2F: ' + gettext('Setup'),
	    message: gettext('Please press the button on your U2F Device'),
	    buttons: [],
	});
	Ext.Function.defer(function() {
	    u2f.register(challenge.appId, [challenge], [], function(response) {
		msg.close();
		if (response.errorCode) {
		    me.showError(response.errorCode);
		} else {
		    me.respondToU2FChallenge(response);
		}
	    });
	}, 500, me);
    },

    respondToU2FChallenge: function(data) {
	var me = this;
	var params = {
	    userid: me.userid,
	    action: 'confirm',
	    response: JSON.stringify(data),
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
		    buttons: Ext.Msg.OK,
		});
	    },
	    failure: function(response, opts) {
		Ext.Msg.alert(gettext('Error'), response.htmlStatus);
	    },
	});
    },

    viewModel: {
	data: {
	    in_totp_tab: true,
	    tfa_required: false,
	    tfa_type: null, // dependencies of formulas should not be undefined
	    valid: false,
	    u2f_available: true,
	    secret: "",
	},
	formulas: {
	    showTOTPVerifiction: function(get) {
		return get('secret').length > 0 && get('canSetupTOTP');
	    },
	    canDeleteTFA: function(get) {
		return get('tfa_type') !== null && !get('tfa_required');
	    },
	    canSetupTOTP: function(get) {
		var tfa = get('tfa_type');
		return tfa === null || tfa === 'totp' || tfa === 1;
	    },
	    canSetupU2F: function(get) {
		var tfa = get('tfa_type');
		return get('u2f_available') && (tfa === null || tfa === 'u2f' || tfa === 1);
	    },
	    secretEmpty: function(get) {
		return get('secret').length === 0;
	    },
	    selectedTab: function(get) {
		return (get('tfa_type') || 'totp') + '-panel';
	    },
	},
    },

    afterLoading: function(realm_tfa_type, user_tfa_type) {
	var me = this;
	var viewmodel = me.getViewModel();
	if (user_tfa_type === 'oath') {
	    user_tfa_type = 'totp';
	    viewmodel.set('secret', '');
	}

	// if the user has no tfa, generate a secret for him
	if (!user_tfa_type) {
	    me.getController().randomizeSecret();
	}

	viewmodel.set('tfa_type', user_tfa_type || null);
	if (!realm_tfa_type) {
	    // There's no TFA enforced by the realm, everything works.
	    viewmodel.set('u2f_available', true);
	    viewmodel.set('tfa_required', false);
	} else if (realm_tfa_type === 'oath') {
	    // The realm explicitly requires TOTP
	    if (user_tfa_type !== 'totp' && user_tfa_type !== null) {
		// user had a different tfa method, so
		// we have to change back to the totp tab and
		// generate a secret
		viewmodel.set('tfa_type', 'totp');
		me.getController().randomizeSecret();
	    }
	    viewmodel.set('tfa_required', true);
	    viewmodel.set('u2f_available', false);
	} else {
	    // The realm enforces some other TFA type (yubico)
	    me.close();
	    Ext.Msg.alert(
		gettext('Error'),
		Ext.String.format(
		    gettext("Custom 2nd factor configuration is not supported on realms with '{0}' TFA."),
		    realm_tfa_type,
		),
	    );
	}
    },

    controller: {
	xclass: 'Ext.app.ViewController',
	control: {
	    'field[qrupdate=true]': {
		change: function() {
		    this.getView().updateQrCode();
		},
	    },
	    'field': {
		validitychange: function(field, valid) {
		    var me = this;
		    var viewModel = me.getViewModel();
		    var form = me.lookup('totp_form');
		    var challenge = me.lookup('challenge');
		    var password = me.lookup('password');
		    viewModel.set('valid', form.isValid() && challenge.isValid() && password.isValid());
		},
	    },
	    '#': {
		show: function() {
		    let view = this.getView();

		    Proxmox.Utils.API2Request({
			url: '/access/users/' + encodeURIComponent(view.userid) + '/tfa',
			waitMsgTarget: view.down('#tfatabs'),
			method: 'GET',
			success: function(response, opts) {
			    let data = response.result.data;
			    view.afterLoading(data.realm, data.user);
			},
			failure: function(response, opts) {
			    view.close();
			    Ext.Msg.alert(gettext('Error'), response.htmlStatus);
			},
		    });

		    view.qrdiv = document.createElement('center');
		    view.qrcode = new QRCode(view.qrdiv, {
			width: 256,
			height: 256,
			correctLevel: QRCode.CorrectLevel.M,
		    });
		    view.down('#qrbox').getEl().appendChild(view.qrdiv);

		    if (Proxmox.UserName === 'root@pam') {
			view.lookup('password').setVisible(false);
			view.lookup('password').setDisabled(true);
		    }
		},
	    },
	    '#tfatabs': {
		tabchange: function(panel, newcard) {
		    this.getViewModel().set('in_totp_tab', newcard.itemId === 'totp-panel');
		},
	    },
	},

	applySettings: function() {
	    let me = this;
	    let values = me.lookup('totp_form').getValues();
	    let params = {
		userid: me.getView().userid,
		action: 'new',
		key: 'v2-' + values.secret,
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
		},
	    });
	},

	deleteTFA: function() {
	    let me = this;
	    let params = {
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
		},
	    });
	},

	randomizeSecret: function() {
	    let me = this;
	    let rnd = new Uint8Array(32);
	    window.crypto.getRandomValues(rnd);
	    let data = '';
	    rnd.forEach(function(b) {
		// secret must be base32, so just use the first 5 bits
		b = b & 0x1f;
		if (b < 26) {
		    data += String.fromCharCode(b + 0x41); // A..Z
		} else {
		    data += String.fromCharCode(b-26 + 0x32); // 2..7
		}
	    });
	    me.getViewModel().set('secret', data);
	},

	startU2FRegistration: function() {
	    let me = this;

	    let params = {
		userid: me.getView().userid,
		action: 'new',
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
		},
	    });
	},
    },

    items: [
	{
	    xtype: 'tabpanel',
	    itemId: 'tfatabs',
	    reference: 'tfatabs',
	    border: false,
	    bind: {
		activeTab: '{selectedTab}',
	    },
	    items: [
		{
		    xtype: 'panel',
		    title: 'TOTP',
		    itemId: 'totp-panel',
		    reference: 'totp_panel',
		    tfa_type: 'totp',
		    border: false,
		    bind: {
			disabled: '{!canSetupTOTP}',
		    },
		    layout: {
			type: 'vbox',
			align: 'stretch',
		    },
		    items: [
			{
			    xtype: 'form',
			    layout: 'anchor',
			    border: false,
			    reference: 'totp_form',
			    fieldDefaults: {
				anchor: '100%',
				padding: '0 5',
			    },
			    items: [
				{
				    xtype: 'displayfield',
				    fieldLabel: gettext('User name'),
				    renderer: Ext.String.htmlEncode,
				    cbind: {
					value: '{userid}',
				    },
				},
				{
				    layout: 'hbox',
				    border: false,
				    padding: '0 0 5 0',
				    items: [{
					xtype: 'textfield',
					fieldLabel: gettext('Secret'),
					emptyText: gettext('Unchanged'),
					name: 'secret',
					reference: 'tfa_secret',
					regex: /^[A-Z2-7=]+$/,
					regexText: 'Must be base32 [A-Z2-7=]',
					maskRe: /[A-Z2-7=]/,
					qrupdate: true,
					bind: {
					    value: "{secret}",
					},
					flex: 4,
				    },
				    {
					xtype: 'button',
					text: gettext('Randomize'),
					reference: 'randomize_button',
					handler: 'randomizeSecret',
					flex: 1,
				    }],
				},
				{
				    xtype: 'numberfield',
				    fieldLabel: gettext('Time period'),
				    name: 'step',
				    // Google Authenticator ignores this and generates bogus data
				    hidden: true,
				    value: 30,
				    minValue: 10,
				    qrupdate: true,
				},
				{
				    xtype: 'numberfield',
				    fieldLabel: gettext('Digits'),
				    name: 'digits',
				    value: 6,
				    // Google Authenticator ignores this and generates bogus data
				    hidden: true,
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
			    ],
			},
			{
			    xtype: 'box',
			    itemId: 'qrbox',
			    visible: false, // will be enabled when generating a qr code
			    bind: {
				visible: '{!secretEmpty}',
			    },
			    style: {
				'background-color': 'white',
				padding: '5px',
				width: '266px',
				height: '266px',
			    },
			},
			{
			    xtype: 'textfield',
			    fieldLabel: gettext('Verification Code'),
			    allowBlank: false,
			    reference: 'challenge',
			    bind: {
				disabled: '{!showTOTPVerifiction}',
				visible: '{showTOTPVerifiction}',
			    },
			    padding: '0 5',
			    emptyText: gettext('Scan QR code and enter TOTP auth. code to verify'),
			},
		    ],
		},
		{
		    title: 'U2F',
		    itemId: 'u2f-panel',
		    reference: 'u2f_panel',
		    tfa_type: 'u2f',
		    border: false,
		    padding: '5 5',
		    layout: {
			type: 'vbox',
			align: 'middle',
		    },
		    bind: {
			disabled: '{!canSetupU2F}',
		    },
		    items: [
			{
			    xtype: 'label',
			    width: 500,
			    text: gettext('To register a U2F device, connect the device, then click the button and follow the instructions.'),
			},
		    ],
		},
	    ],
	},
	{
	    xtype: 'textfield',
	    inputType: 'password',
	    fieldLabel: gettext('Password'),
	    minLength: 5,
	    reference: 'password',
	    allowBlank: false,
	    validateBlank: true,
	    padding: '0 0 5 5',
	    emptyText: gettext('verify current password'),
	},
    ],

    buttons: [
	{
	    xtype: 'proxmoxHelpButton',
	},
	'->',
	{
	    text: gettext('Apply'),
	    handler: 'applySettings',
	    bind: {
		hidden: '{!in_totp_tab}',
		disabled: '{!valid}',
	    },
	},
	{
	    xtype: 'button',
	    text: gettext('Register U2F Device'),
	    handler: 'startU2FRegistration',
	    bind: {
		hidden: '{in_totp_tab}',
		disabled: '{tfa_type}',
	    },
	},
	{
	    text: gettext('Delete'),
	    reference: 'delete_button',
	    disabled: true,
	    handler: 'deleteTFA',
	    bind: {
		disabled: '{!canDeleteTFA}',
	    },
	},
    ],

    initComponent: function() {
	var me = this;

	if (!me.userid) {
	    throw "no userid given";
	}

	me.callParent();

	Ext.GlobalEvents.fireEvent('proxmoxShowHelp', 'pveum_tfa_auth');
    },
});
