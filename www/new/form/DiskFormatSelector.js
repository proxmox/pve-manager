Ext.define('PVE.form.DiskFormatSelector', {
    extend: 'Ext.form.field.ComboBox',
    alias: ['widget.PVE.form.DiskFormatSelector'],
  
    initComponent: function() {
	var me = this;

	var store = Ext.create('Ext.data.ArrayStore', {
	    model: 'KeyValue',
            data : [ 
		['raw', 'Raw disk image (raw)'], 
		['qcow2', 'QEMU image format (qcow2)'],
		['vmdk', 'VMware image format (vmdk)']
	    ]
        });

	Ext.apply(me, {
	    store: store,
	    queryMode: 'local',
	    editable: false,
	    displayField: 'value',
	    valueField: 'key'
	});

	me.callParent();
    }
});
