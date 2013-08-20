Ext.define('PVE.form.BackupModeSelector', {
    extend: 'PVE.form.KVComboBox',
    alias: ['widget.pveBackupModeSelector'],
  
    initComponent: function() {
	var me = this;

	me.data = [
	    ['snapshot', gettext('Snapshot')],
	    ['suspend', gettext('Suspend')],
	    ['stop', gettext('Stop')]
	];

	me.callParent();
    }
});
