Ext.define('PVE.sdn.controllers.EvpnInputPanel', {
    extend: 'PVE.panel.SDNControllerBase',

    initComponent : function() {
	var me = this;

        me.items = [
           {
            xtype: me.isCreate ? 'textfield' : 'displayfield',
            name: 'controller',
	    maxLength: 10,
            value: me.controllerid || '',
            fieldLabel: 'ID',
            allowBlank: false
          },
	  {
	    xtype: 'proxmoxintegerfield',
	    name: 'asn',
	    minValue: 1,
	    maxValue: 4294967295,
	    value: 65000,
	    fieldLabel: gettext('asn'),
	    allowBlank: false
	  },
	  {
	    xtype: 'textfield',
	    name: 'peers',
	    fieldLabel: gettext('peers'),
	    allowBlank: false
	  },
	  {
	    xtype: 'textfield',
	    name: 'gateway-external-peers',
	    fieldLabel: gettext('gateway-external-peers'),
	    allowBlank: true
	  },
          {
            xtype: 'pveNodeSelector',
            name: 'gateway-nodes',
            fieldLabel: gettext('Gateway nodes'),
            multiSelect: true,
            autoSelect: false
          },
	];

	me.callParent();
    }
});
