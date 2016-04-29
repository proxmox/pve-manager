Ext.define('PVE.form.BondModeSelector', {
    extend: 'PVE.form.KVComboBox',
    alias: ['widget.bondModeSelector'],
  
    openvswitch: false,

    initComponent: function() {
	var me = this;

	if (me.openvswitch) {
           me.comboItems = [
	       ['active-backup', 'active-backup'],
	       ['balance-slb', 'balance-slb'],
	       ['lacp-balance-slb', 'LACP (balance-slb)'],
	       ['lacp-balance-tcp', 'LACP (balance-tcp)']
	   ];
	} else {
            me.comboItems = [
		['balance-rr', 'balance-rr'], 
		['active-backup', 'active-backup'], 
		['balance-xor', 'balance-xor'], 
		['broadcast', 'broadcast'], 
		['802.3ad', 'LACP (802.3ad)'], 
		['balance-tlb', 'balance-tlb'], 
		['balance-alb', 'balance-alb']
	    ];
	}
 
	me.callParent();
    }
});

Ext.define('PVE.form.BondPolicySelector', {
    extend: 'PVE.form.KVComboBox',
    alias: ['widget.bondPolicySelector'],
    comboItems: [
	    ['layer2', 'layer2'],
	    ['layer2+3', 'layer2+3'], 
	    ['layer3+4', 'layer3+4']
    ]
});

