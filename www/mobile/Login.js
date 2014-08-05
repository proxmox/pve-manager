Ext.define('PVE.Login', {
    extend: 'Ext.form.Panel',
    alias: "widget.pveLogin",
    config: {
	title: 'Login',
	padding: 10,
	appUrl: 'login',
	items: [
	    {
		xtype: 'image',
		src: '/pve2/images/proxmox_logo.png',
		height: 30,
		width: 209
	    },
	    {
	        xtype: 'fieldset',
	        title: 'Proxmox VE Login',
	        items: [
	            {
	                xtype: 'textfield',
	                placeHolder: gettext('User name'),
	                itemId: 'userNameTextField',
	                name: 'username',
	                required: true
	            },
	            {
	                xtype: 'passwordfield',
	                placeHolder: gettext('Password'),
	                itemId: 'passwordTextField',
	                name: 'password',
	                required: true
	            },
		    {
			xtype: 'textfield',
	                itemId: 'otpField',
			placeHolder: gettext('OTP'), 
			name: 'otp',
			allowBlank: false,
			hidden: true
		    },
		    {
			xtype: 'pveRealmSelector',
	                itemId: 'realmSelectorField',
			name: 'realm',
			listeners: {
			    change: function(f, value) {
				var form = this.up('formpanel');

				var otp_field = form.down('#otpField');

				if (f.needOTP(value)) {
				    otp_field.setHidden(false);
				    otp_field.enable();
				} else {
				    otp_field.setHidden(true);
				    otp_field.disable();
				}
			    }
			}
		    }
	        ]
	    },
	    {
	        xtype: 'label',
                html: 'Login failed. Please enter the correct credentials.',
	        itemId: 'signInFailedLabel',
	        hidden: true,
	        hideAnimation: 'fadeOut',
	        showAnimation: 'fadeIn',
	        style: 'color:#990000;margin:5px 0px;'
	    },
	    {
	        xtype: 'button',
	        itemId: 'logInButton',
	        ui: 'action',
	        text: 'Log In',
		handler: function() {
                    var form = this.up('formpanel');

		    var usernameField = form.down('#userNameTextField'),
	            passwordField = form.down('#passwordTextField'),
		    realmField = form.down('#realmSelectorField'),
		    otpField = form.down('#otpField'),
	            label = form.down('#signInFailedLabel');

		    label.hide();

		    var username = usernameField.getValue();
	            var password = passwordField.getValue();
	            var realm = realmField.getValue();
		    var otp = otpField.getValue();

		    PVE.Utils.API2Request({
			url: '/access/ticket',
			method: 'POST',
			waitMsgTarget: form,
			params: { username: username, password: password, realm: realm, otp: otp},
			failure: function(response, options) {
			    label.show();
			},
			success: function(response, options) {
			    usernameField.setValue('');
			    passwordField.setValue('');
			    PVE.Workspace.updateLoginData(response.result.data);
			}
		    });
		}
	    }
	]
    }
});
