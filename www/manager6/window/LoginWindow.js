/*global u2f*/
Ext.define('PVE.window.LoginWindow', {
    extend: 'Ext.window.Window',

    controller: {

	xclass: 'Ext.app.ViewController',

	onLogon: function() {
	    var me = this;

	    var form = this.lookupReference('loginForm');
	    var unField = this.lookupReference('usernameField');
	    var saveunField = this.lookupReference('saveunField');
	    var view = this.getView();

	    if (!form.isValid()) {
		return;
	    }

	    var perform_u2f_fn;
	    var finish_u2f_fn;

	    var failure_fn = function(resp) {
		view.el.unmask();
		var handler = function() {
		    var uf = me.lookupReference('usernameField');
		    uf.focus(true, true);
		};

		Ext.MessageBox.alert(gettext('Error'),
				     gettext("Login failed. Please try again"),
				     handler);
	    };

	    var success_fn = function(data) {
		var handler = view.handler || Ext.emptyFn;
		handler.call(me, data);
		view.close();
	    };

	    view.el.mask(gettext('Please wait...'), 'x-mask-loading');

	    // set or clear username
	    var sp = Ext.state.Manager.getProvider();
	    if (saveunField.getValue() === true) {
		sp.set(unField.getStateId(), unField.getValue());
	    } else {
		sp.clear(unField.getStateId());
	    }
	    sp.set(saveunField.getStateId(), saveunField.getValue());

	    form.submit({
		failure: function(f, resp){
		    failure_fn(resp);
		},
		success: function(f, resp){
		    view.el.unmask();

		    var data = resp.result.data;
		    if (Ext.isDefined(data.U2FChallenge)) {
			perform_u2f_fn(data);
		    } else {
			success_fn(data);
		    }
		}
	    });

	    perform_u2f_fn = function(data) {
		// Store first factor login information first:
		data.LoggedOut = true;
		Proxmox.Utils.setAuthData(data);
		// Show the message:
		var msg = Ext.Msg.show({
		    title: 'U2F: '+gettext('Verification'),
		    message: gettext('Please press the button on your U2F Device'),
		    buttons: []
		});
		var chlg = data.U2FChallenge;
		var key = {
		    version: chlg.version,
		    keyHandle: chlg.keyHandle
		};
		u2f.sign(chlg.appId, chlg.challenge, [key], function(res) {
		    msg.close();
		    if (res.errorCode) {
			Proxmox.Utils.authClear();
			Ext.Msg.alert(gettext('Error'), "U2F Error: "+res.errorCode);
			return;
		    }
		    delete res.errorCode;
		    finish_u2f_fn(res);
		});
	    };

	    finish_u2f_fn = function(res) {
		view.el.mask(gettext('Please wait...'), 'x-mask-loading');
		var params = { response: JSON.stringify(res) };
		Proxmox.Utils.API2Request({
		    url: '/api2/extjs/access/tfa',
		    params: params,
		    method: 'POST',
		    timeout: 5000, // it'll delay both success & failure
		    success: function(resp, opts) {
			view.el.unmask();
			// Fill in what we copy over from the 1st factor:
			var data = resp.result.data;
			data.CSRFPreventionToken = Proxmox.CSRFPreventionToken;
			data.username = Proxmox.UserName;
			// Finish logging in:
			success_fn(data);
		    },
		    failure: function(resp, opts) {
			Proxmox.Utils.authClear();
			failure_fn(resp);
		    }
		});
	    };
	},

	control: {
	    'field[name=username]': {
		specialkey: function(f, e) {
		    if (e.getKey() === e.ENTER) {
			var pf = this.lookupReference('passwordField');
			if (!pf.getValue()) {
			    pf.focus(false);
			}
		    }
		}
	    },
	    'field[name=realm]': {
		change: function(f, value) {
		    var otp_field = this.lookupReference('otpField');
		    if (f.needOTP(value)) {
			otp_field.setConfig('allowBlank', false);
			otp_field.setEmptyText(gettext('2nd factor'));
		    } else {
			otp_field.setConfig('allowBlank', true);
			otp_field.setEmptyText(gettext('2nd factor, if required'));
		    }
		    otp_field.validate();
		}
	    },
	    'field[name=lang]': {
		change: function(f, value) {
		    var dt = Ext.Date.add(new Date(), Ext.Date.YEAR, 10);
		    Ext.util.Cookies.set('PVELangCookie', value, dt);
		    this.getView().mask(gettext('Please wait...'), 'x-mask-loading');
		    window.location.reload();
		}
	    },
            'button[reference=loginButton]': {
		click: 'onLogon'
            },
	    '#': {
		show: function() {
		    var sp = Ext.state.Manager.getProvider();
		    var checkboxField = this.lookupReference('saveunField');
		    var unField = this.lookupReference('usernameField');

		    var checked = sp.get(checkboxField.getStateId());
		    checkboxField.setValue(checked);

		    if(checked === true) {
			var username = sp.get(unField.getStateId());
			unField.setValue(username);
			var pwField = this.lookupReference('passwordField');
			pwField.focus();
		    }
		}
	    }
	}
    },

    width: 400,

    modal: true,

    border: false,

    draggable: true,

    closable: false,

    resizable: false,

    layout: 'auto',

    title: gettext('Proxmox VE Login'),

    defaultFocus: 'usernameField',

    defaultButton: 'loginButton',

    items: [{
	xtype: 'form',
	layout: 'form',
	url: '/api2/extjs/access/ticket',
	reference: 'loginForm',

	fieldDefaults: {
	    labelAlign: 'right',
	    allowBlank: false
	},

	items: [
	    {
		xtype: 'textfield',
		fieldLabel: gettext('User name'),
		name: 'username',
		itemId: 'usernameField',
		reference: 'usernameField',
		stateId: 'login-username'
	    },
	    {
		xtype: 'textfield',
		inputType: 'password',
		fieldLabel: gettext('Password'),
		name: 'password',
		reference: 'passwordField'
	    },
	    {
		xtype: 'textfield',
		fieldLabel: gettext('OTP'),
		name: 'otp',
		reference: 'otpField',
		allowBlank: true,
		emptyText: gettext('2nd factor, if required')
	    },
	    {
		xtype: 'pveRealmComboBox',
		name: 'realm'
	    },
	    {
		xtype: 'proxmoxLanguageSelector',
		fieldLabel: gettext('Language'),
		value: Ext.util.Cookies.get('PVELangCookie') || Proxmox.defaultLang || 'en',
		name: 'lang',
		reference: 'langField',
		submitValue: false
	    }
	],
	buttons: [
	    {
		xtype: 'checkbox',
		fieldLabel: gettext('Save User name'),
		name: 'saveusername',
		reference: 'saveunField',
		stateId: 'login-saveusername',
		labelWidth: 'auto',
		labelAlign: 'right',
		submitValue: false
	    },
	    {
		text: gettext('Login'),
		reference: 'loginButton'
	    }
	]
    }]
 });
