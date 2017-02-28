Ext.define('PVE.dc.AuthEdit', {
    extend: 'PVE.window.Edit',
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
            xtype: 'pvecheckbox',
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
                    xtype: 'pvetextfield',
                    fieldLabel: gettext('Fallback Server'),
		    deleteEmpty: !me.isCreate,
		    name: 'server2'
		},
		{
                    xtype: 'pveIntegerField',
                    name: 'port',
                    fieldLabel: gettext('Port'),
                    minValue: 1,
                    maxValue: 65535,
		    emptyText: gettext('Default'),
		    submitEmptyText: false
		},
		{
                    xtype: 'pvecheckbox',
                    fieldLabel: 'SSL',
                    name: 'secure',
                    uncheckedValue: 0
		}
            );
	}

	// Two Factor Auth settings

        column2.push({
            xtype: 'pveKVComboBox',
            name: 'tfa',
	    deleteEmpty: !me.isCreate,
	    value: '',
            fieldLabel: gettext('TFA'),
	    comboItems: [ ['__default__', PVE.Utils.noneText], ['oath', 'OATH'], ['yubico', 'Yubico']],
	    listeners: {
		change: function(f, value) {
		    if (!me.rendered) {
			return;
		    }
		    me.down('field[name=oath_step]').setVisible(value === 'oath');
		    me.down('field[name=oath_digits]').setVisible(value === 'oath');
		    me.down('field[name=yubico_api_id]').setVisible(value === 'yubico');
		    me.down('field[name=yubico_api_key]').setVisible(value === 'yubico');
		    me.down('field[name=yubico_url]').setVisible(value === 'yubico');
		}
	    }
        });

	column2.push({
            xtype: 'pveIntegerField',
            name: 'oath_step',
	    value: '',
	    minValue: 10,
	    emptyText: PVE.Utils.defaultText + ' (30)',
	    submitEmptyText: false,
	    hidden: true,
            fieldLabel: 'OATH time step'
        });

	column2.push({
            xtype: 'pveIntegerField',
            name: 'oath_digits',
	    value: '',
	    minValue: 6,
	    maxValue: 8,
	    emptyText: PVE.Utils.defaultText + ' (6)',
	    submitEmptyText: false,
	    hidden: true,
            fieldLabel: 'OATH password length'
        });

	column2.push({
            xtype: 'textfield',
            name: 'yubico_api_id',
	    hidden: true,
            fieldLabel: 'Yubico API Id'
        });

	column2.push({
            xtype: 'textfield',
            name: 'yubico_api_key',
	    hidden: true,
            fieldLabel: 'Yubico API Key'
        });

	column2.push({
            xtype: 'textfield',
            name: 'yubico_url',
	    hidden: true,
            fieldLabel: 'Yubico URL'
        });

	var ipanel = Ext.create('PVE.panel.InputPanel', {
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
			PVE.Utils.assemble_field_data(values, { 'delete': 'port' });
		    }
		    delete values.port;
		}

		if (me.isCreate) {
		    values.type = me.authType;
		}

		if (values.tfa === 'oath') {
		    values.tfa = "type=oath";
		    if (values.oath_step) {
			values.tfa += ",step=" + values.oath_step;
		    }
		    if (values.oath_digits) {
			values.tfa += ",digits=" + values.oath_digits;
		    }
		} else if (values.tfa === 'yubico') {
		    values.tfa = "type=yubico";
		    values.tfa += ",id=" + values.yubico_api_id;
		    values.tfa += ",key=" + values.yubico_api_key;
		    if (values.yubico_url) {
			values.tfa += ",url=" + values.yubico_url;
		    }
		} else {
		    delete values.tfa;
		}

		delete values.oath_step;
		delete values.oath_digits;
		delete values.yubico_api_id;
		delete values.yubico_api_key;
		delete values.yubico_url;
		
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

		    if (data.tfa) {
			var tfacfg = PVE.Parser.parseTfaConfig(data.tfa);
			data.tfa = tfacfg.type;
			if (tfacfg.type === 'yubico') {
			    data.yubico_api_key = tfacfg.key;
			    data.yubico_api_id = tfacfg.id;
			    data.yubico_url = tfacfg.url;
			} else if (tfacfg.type === 'oath') {
			    // step is a number before
			    /*jslint confusion: true*/
			    data.oath_step = tfacfg.step;
			    data.oath_digits = tfacfg.digits;
			    /*jslint confusion: false*/
			}
		    }

                    me.setValues(data);
                }
            });
        }
    }
});
