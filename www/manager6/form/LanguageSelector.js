Ext.define('PVE.form.LanguageSelector', {
    extend: 'PVE.form.KVComboBox',
    alias: ['widget.pveLanguageSelector'],
    comboItems: Proxmox.Utils.language_array()
});
