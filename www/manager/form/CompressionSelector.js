Ext.define('PVE.form.CompressionSelector', {
    extend: 'PVE.form.KVComboBox',
    alias: ['widget.pveCompressionSelector'],
  
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
	    ['host', 'host']
	];

	me.callParent();
    }
});
