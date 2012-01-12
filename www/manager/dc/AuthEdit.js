Ext.define('PVE.dc.AuthEdit', {
    extend: 'PVE.window.Edit',
    alias: ['widget.pveDcAuthEdit'],

    initComponent : function() {
        var me = this;

        me.create = !me.realm;

        var url;
        var method;
        var serverlist;

        if (me.create) {
            url = '/api2/extjs/access/domains';
            method = 'POST';
        } else {
            url = '/api2/extjs/access/domains/' + me.realm;
            method = 'PUT';
        }

        var column1 = [
            {
                xtype: me.create ? 'textfield' : 'displayfield',
                name: 'realm',
                fieldLabel: gettext('Realm'),
                value: me.realm,
                emptyText: 'company.net',
                allowBlank: false
            },
            {
                xtype: 'textfield',
                name: 'base_dn',
                fieldLabel: 'Base Domain Name',
                emptyText: 'CN=Users,DC=Company,DC=net',
                allowBlank: false
            },
            {
                xtype: 'textfield',
                name: 'user_attr',
                emptyText: 'uid / sAMAccountName',
                fieldLabel: 'User Attribute Name',
                allowBlank: false
            },
            {
                xtype: 'textfield',
                name: 'comment',
                fieldLabel: gettext('Comment'),
                emptyText: 'Enterprise Directory Server',
                allowBlank: false
            },
            {
                xtype: 'pvecheckbox',
                fieldLabel: gettext('Default'),
                name: 'default',
                uncheckedValue: 0
            }
        ];

        var column2 = [
	    Ext.create('PVE.form.KVComboBox', {
		fieldLabel: 'Server Type',
                name: 'type',
		data: [
		    ['ad', 'Active Directory Server'],
		    ['ldap', 'LDAP/LDAPs Server']
		]
	    }),
            {
                xtype: 'textfield',
                fieldLabel: gettext('Server Address'),
                name: 'servers',
                emptyText: '192.168.2.23,ldap.company.net',
                listeners: {
                    change: function(combo, newValue){
                        serverlist = newValue.split(',');
                    }
                },
                submitValue: false,
                allowBlank: false
            },
            {
                xtype: 'numberfield',
                name: 'port',
                fieldLabel: gettext('Server Port'),
                minValue: 1,
                maxValue: 65535,
                allowBlank: false
            },
            {
                xtype: 'pvecheckbox',
                fieldLabel: 'SSL',
                name: 'secure',
                uncheckedValue: 0
            }
        ];

	var ipanel = Ext.create('PVE.panel.InputPanel', {
	    column1: column1,
	    column2: column2,
	    onGetValues: function(values) {
                var i;
                for (i=0; i<serverlist.length; i++) {
                    var num = i + 1;
                    values['server' + num.toString()] = serverlist[i];
                }
		return values;
	    }
	});

	Ext.applyIf(me, {
	    subject: gettext('Realm'),
            url: url,
            method: method,
	    items: [ ipanel ]
        });

        me.callParent();

        if (!me.create) {
            me.load({
                success: function(response, options) {
		    var data = response.result.data || {};
                    var count = 1;
                    while (data['server' + count.toString()]) {
			if (data.servers) {
			    data.servers += ',';
			}
                        data.servers += data['server' + count.toString()];
			count++;
                    }
                    me.setValues(data);
                }
            });
        }
    }
});
