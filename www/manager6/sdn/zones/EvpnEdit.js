Ext.define('PVE.sdn.zones.EvpnInputPanel', {
    extend: 'PVE.panel.SDNZoneBase',

    onlineHelp: 'pvesdn_zone_plugin_evpn',

    onGetValues: function(values) {
	var me = this;

	if (me.isCreate) {
	    values.type = me.type;
	} else {
	    delete values.zone;
	}

        if (!values.mac) {
            delete values.mac;
        }

        if (values['advertise-subnets'] === 0) {
            delete values['advertise-subnets'];
        }

        if (values['exitnodes-local-routing'] === 0) {
            delete values['exitnodes-local-routing'];
        }

        if (values['disable-arp-nd-suppression'] === 0) {
            delete values['disable-arp-nd-suppression'];
        }

	return values;
    },

    initComponent: function() {
	var me = this;

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
		xtype: 'pveSDNControllerSelector',
		fieldLabel: gettext('Controller'),
		name: 'controller',
		value: '',
		allowBlank: false,
	    },
	    {
		xtype: 'proxmoxintegerfield',
		name: 'vrf-vxlan',
		minValue: 1,
		maxValue: 16000000,
		fieldLabel: 'VRF-VXLAN Tag',
		allowBlank: false,
	    },
	    {
		xtype: 'textfield',
		name: 'mac',
		fieldLabel: gettext('Vnet MAC address'),
		vtype: 'MacAddress',
		allowBlank: true,
		emptyText: 'auto',
	    },
	    {
		xtype: 'pveNodeSelector',
		name: 'exitnodes',
		fieldLabel: gettext('Exit Nodes'),
		multiSelect: true,
		autoSelect: false,
	    },
	    {
		xtype: 'pveNodeSelector',
		name: 'exitnodes-primary',
		fieldLabel: gettext('Primary Exit Node'),
		multiSelect: false,
		autoSelect: false,
	    },
	    {
		xtype: 'proxmoxcheckbox',
		name: 'exitnodes-local-routing',
		uncheckedValue: 0,
		checked: false,
		fieldLabel: gettext('Exit Nodes local routing'),
	    },
	    {
		xtype: 'proxmoxcheckbox',
		name: 'advertise-subnets',
		uncheckedValue: 0,
		checked: false,
		fieldLabel: gettext('Advertise subnets'),
	    },
	    {
		xtype: 'proxmoxcheckbox',
		name: 'disable-arp-nd-suppression',
		uncheckedValue: 0,
		checked: false,
		fieldLabel: gettext('Disable arp-nd suppression'),
	    },
	    {
		xtype: 'textfield',
		name: 'rt-import',
		fieldLabel: gettext('Route-target import'),
		allowBlank: true,
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
