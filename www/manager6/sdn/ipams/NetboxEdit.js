Ext.define('PVE.sdn.ipams.NetboxInputPanel', {
    extend: 'PVE.panel.SDNIpamBase',

    onlineHelp: 'pvesdn_ipam_plugin_netbox',

    onGetValues: function(values) {
        var me = this;

	if (me.isCreate) {
	    values.type = me.type;
	} else {
	    delete values.ipam;
	}

	return values;
    },

    initComponent: function() {
	var me = this;

	me.items = [
	    {
		xtype: me.isCreate ? 'textfield' : 'displayfield',
		name: 'ipam',
		maxLength: 10,
		value: me.zone || '',
		fieldLabel: 'ID',
		allowBlank: false,
	    },
	    {
		xtype: 'textfield',
		name: 'url',
		fieldLabel: gettext('Url'),
		allowBlank: false,
	    },
	    {
		xtype: 'textfield',
		name: 'token',
		fieldLabel: gettext('Token'),
		allowBlank: false,
	    },
	];

	me.callParent();
    },
});
