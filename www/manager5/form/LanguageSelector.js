Ext.define('PVE.form.LanguageSelector', {
    extend: 'PVE.form.KVComboBox',
    alias: ['widget.pveLanguageSelector'],
    config: {
        comboItems: PVE.Utils.language_array()
    }
});
