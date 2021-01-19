Ext.define('PVE.sdn.zones.QinQInputPanel', {
    extend: 'PVE.panel.SDNZoneBase',

    onlineHelp: 'pvesdn_zone_plugin_qinq',

    onGetValues: function(values) {
	let me = this;

	if (me.isCreate) {
	    values.type = me.type;
	} else {
	    delete values.sdn;
	}

	return values;
    },

    initComponent: function() {
	let me = this;

	me.items = [
	    {
		xtype: me.isCreate ? 'textfield' : 'displayfield',
		name: 'zone',
		maxLength: 8,
		value: me.zone || '',
		fieldLabel: 'ID',
		allowBlank: false,
	    },
	    {
		xtype: 'textfield',
		name: 'bridge',
		fieldLabel: 'Bridge',
		allowBlank: false,
	    },
	    {
		xtype: 'proxmoxintegerfield',
		name: 'tag',
		minValue: 0,
		maxValue: 4096,
		fieldLabel: gettext('Service VLAN'),
		allowBlank: false,
	    },
	    {
		xtype: 'proxmoxKVComboBox',
		name: 'vlan-protocol',
		fieldLabel: gettext('Service-VLAN Protocol'),
		allowBlank: true,
		value: '802.1q',
		comboItems: [
		    ['802.1q', '802.1q'],
		    ['802.1ad', '802.1ad'],
		],
	    },
	    {
		xtype: 'proxmoxintegerfield',
		name: 'mtu',
		minValue: 100,
		maxValue: 65000,
		fieldLabel: 'MTU',
		skipEmptyText: true,
		allowBlank: true,
		emptyText: 'auto',
	    },
	    {
		xtype: 'pveNodeSelector',
		name: 'nodes',
		fieldLabel: gettext('Nodes'),
		emptyText: gettext('All') + ' (' + gettext('No restrictions') +')',
		multiSelect: true,
		autoSelect: false,
	    },
	];

	me.callParent();
    },
});
