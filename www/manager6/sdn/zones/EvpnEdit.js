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

        return values;
    },

    initComponent : function() {
	var me = this;

        me.items = [
           {
            xtype: me.isCreate ? 'textfield' : 'displayfield',
            name: 'zone',
            maxLength: 8,
            value: me.zone || '',
            fieldLabel: 'ID',
            allowBlank: false
          },
	  {
	    xtype: 'proxmoxintegerfield',
	    name: 'vrf-vxlan',
	    minValue: 1,
	    maxValue: 16000000,
	    fieldLabel: 'VRF-VXLAN Tag',
	    allowBlank: false
	  },
	  {
	    xtype: 'pveSDNControllerSelector',
	    fieldLabel: gettext('Controller'),
	    name: 'controller',
	    value: '',
	    allowBlank: false
	  },
          {
            xtype: 'proxmoxintegerfield',
            name: 'mtu',
            minValue: 100,
            maxValue: 65000,
            fieldLabel: 'MTU',
            skipEmptyText: true,
            allowBlank: true,
            emptyText: 'auto'
          },
          {
            xtype: 'pveNodeSelector',
            name: 'nodes',
            fieldLabel: gettext('Nodes'),
            emptyText: gettext('All') + ' (' + gettext('No restrictions') +')',
            multiSelect: true,
            autoSelect: false
          },

	];

	me.callParent();
    }
});
