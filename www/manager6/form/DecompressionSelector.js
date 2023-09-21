Ext.define('PVE.form.DecompressionSelector', {
    extend: 'Proxmox.form.KVComboBox',
    alias: ['widget.pveDecompressionSelector'],
    config: {
	deleteEmpty: false,
    },
    comboItems: [
		['__default__', Proxmox.Utils.NoneText],
		['lzo', 'LZO'],
		['gz', 'GZIP'],
		['zst', 'ZSTD'],
    ],
});
