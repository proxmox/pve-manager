Ext.define('PVE.dc.UserEdit', {
    extend: 'PVE.window.Edit',
    alias: ['widget.pveDcUserEdit'],

    initComponent : function() {
        var me = this;

        me.create = !me.userid;

        var url;
        var method;
        var realm;

        if (me.create) {
            url = '/api2/extjs/access/users';
            method = 'POST';
        } else {
            url = '/api2/extjs/access/users/' + me.userid;
            method = 'PUT';
        }

	var validate_pw = function() {
	    if (verifypw.getValue() !== pwfield.getValue()) {
		return gettext("Passwords does not match");
	    }
	    return true;
	};

	var verifypw = Ext.createWidget('textfield', { 
	    inputType: 'password',
	    fieldLabel: gettext('Verify Password'), 
	    name: 'verifypassword',
	    submitValue: false,
	    disabled: true,
	    hidden: true,
	    validator: validate_pw
	});

	var pwfield = Ext.createWidget('textfield', { 
	    inputType: 'password',
	    fieldLabel: gettext('Password'), 
	    minLength: 5,
	    allowBlank: false,
 	    name: 'password',
	    disabled: true,
	    hidden: true,
	    validator: validate_pw
	});

	var update_passwd_field = function(realm) {
	    if (realm === 'pve' || realm === 'pam') {
		pwfield.setVisible(true);
		pwfield.setDisabled(false);
		verifypw.setVisible(true);
		verifypw.setDisabled(false);
	    } else {
		pwfield.setVisible(false);
		pwfield.setDisabled(true);
		verifypw.setVisible(false);
		verifypw.setDisabled(true);
	    }
	};

        var column1 = [
            {
                xtype: me.create ? 'textfield' : 'displayfield',
		height: 22, // hack: set same height as text fields
                name: 'userid',
                fieldLabel: gettext('User name'),
                value: me.userid,
                allowBlank: false,
                submitValue: me.create ? true : false
            },
	    pwfield, verifypw,
	    {
		xtype: 'pveGroupSelector',
		name: 'groups',
		multiSelect: true,
		allowBlank: true,
		fieldLabel: gettext('Group')
	    },
            {
                xtype: 'datefield',
                name: 'expire',
		emptyText: 'never',
		format: 'Y-m-d',
		submitFormat: 'U',
                fieldLabel: gettext('Expire')
            },
	    {
		xtype: 'pvecheckbox',
		fieldLabel: gettext('Enabled'),
		name: 'enable',
		uncheckedValue: 0,
		defaultValue: 1
	    }
        ];

        var column2 = [
	    {
		xtype: 'textfield',
		name: 'firstname',
		fieldLabel: gettext('First Name')
	    },
	    {
		xtype: 'textfield',
		name: 'lastname',
		fieldLabel: gettext('Last Name')
	    },
	    {
		xtype: 'textfield',
		name: 'email',
		fieldLabel: 'E-Mail',
		vtype: 'email'
	    },
	    {
		xtype: 'textfield',
		name: 'comment',
		fieldLabel: gettext('Comment')
	    }
	];
 
        if (me.create) {
            column1.splice(1,0,{
                xtype: 'pveRealmComboBox',
                name: 'realm',
                fieldLabel: gettext('Realm'),
                allowBlank: false,
		matchFieldWidth: false,
		listConfig: { width: 300 },
                listeners: {
                    change: function(combo, newValue){
                        realm = newValue;
			update_passwd_field(realm);
                    }
                },
                submitValue: false
            });
        }

	var ipanel = Ext.create('PVE.panel.InputPanel', {
	    column1: column1,
	    column2: column2,
	    onGetValues: function(values) {
		// hack: ExtJS datefield does not submit 0, so we need to set that
		if (!values.expire) {
		    values.expire = 0;
		}

		if (realm) {
		    values.userid = values.userid + '@' + realm;
		}

		return values;
	    }
	});

	Ext.applyIf(me, {
            subject: gettext('User'),
            url: url,
            method: method,
	    items: [ ipanel ]
        });

        me.callParent();

        if (!me.create) {
            me.load({
		success: function(response, options) {
		    var data = response.result.data;
		    if (Ext.isDefined(data.expire)) {
			if (data.expire) {
			    data.expire = new Date(data.expire * 1000);
			} else {
			    // display 'never' instead of '1970-01-01'
			    data.expire = null;
			}
		    }

		    update_passwd_field(data.realm);

 		    me.setValues(data);
                }
            });
        }
    }
});
