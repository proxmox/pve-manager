Ext.define('PVE.form.VNCKeyboardSelector', {
    extend: 'PVE.form.KVComboBox',
    alias: ['widget.VNCKeyboardSelector'],
  
    initComponent: function() {
	var me = this;
	me.data = PVE.Utils.kvm_keymap_array();
	me.callParent();
    }
});
