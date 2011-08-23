Ext.define('PVE.form.ContentTypeSelector', {
    extend: 'PVE.form.KVComboBox',
    alias: ['widget.pveContentTypeSelector'],
  
    initComponent: function() {
	var me = this;

	me.data = [
	    ['images', 'Images'],
	    ['iso', 'ISO'],
	    ['vztmpl', 'Templates'],
	    ['backup', 'Backups']
	];

	me.callParent();
    }
});
