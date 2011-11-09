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

        var column1 = [
            {
                xtype: me.create ? 'textfield' : 'displayfield',
                name: 'userid',
                fieldLabel: 'Userid',
                value: me.userid,
                allowBlank: false,
                submitValue: me.create ? true : false
            },
	    new Ext.form.field.ComboBox({
		fieldLabel: 'Group',
		name: 'groups',
		multiSelect: true,
		hiddenName: 'groupid',
		store: new Ext.data.Store({
                    autoLoad: true,
		    model: 'pve-groups',
		    proxy: {
			type: 'pve',
			url: "/api2/json/access/groups"
		    },
		    sorters: {
			property: 'groupid',
			order: 'DESC'
		    }
		}),
		valueField: 'groupid',
		displayField: 'groupid',
		typeAhead: true,
		queryMode: 'local',
		triggerAction: 'all',
		emptyText: 'No Groups Selected',
		selectOnFocus: true
	    }),
            {
                xtype: 'datefield',
                name: 'expire',
		emptyText: 'never',
		format: 'Y-m-d',
		submitFormat: 'U',
                fieldLabel: 'Expiration'
            },
	    {
		xtype: 'pvecheckbox',
		fieldLabel: 'Enable',
		name: 'enable',
		uncheckedValue: 0,
		defaultValue: 1
	    }
        ];

        var column2 = [
	    {
		xtype: 'textfield',
		name: 'firstname',
		fieldLabel: 'First Name'
	    },
	    {
		xtype: 'textfield',
		name: 'lastname',
		fieldLabel: 'Last Name'
	    },
	    {
		xtype: 'textfield',
		name: 'email',
		fieldLabel: 'Email',
		vtype: 'email'
	    },
	    {
		xtype: 'textfield',
		name: 'comment',
		fieldLabel: 'Comment'
	    }
	];
 
        if (me.create) {
            column1.splice(1,0,{
                xtype: 'pveRealmComboBox',
                name: 'realm',
                fieldLabel: 'Realm',
                allowBlank: false,
                listeners: {
                    change: function(combo, newValue){
                        realm = newValue;
                    }
                },
                submitValue: false
            });
        }


	var ipanel = Ext.create('PVE.panel.InputPanel', {
	    column1: column1,
	    column2:  column2,
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
            title: me.create ? "Create User" : "Edit User '" + me.userid + "'",
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

		    me.setValues(data);
                }
            });
        }
    }
});
