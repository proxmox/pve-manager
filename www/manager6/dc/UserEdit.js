Ext.define('PVE.dc.UserEdit', {
    extend: 'PVE.window.Edit',
    alias: ['widget.pveDcUserEdit'],

    isAdd: true,

    initComponent : function() {
        var me = this;

        me.isCreate = !me.userid;

        var url;
        var method;
        var realm;

        if (me.isCreate) {
            url = '/api2/extjs/access/users';
            method = 'POST';
        } else {
            url = '/api2/extjs/access/users/' + me.userid;
            method = 'PUT';
	}

	var verifypw;
	var pwfield;

	var validate_pw = function() {
	    if (verifypw.getValue() !== pwfield.getValue()) {
		return gettext("Passwords does not match");
	    }
	    return true;
	};

	verifypw = Ext.createWidget('textfield', { 
	    inputType: 'password',
	    fieldLabel: gettext('Confirm password'), 
	    name: 'verifypassword',
	    submitValue: false,
	    disabled: true,
	    hidden: true,
	    validator: validate_pw
	});

	pwfield = Ext.createWidget('textfield', { 
	    inputType: 'password',
	    fieldLabel: gettext('Password'), 
	    minLength: 5,
	    name: 'password',
	    disabled: true,
	    hidden: true,
	    validator: validate_pw
	});

	var update_passwd_field = function(realm) {
	    if (realm === 'pve') {
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
                xtype: me.isCreate ? 'textfield' : 'displayfield',
                name: 'userid',
                fieldLabel: gettext('User name'),
                value: me.userid,
                allowBlank: false,
                submitValue: me.isCreate ? true : false
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
		defaultValue: 1,
		checked: true
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
		fieldLabel: gettext('E-Mail'),
		vtype: 'pveMail'
	    }
	];

	var columnB = [
	    {
		xtype: 'textfield',
		name: 'comment',
		fieldLabel: gettext('Comment')
	    },
	    {
		xtype: 'textfield',
		name: 'keys',
		fieldLabel: gettext('Key IDs')
	    }
	];
 
        if (me.isCreate) {
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
	    columnB: columnB,
	    onGetValues: function(values) {
		// hack: ExtJS datefield does not submit 0, so we need to set that
		if (!values.expire) {
		    values.expire = 0;
		}

		if (realm) {
		    values.userid = values.userid + '@' + realm;
		}

		if (!values.password) {
		    delete values.password;
		}

		return values;
	    }
	});

	Ext.applyIf(me, {
            subject: gettext('User'),
            url: url,
            method: method,
	    fieldDefaults: {
		labelWidth: 110 // for spanish translation 
	    },
	    items: [ ipanel ]
        });

        me.callParent();

        if (!me.isCreate) {
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
		    me.setValues(data);
                }
            });
        }
    }
});
