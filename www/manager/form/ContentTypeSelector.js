Ext.define('PVE.form.ContentTypeSelector', {
    extend: 'PVE.form.KVComboBox',
    alias: ['widget.pveContentTypeSelector'],
  
    initComponent: function() {
	var me = this;

	me.data = [];

	var cts = ['images', 'iso', 'vztmpl', 'backup', 'rootdir'];
	Ext.Array.each(cts, function(ct) {
	    me.data.push([ct, PVE.Utils.format_content_types(ct)]);
	});

	me.callParent();
    }
});
