Ext.define('PVE.form.BusTypeSelector', {
    extend: 'Proxmox.form.KVComboBox',
    alias: 'widget.pveBusSelector',

    noVirtIO: false,
    withUnused: false,

    initComponent: function() {
	var me = this;

	me.comboItems = [['ide', 'IDE'], ['sata', 'SATA']];

	if (!me.noVirtIO) {
	    me.comboItems.push(['virtio', 'VirtIO Block']);
	}

	me.comboItems.push(['scsi', 'SCSI']);

	if (me.withUnused) {
	    me.comboItems.push(['unused', 'Unused']);
	}

	me.callParent();
    },
});
