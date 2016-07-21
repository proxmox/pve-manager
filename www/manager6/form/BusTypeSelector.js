Ext.define('PVE.form.BusTypeSelector', {
    extend: 'PVE.form.KVComboBox',
    alias: 'widget.pveBusSelector',
  
    noVirtIO: false,

    noScsi: false,

    initComponent: function() {
	var me = this;

	me.comboItems = [['ide', 'IDE'], ['sata', 'SATA']];

	if (!me.noVirtIO) {
	    me.comboItems.push(['virtio', 'VirtIO']);
	}

	if (!me.noScsi) {
	    me.comboItems.push(['scsi', 'SCSI']);
	}

	me.callParent();
    }
});
