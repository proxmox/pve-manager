Ext.define('PVE.form.FirewallPolicySelector', {
    extend: 'PVE.form.KVComboBox',
    alias: ['widget.pveFirewallPolicySelector'],
  
    initComponent: function() {
	var me = this;

	me.data = [ 
	    ['ACCEPT', 'ACCEPT'], 
	    ['REJECT', 'REJECT'],
	    [ 'DROP', 'DROP']
	];

	me.callParent();
    }
});
