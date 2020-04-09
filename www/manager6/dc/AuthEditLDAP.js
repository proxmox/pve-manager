Ext.define('PVE.panel.LDAPInputPanel', {
    extend: 'PVE.panel.AuthBase',
    xtype: 'pveAuthLDAPPanel',

    initComponent: function() {
	let me = this;

	if (me.type !== 'ldap') {
	    throw 'invalid type';
	}

	me.column1 = [
	    {
		xtype: 'textfield',
		name: 'base_dn',
		fieldLabel: gettext('Base Domain Name'),
		emptyText: 'CN=Users,DC=Company,DC=net',
		allowBlank: false,
	    },
	    {
		xtype: 'textfield',
		name: 'user_attr',
		emptyText: 'uid / sAMAccountName',
		fieldLabel: gettext('User Attribute Name'),
		allowBlank: false,
	    },
	];

	me.column2 = [
	    {
		xtype: 'textfield',
		fieldLabel: gettext('Server'),
		name: 'server1',
		allowBlank: false,
	    },
	    {
		xtype: 'proxmoxtextfield',
		fieldLabel: gettext('Fallback Server'),
		deleteEmpty: !me.isCreate,
		name: 'server2',
	    },
	    {
		xtype: 'proxmoxintegerfield',
		name: 'port',
		fieldLabel: gettext('Port'),
		minValue: 1,
		maxValue: 65535,
		emptyText: gettext('Default'),
		submitEmptyText: false,
	    },
	    {
		xtype: 'proxmoxcheckbox',
		fieldLabel: 'SSL',
		name: 'secure',
		uncheckedValue: 0,
	    },
	];

	me.callParent();
    },
});
