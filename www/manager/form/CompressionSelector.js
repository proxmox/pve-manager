Ext.define('PVE.form.CompressionSelector', {
    extend: 'PVE.form.KVComboBox',
    alias: ['widget.pveCompressionSelector'],
  
    initComponent: function() {
	var me = this;

        me.data = [ 
	    ['', gettext('none')],
	    ['lzo', 'LZO (' + gettext('fast') + ')'],
	    ['gzip', 'GZIP (' + gettext('good') + ')']
	];

	me.callParent();
    }
});
