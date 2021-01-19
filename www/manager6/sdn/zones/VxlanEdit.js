Ext.define('PVE.sdn.zones.VxlanInputPanel', {
    extend: 'PVE.panel.SDNZoneBase',

    onlineHelp: 'pvesdn_zone_plugin_vxlan',

    onGetValues: function(values) {
        var me = this;

        if (me.isCreate) {
            values.type = me.type;
        } else {
            delete values.zone;
        }

	delete values.mode;

        return values;
    },

    initComponent: function() {
	var me = this;

        me.items = [
           {
            xtype: me.isCreate ? 'textfield' : 'displayfield',
	    maxLength: 8,
            name: 'zone',
            value: me.zone || '',
            fieldLabel: 'ID',
            allowBlank: false,
          },
	  {
	    xtype: 'textfield',
	    name: 'peers',
	    fieldLabel: gettext('Peer Address List'),
	    allowBlank: false,
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
