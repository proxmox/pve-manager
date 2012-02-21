Ext.define('PVE.form.CPUModelSelector', {
    extend: 'PVE.form.KVComboBox',
    alias: ['widget.CPUModelSelector'],
  
    initComponent: function() {
	var me = this;

        me.data = [ 
	    ['', 'Default (qemu64)'],
	    ['486', '486'],
	    ['athlon', 'athlon'],
	    ['core2duo', 'core2duo'],
	    ['coreduo', 'coreduo'],
	    ['kvm32', 'kvm32'],
	    ['kvm64', 'kvm64'],
	    ['pentium', 'pentium'],
	    ['pentium2', 'pentium2'],
	    ['pentium3', 'pentium3'],
	    ['phenom', 'phenom'],
	    ['qemu32', 'qemu32'],
	    ['qemu64', 'qemu64'],
	    ['cpu64-rhel6', 'cpu64-rhel6'],
	    ['cpu64-rhel5', 'cpu64-rhel5'],
	    ['Conroe', 'Conroe'],
	    ['Penryn', 'Penryn'],
	    ['Nehalem', 'Nehalem'],
	    ['Westmere', 'Westmere'],
	    ['Opteron_G1', 'Opteron_G1'],
	    ['Opteron_G2', 'Opteron_G2'],
	    ['Opteron_G3', 'Opteron_G3'],
	    ['host', 'host']
	];

	me.callParent();
    }
});
