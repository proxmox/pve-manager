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

	    if(form.isValid()){
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
			view.el.unmask();
			var handler = function() {
			    var uf = me.lookupReference('usernameField');
			    uf.focus(true, true);
			};

			Ext.MessageBox.alert(gettext('Error'),
					     gettext("Login failed. Please try again"),
					     handler);
		    },
		    success: function(f, resp){
			view.el.unmask();

			var handler = view.handler || Ext.emptyFn;
			handler.call(me, resp.result.data);
			view.close();
		    }
		});
	    }
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
			otp_field.setVisible(true);
			otp_field.setDisabled(false);
		    } else {
			otp_field.setVisible(false);
			otp_field.setDisabled(true);
		    }
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
		allowBlank: false,
		hidden: true
	    },
	    {
		xtype: 'pveRealmComboBox',
		name: 'realm'
	    },
	    {
		xtype: 'pveLanguageSelector',
		fieldLabel: gettext('Language'),
		value: Ext.util.Cookies.get('PVELangCookie') || 'en',
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
