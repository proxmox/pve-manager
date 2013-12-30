Ext.define('PVE.form.BondModeSelector', {
    extend: 'PVE.form.KVComboBox',
    alias: ['widget.bondModeSelector'],
  
    openvswitch: false,

    initComponent: function() {
	var me = this;

	if (me.openvswitch) {
           me.data = [ 
	       ['active-backup', 'active-backup'],
	       ['balance-slb', 'balance-slb'],
	       ['lacp-balance-slb', 'LACP (balance-slb)'],
	       ['lacp-balance-tcp', 'LACP (balance-tcp)']
	   ];
	} else {
            me.data = [ 
		['balance-rr', 'balance-rr'], 
		['active-backup', 'active-backup'], 
		['balance-xor', 'balance-xor'], 
		['broadcast', 'broadcast'], 
		['802.3ad', 'LACP (layer2)'], 
		['balance-tlb', 'balance-tlb'], 
		['balance-alb', 'balance-alb']
	    ];
	}
 
	me.callParent();
    }
});
