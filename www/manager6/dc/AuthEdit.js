Ext.define('PVE.dc.AuthEdit', {
    extend: 'Proxmox.window.Edit',
    alias: ['widget.pveDcAuthEdit'],

    isAdd: true,

    initComponent : function() {
        var me = this;

        me.isCreate = !me.realm;

        var url;
        var method;
        var serverlist;

        if (me.isCreate) {
            url = '/api2/extjs/access/domains';
            method = 'POST';
        } else {
            url = '/api2/extjs/access/domains/' + me.realm;
            method = 'PUT';
        }

        var column1 = [
            {
                xtype: me.isCreate ? 'textfield' : 'displayfield',
                name: 'realm',
                fieldLabel: gettext('Realm'),
                value: me.realm,
                allowBlank: false
            }
	];

	if (me.authType === 'ad') {

	    me.subject = gettext('Active Directory Server');

            column1.push({
                xtype: 'textfield',
                name: 'domain',
                fieldLabel: gettext('Domain'),
                emptyText: 'company.net',
                allowBlank: false
            });

	} else if (me.authType === 'ldap') {

	    me.subject = gettext('LDAP Server');

            column1.push({
                xtype: 'textfield',
                name: 'base_dn',
                fieldLabel: gettext('Base Domain Name'),
		emptyText: 'CN=Users,DC=Company,DC=net',
                allowBlank: false
            });

            column1.push({
                xtype: 'textfield',
                name: 'user_attr',
                emptyText: 'uid / sAMAccountName',
                fieldLabel: gettext('User Attribute Name'),
                allowBlank: false
            });
	} else if (me.authType === 'pve') {

	    if (me.isCreate) {
		throw 'unknown auth type';
	    }

	    me.subject = 'Proxmox VE authentication server';

	} else if (me.authType === 'pam') {

	    if (me.isCreate) {
		throw 'unknown auth type';
	    }

	    me.subject = 'linux PAM';

	} else {
	    throw 'unknown auth type ';
	}

        column1.push({
            xtype: 'proxmoxcheckbox',
            fieldLabel: gettext('Default'),
            name: 'default',
            uncheckedValue: 0
        });

        var column2 = [];

	if (me.authType === 'ldap' || me.authType === 'ad') {
	    column2.push(
		{
                    xtype: 'textfield',
                    fieldLabel: gettext('Server'),
                    name: 'server1',
                    allowBlank: false
		},
		{
                    xtype: 'proxmoxtextfield',
                    fieldLabel: gettext('Fallback Server'),
		    deleteEmpty: !me.isCreate,
		    name: 'server2'
		},
		{
                    xtype: 'proxmoxintegerfield',
                    name: 'port',
                    fieldLabel: gettext('Port'),
                    minValue: 1,
                    maxValue: 65535,
		    emptyText: gettext('Default'),
		    submitEmptyText: false
		},
		{
                    xtype: 'proxmoxcheckbox',
                    fieldLabel: 'SSL',
                    name: 'secure',
                    uncheckedValue: 0
		}
            );
	}

	column2.push({
	    xtype: 'pveTFASelector',
	});

	var ipanel = Ext.create('Proxmox.panel.InputPanel', {
	    column1: column1,
	    column2: column2,
	    columnB: [{
		xtype: 'textfield',
		name: 'comment',
		fieldLabel: gettext('Comment')
            }],
	    onGetValues: function(values) {
		if (!values.port) {
		    if (!me.isCreate) {
			Proxmox.Utils.assemble_field_data(values, { 'delete': 'port' });
		    }
		    delete values.port;
		}

		if (me.isCreate) {
		    values.type = me.authType;
		}

		return values;
	    }
	});

	Ext.applyIf(me, {
            url: url,
            method: method,
	    fieldDefaults: {
		labelWidth: 120
	    },
	    items: [ ipanel ]
        });

        me.callParent();

        if (!me.isCreate) {
            me.load({
                success: function(response, options) {
		    var data = response.result.data || {};
		    // just to be sure (should not happen)
		    if (data.type !== me.authType) {
			me.close();
			throw "got wrong auth type";
		    }

                    me.setValues(data);
                }
            });
        }
    }
});
