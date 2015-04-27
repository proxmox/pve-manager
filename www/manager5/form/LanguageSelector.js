Ext.define('PVE.form.LanguageSelector', {
    extend: 'PVE.form.KVComboBox',
    alias: ['widget.pveLanguageSelector'],
  
    initComponent: function() {
	var me = this;
	me.data = PVE.Utils.language_array();
	me.callParent();
    }
});
