Ext.define('PVE.form.ScsiHwSelector', {
    extend: 'PVE.form.KVComboBox',
    alias: ['widget.pveScsiHwSelector'],
  
    initComponent: function() {
	var me = this;

        me.data = [ 
	    ['', PVE.Utils.render_scsihw('')],
	    ['lsi', PVE.Utils.render_scsihw('lsi')],
	    ['lsi53c810', PVE.Utils.render_scsihw('lsi53c810')],
	    ['megasas', PVE.Utils.render_scsihw('megasas')],
	    ['virtio-scsi-pci', PVE.Utils.render_scsihw('virtio-scsi-pci')],
	    ['virtio-scsi-single', PVE.Utils.render_scsihw('virtio-scsi-single')],
	    ['pvscsi', PVE.Utils.render_scsihw('pvscsi')]
	];

	me.callParent();
    }
});
