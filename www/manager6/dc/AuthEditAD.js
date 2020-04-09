Ext.define('PVE.panel.ADInputPanel', {
    extend: 'PVE.panel.AuthBase',
    xtype: 'pveAuthADPanel',

    initComponent: function() {
	let me = this;

	if (me.type !== 'ad') {
	    throw 'invalid type';
	}

	me.column1 = [
	    {
		xtype: 'textfield',
		name: 'domain',
		fieldLabel: gettext('Domain'),
		emptyText: 'company.net',
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
