Ext.define('PVE.form.NetworkCardSelector', {
    extend: 'PVE.form.KVComboBox',
    alias: ['widget.PVE.form.NetworkCardSelector'],
  
    initComponent: function() {
	var me = this;

        me.data = [ 
	    ['e1000', 'Intel E1000'],
	    ['virtio', 'VirtIO (paravirtualized)'],
	    ['rtl8139', 'Realtec RTL8139']
	];
 
	me.callParent();
    }
});
