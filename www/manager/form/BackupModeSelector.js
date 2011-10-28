Ext.define('PVE.form.BackupModeSelector', {
    extend: 'PVE.form.KVComboBox',
    alias: ['widget.pveBackupModeSelector'],
  
    initComponent: function() {
	var me = this;

	me.data = [
	    ['snapshot', 'Snapshot'],
	    ['suspend', 'Suspend'],
	    ['stop', 'Stop']
	];

	me.callParent();
    }
});
