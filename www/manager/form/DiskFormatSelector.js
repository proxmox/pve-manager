Ext.define('PVE.form.DiskFormatSelector', {
    extend: 'PVE.form.KVComboBox',
    alias: ['widget.PVE.form.DiskFormatSelector'],
  
    initComponent: function() {
	var me = this;

        me.data = [ 
	    ['raw', 'Raw disk image (raw)'], 
	    ['qcow2', 'QEMU image format (qcow2)'],
	    ['vmdk', 'VMware image format (vmdk)']
	];

	me.callParent();
    }
});
