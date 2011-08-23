Ext.define('PVE.form.NetworkCardSelector', {
    extend: 'Ext.form.field.ComboBox',
    alias: ['widget.PVE.form.NetworkCardSelector'],
  
    initComponent: function() {
	var me = this;

	var store = Ext.create('Ext.data.ArrayStore', {
	    model: 'KeyValue',
            data : [ 
		['rtl8139', 'Realtec RTL8139'], 
		['e1000', 'Intel E1000'],
		['virtio', 'VirtIO (paravirtualized)']
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
