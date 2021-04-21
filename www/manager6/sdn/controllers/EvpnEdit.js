Ext.define('PVE.sdn.controllers.EvpnInputPanel', {
    extend: 'PVE.panel.SDNControllerBase',

    onlineHelp: 'pvesdn_controller_plugin_evpn',

    initComponent: function() {
	var me = this;

	me.items = [
	    {
		xtype: me.isCreate ? 'textfield' : 'displayfield',
		name: 'controller',
		maxLength: 8,
		value: me.controllerid || '',
		fieldLabel: 'ID',
		allowBlank: false,
	    },
	    {
		xtype: 'proxmoxintegerfield',
		name: 'asn',
		minValue: 1,
		maxValue: 4294967295,
		value: 65000,
		fieldLabel: 'ASN #',
		allowBlank: false,
	    },
	    {
		xtype: 'textfield',
		name: 'peers',
		fieldLabel: gettext('Peers'),
		allowBlank: false,
	    },
	];

	me.callParent();
    },
});
