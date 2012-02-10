Ext.define('PVE.form.CompressionSelector', {
    extend: 'PVE.form.KVComboBox',
    alias: ['widget.pveCompressionSelector'],
  
    initComponent: function() {
	var me = this;

        me.data = [ 
	    ['', 'none'],
	    ['lzo', 'LZO (fast)'],
	    ['gzip', 'GZIP (good)']
	];

	me.callParent();
    }
});
