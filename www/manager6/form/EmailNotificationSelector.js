Ext.define('PVE.form.EmailNotificationSelector', {
    extend: 'Proxmox.form.KVComboBox',
    alias: ['widget.pveEmailNotificationSelector'],
    comboItems: [
	['always', gettext('Notify always')],
	['failure', gettext('On failure only')],
    ],
});
