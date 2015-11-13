Ext.define('PVE.form.BackupModeSelector', {
    extend: 'PVE.form.KVComboBox',
    alias: ['widget.pveBackupModeSelector'],
    comboItems: [
                ['snapshot', gettext('Snapshot')],
                ['suspend', gettext('Suspend')],
                ['stop', gettext('Stop')]
    ]
});
