Ext.define('PVE.form.EmailNotificationSelector', {
    extend: 'PVE.form.KVComboBox',
    alias: ['widget.pveEmailNotificationSelector'],
    comboItems: [
                ['always', gettext('Always')],
                ['failure', gettext('On failure only')]
    ]
});
