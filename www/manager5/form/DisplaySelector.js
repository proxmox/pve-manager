Ext.define('PVE.form.DisplaySelector', {
    extend: 'PVE.form.KVComboBox',
    alias: ['widget.DisplaySelector'],
  
    initComponent: function() {
	var me = this;

	me.data = PVE.Utils.kvm_vga_driver_array();
	me.callParent();
    }
});
