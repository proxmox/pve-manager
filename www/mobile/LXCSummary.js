Ext.define('PVE.LXCSummary', {
    extend: 'PVE.VMSummaryBase',
    alias: 'widget.pveLXCSummary',

    statics: {
	pathMatch: function(loc) {
	    return loc.match(/^nodes\/([^\s\/]+)\/lxc\/(\d+)$/);
	}
    },

    vmtype: 'lxc',

    config_keys: [
	'hostname','ostype', , 'memory', 'swap', 'cpulimit', 'cpuunits',
	/^net\d+/, 'rootfs', /^mp\d+/, 'nameserver', 'searchdomain','description'
    ],

    initialize: function() {
	var me = this;

	var match = me.self.pathMatch(me.getAppUrl());
	if (!match) {
	    throw "pathMatch failed";
	}

	me.nodename = match[1];
	me.vmid = match[2];

	me.down('titlebar').setTitle('CT: ' + me.vmid);

	this.callParent();
    }
});
