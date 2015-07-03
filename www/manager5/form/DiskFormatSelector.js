Ext.define('PVE.form.DiskFormatSelector', {
    extend: 'PVE.form.KVComboBox',
    alias: ['widget.PVE.form.DiskFormatSelector'],
  
    initComponent: function() {
	var me = this;

        me.data = [ 
	    ['raw', gettext('Raw disk image') + ' (raw)'], 
	    ['qcow2', gettext('QEMU image format') + ' (qcow2)'],
	    ['vmdk', gettext('VMware image format') + ' (vmdk)']
	];

	me.callParent();
    }
});
