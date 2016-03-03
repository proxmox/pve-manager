Ext.define('PVE.form.DiskFormatSelector', {
    extend: 'PVE.form.KVComboBox',
    alias: ['widget.PVE.form.DiskFormatSelector'],
    comboItems:  [
	['raw', gettext('Raw disk image') + ' (raw)'],
	['qcow2', gettext('QEMU image format') + ' (qcow2)'],
	['vmdk', gettext('VMware image format') + ' (vmdk)']
    ]
});
