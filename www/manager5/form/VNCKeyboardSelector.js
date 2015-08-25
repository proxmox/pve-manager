Ext.define('PVE.form.VNCKeyboardSelector', {
    extend: 'PVE.form.KVComboBox',
    alias: ['widget.VNCKeyboardSelector'],
    comboItems: PVE.Utils.kvm_keymap_array()
});
