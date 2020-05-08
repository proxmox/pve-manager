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

Ext.define('PVE.panel.LDAPSyncInputPanel', {
    extend: 'Proxmox.panel.InputPanel',
    xtype: 'pveAuthLDAPSyncPanel',

    editableAttributes: ['email'],
    editableDefaults: ['scope', 'full', 'enable-new', 'purge'],
    default_opts: {},
    sync_attributes: {},

    // (de)construct the sync-attributes from the list above,
    // not touching all others
    onGetValues: function(values) {
	let me = this;
	me.editableDefaults.forEach((attr) => {
	    if (values[attr]) {
		me.default_opts[attr] = values[attr];
		delete values[attr];
	    } else {
		delete me.default_opts[attr];
	    }
	});
	values['sync-defaults-options'] = PVE.Parser.printPropertyString(me.default_opts);
	me.editableAttributes.forEach((attr) => {
	    if (values[attr]) {
		me.sync_attributes[attr] = values[attr];
		delete values[attr];
	    } else {
		delete me.sync_attributes[attr];
	    }
	});
	values.sync_attributes = PVE.Parser.printPropertyString(me.sync_attributes);

	PVE.Utils.delete_if_default(values, 'sync-defaults-options');
	PVE.Utils.delete_if_default(values, 'sync_attributes');

	if (me.isCreate) {
	    delete values.delete; // on create we cannot delete values
	}

	return values;
    },

    setValues: function(values) {
	let me = this;
	if (values.sync_attributes) {
	    me.sync_attributes = PVE.Parser.parsePropertyString(values.sync_attributes);
	    delete values.sync_attributes;
	    me.editableAttributes.forEach((attr) => {
		if (me.sync_attributes[attr]) {
		    values[attr] = me.sync_attributes[attr];
		}
	    });
	}
	if (values['sync-defaults-options']) {
	    me.default_opts = PVE.Parser.parsePropertyString(values['sync-defaults-options']);
	    delete values.default_opts;
	    me.editableDefaults.forEach((attr) => {
		if (me.default_opts[attr]) {
		    values[attr] = me.default_opts[attr];
		}
	    });
	}
	return me.callParent([values]);
    },

    column1: [
	{
	    xtype: 'proxmoxtextfield',
	    name: 'bind_dn',
	    deleteEmpty: true,
	    emptyText: Proxmox.Utils.noneText,
	    fieldLabel: gettext('Bind User'),
	},
	{
	    xtype: 'proxmoxtextfield',
	    inputType: 'password',
	    name: 'password',
	    emptyText: gettext('Unchanged'),
	    fieldLabel: gettext('Bind Password'),
	},
	{
	    xtype: 'proxmoxtextfield',
	    name: 'email',
	    fieldLabel: gettext('E-Mail attribute'),
	},
	{
	    xtype: 'proxmoxtextfield',
	    name: 'group_name_attr',
	    deleteEmpty: true,
	    fieldLabel: gettext('Groupname attr.'),
	},
	{
	    xtype: 'displayfield',
	    value: gettext('Default Sync Options'),
	},
	{
	    xtype: 'proxmoxKVComboBox',
	    name: 'scope',
	    emptyText: Proxmox.Utils.NoneText,
	    fieldLabel: gettext('Scope'),
	    value: '__default__',
	    deleteEmpty: false,
	    comboItems: [
		['__default__', Proxmox.Utils.NoneText],
		['users', gettext('Users')],
		['groups', gettext('Groups')],
		['both', gettext('Users and Groups')],
	    ],
	},
	{
	    xtype: 'proxmoxKVComboBox',
	    value: '__default__',
	    deleteEmpty: false,
	    comboItems: [
		['__default__', Proxmox.Utils.NoneText],
		['1', Proxmox.Utils.yesText],
		['0', Proxmox.Utils.noText],
	    ],
	    name: 'full',
	    fieldLabel: gettext('Full'),
	},
    ],

    column2: [
	{
	    xtype: 'proxmoxtextfield',
	    name: 'user_classes',
	    fieldLabel: gettext('User classes'),
	    deleteEmpty: true,
	    emptyText: 'inetorgperson, posixaccount, person, user',
	},
	{
	    xtype: 'proxmoxtextfield',
	    name: 'group_classes',
	    fieldLabel: gettext('Group classes'),
	    deleteEmpty: true,
	    emptyText: 'groupOfNames, group, univentionGroup, ipausergroup',
	},
	{
	    xtype: 'proxmoxtextfield',
	    name: 'filter',
	    fieldLabel: gettext('User Filter'),
	    deleteEmpty: true,
	},
	{
	    xtype: 'proxmoxtextfield',
	    name: 'group_filter',
	    fieldLabel: gettext('Group Filter'),
	    deleteEmpty: true,
	},
	{
	    // fake for spacing
	    xtype: 'displayfield',
	    value: ' ',
	},
	{
	    xtype: 'proxmoxKVComboBox',
	    value: '__default__',
	    deleteEmpty: false,
	    comboItems: [
		[
		    '__default__',
		    Ext.String.format(
			gettext("{0} ({1})"),
			Proxmox.Utils.yesText,
			Proxmox.Utils.defaultText,
		    ),
		],
		['1', Proxmox.Utils.yesText],
		['0', Proxmox.Utils.noText],
	    ],
	    name: 'enable-new',
	    fieldLabel: gettext('Enable new users'),
	},
	{
	    xtype: 'proxmoxKVComboBox',
	    value: '__default__',
	    deleteEmpty: false,
	    comboItems: [
		['__default__', Proxmox.Utils.NoneText],
		['1', Proxmox.Utils.yesText],
		['0', Proxmox.Utils.noText],
	    ],
	    name: 'purge',
	    fieldLabel: gettext('Purge'),
	},
    ],
});
