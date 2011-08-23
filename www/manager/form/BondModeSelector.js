Ext.define('PVE.form.BondModeSelector', {
    extend: 'PVE.form.KVComboBox',
    alias: ['widget.bondModeSelector'],
  
    initComponent: function() {
	var me = this;

        me.data = [ 
	    ['balance-rr', 'balance-rr'], 
	    ['active-backup', 'active-backup'], 
	    ['balance-xor', 'balance-xor'], 
	    ['broadcast', 'broadcast'], 
	    ['802.3ad', '802.3ad'], 
	    ['balance-tlb', 'balance-tlb'], 
	    ['balance-alb', 'balance-alb']
	];
 
	me.callParent();
    }
});
