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
		listeners: {
		    change: function(field, newValue) {
			let verifyCheckbox = field.nextSibling('proxmoxcheckbox[name=verify]');
			if (newValue === true) {
			    verifyCheckbox.enable();
			} else {
			    verifyCheckbox.disable();
			    verifyCheckbox.setValue(0);
			}
		    },
		},
	    },
	    {
		xtype: 'proxmoxcheckbox',
		fieldLabel: gettext('Verify Certificate'),
		name: 'verify',
		unceckedValue: 0,
		disabled: true,
		checked: false,
		autoEl: {
		    tag: 'div',
		    'data-qtip': gettext('Verify SSL certificate of the server'),
		},
	    },
	];

	me.callParent();
    },
    onGetValues: function(values) {
	let me = this;

	if (!values.verify) {
	    if (!me.isCreate) {
		Proxmox.Utils.assemble_field_data(values, { 'delete': 'verify' });
	    }
	    delete values.verify;
	}

	return me.callParent([values]);
    },
});
