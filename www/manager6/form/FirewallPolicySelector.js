Ext.define('PVE.form.FirewallPolicySelector', {
    extend: 'PVE.form.KVComboBox',
    alias: ['widget.pveFirewallPolicySelector'],
    comboItems: [
	    ['ACCEPT', 'ACCEPT'],
	    ['REJECT', 'REJECT'],
	    [ 'DROP', 'DROP']
	]
});
