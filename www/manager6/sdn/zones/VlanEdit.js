Ext.define('PVE.sdn.zones.VlanInputPanel', {
    extend: 'PVE.panel.SDNZoneBase',

    onlineHelp: 'pvesdn_zone_plugin_vlan',

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
            maxLength: 10,
            value: me.zone || '',
            fieldLabel: 'ID',
            allowBlank: false
          },
          {
            xtype: 'textfield',
            name: 'bridge',
            fieldLabel: 'Bridge',
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
