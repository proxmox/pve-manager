Ext.define('PVE.form.BondModeSelector', {
    extend: 'PVE.form.KVComboBox',
    alias: ['widget.bondModeSelector'],
  
    openvswitch: false,

    initComponent: function() {
	var me = this;

	if (me.openvswitch) {
           me.data = [ 
	       ['balance-tcp', 'balance-tcp'],
	       ['balance-slb', 'balance-slb'],
	       ['active-backup', 'active-backup'] 
	   ];
	} else {
            me.data = [ 
		['balance-rr', 'balance-rr'], 
		['active-backup', 'active-backup'], 
		['balance-xor', 'balance-xor'], 
		['broadcast', 'broadcast'], 
		['802.3ad', '802.3ad'], 
		['balance-tlb', 'balance-tlb'], 
		['balance-alb', 'balance-alb']
	    ];
	}
 
	me.callParent();
    }
});
