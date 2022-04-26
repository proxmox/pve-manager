Ext.define('PVE.form.VNCKeyboardSelector', {
    extend: 'Proxmox.form.KVComboBox',
    alias: ['widget.VNCKeyboardSelector'],
    comboItems: Object.entries(PVE.Utils.kvm_keymaps),
});
