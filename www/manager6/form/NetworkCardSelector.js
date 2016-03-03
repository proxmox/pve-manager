Ext.define('PVE.form.NetworkCardSelector', {
    extend: 'PVE.form.KVComboBox',
    alias: ['widget.PVE.form.NetworkCardSelector'],
    comboItems: [
	['e1000', 'Intel E1000'],
	['virtio', 'VirtIO (' + gettext('paravirtualized') + ')'],
	['rtl8139', 'Realtek RTL8139'],
	['vmxnet3', 'VMWare vmxnet3']
    ]
});
