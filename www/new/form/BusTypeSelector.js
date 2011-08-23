Ext.define('PVE.form.BusTypeSelector', {
    extend: 'Ext.form.field.ComboBox',
    alias: ['widget.PVE.form.BusTypeSelector'],
  
    initComponent: function() {
	var me = this;

	var store = Ext.create('Ext.data.ArrayStore', {
	    model: 'KeyValue',
            data : [ 
		['ide', 'IDE'], 
		['virtio', 'VIRTIO'],
		['scsi', 'SCSI']
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
