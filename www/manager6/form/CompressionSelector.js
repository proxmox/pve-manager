Ext.define('PVE.form.CompressionSelector', {
    extend: 'PVE.form.KVComboBox',
    alias: ['widget.pveCompressionSelector'],
    comboItems: [
                ['__default__', PVE.Utils.noneText],
                ['lzo', 'LZO (' + gettext('fast') + ')'],
                ['gzip', 'GZIP (' + gettext('good') + ')']
    ]
});
