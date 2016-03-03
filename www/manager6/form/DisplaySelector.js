Ext.define('PVE.form.DisplaySelector', {
    extend: 'PVE.form.KVComboBox',
    alias: ['widget.DisplaySelector'],
    comboItems: PVE.Utils.kvm_vga_driver_array()
});
