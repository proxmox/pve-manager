Ext.define('PVE.QemuSummary', {
    extend: 'PVE.VMSummaryBase',
    alias: 'widget.pveQemuSummary',

    statics: {
	pathMatch: function(loc) {
	    return loc.match(/^nodes\/([^\s\/]+)\/qemu\/(\d+)$/);
	}
    },

    vmtype: 'qemu',

    config_keys: [
	'name', 'memory', 'sockets', 'cores', 'ostype', 'bootdisk', /^net\d+/,
	/^ide\d+/, /^virtio\d+/, /^sata\d+/, /^scsi\d+/, /^unused\d+/
    ],

    initialize: function() {
	var me = this;

	var match = me.self.pathMatch(me.getAppUrl());
	if (!match) {
	    throw "pathMatch failed";
	}

	me.nodename = match[1];
	me.vmid = match[2];

	me.down('titlebar').setTitle('VM: ' + me.vmid);

	this.callParent();
    }
});
