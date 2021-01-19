Ext.define('PVE.form.VNCKeyboardSelector', {
    extend: 'Proxmox.form.KVComboBox',
    alias: ['widget.VNCKeyboardSelector'],
    comboItems: PVE.Utils.kvm_keymap_array(),
});
