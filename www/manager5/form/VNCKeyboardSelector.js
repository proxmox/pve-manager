Ext.define('PVE.form.VNCKeyboardSelector', {
    extend: 'PVE.form.KVComboBox',
    alias: ['widget.VNCKeyboardSelector'],
    config: {
        comboItems: PVE.Utils.kvm_keymap_array()
    }
});
