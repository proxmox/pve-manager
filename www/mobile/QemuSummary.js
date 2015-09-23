Ext.define('PVE.QemuSummary', {
    extend: 'PVE.Page',
    alias: 'widget.pveQemuSummary',

    statics: {
	pathMatch: function(loc) {
	    return loc.match(/^nodes\/([^\s\/]+)\/qemu\/(\d+)$/);
	}
    },

    nodename: undefined,
    vmid: undefined,

    vm_command: function(cmd, params) {
	var me = this;

	PVE.Utils.API2Request({
	    params: params,
	    url: '/nodes/' + me.nodename + '/qemu/' + me.vmid + '/status/' + cmd,
	    method: 'POST',
	    success: function(response, opts) {
		var upid = response.result.data;
		var page = 'nodes/'  + me.nodename + '/tasks/' + upid;
		PVE.Workspace.gotoPage(page);
	    },
	    failure: function(response, opts) {
		Ext.Msg.alert('Error', response.htmlStatus);
	    }
	});
    },

    config: {
	items: [
	    { 
		xtype: 'pveTitleBar'
	    },
	    {
		xtype: 'component',
		itemId: 'vmstatus',
		styleHtmlContent: true,
		style: 'background-color:white;',
		tpl: [
		    '<table style="margin-bottom:0px;">',
		    '<tr><td>Status:</td><td>{qmpstatus}</td></tr>',
		    '<tr><td>Memory:</td><td>{[this.meminfo(values)]}</td></tr>',
		    '<tr><td>CPU:</td><td>{[this.cpuinfo(values)]}</td></tr>',
		    '<tr><td>Uptime:</td><td>{[PVE.Utils.format_duration_long(values.uptime)]}</td></tr>',
		    '</table>',
		    {
			meminfo: function(values) {
			    if (!Ext.isDefined(values.mem)) {
				return '-';
			    }
			    return PVE.Utils.format_size(values.mem || 0) + " of " + 
				PVE.Utils.format_size(values.maxmem);
			},
			cpuinfo: function(values) {
			    if (!Ext.isDefined(values.cpu)) {
				return '-';
			    }
			    var per = values.cpu * 100;
			    return per.toFixed(2) + "% (" + values.cpus + " CPUs)";
			}
		    }
		]
	    },
	    {
		xtype: 'component',
		cls: 'dark',
 		padding: 5,
		html: gettext('Configuration')
	    },
	    {
                xtype: 'container',
		scrollable: 'both',
		flex: 1,
		styleHtmlContent: true,
		itemId: 'vmconfig',
		style: 'background-color:white;white-space:pre',
		tpl: [
		    '<table style="margin-bottom:0px;">',
		    '<tpl for=".">',
		    '<tr><td>{key}</td><td>{value}</td></tr>',
		    '</tpl>',
		    '</table>'
		]
	    }
   	]
    },

    reload: function() {
 	var me = this;

	var vmi = me.down('#vmstatus');

	var error_handler = function(response) {
	    me.setMasked({ xtype: 'loadmask', message: response.htmlStatus} );
	};

	PVE.Utils.API2Request({
	    url: '/nodes/' + me.nodename + '/qemu/' + me.vmid + '/status/current',
	    method: 'GET',
	    success: function(response) {
		var d = response.result.data;
		vmi.setData(d);
	    },
	    failure: error_handler
	});

	var vmc = me.down('#vmconfig');

	PVE.Utils.API2Request({
	    url: '/nodes/' + me.nodename + '/qemu/' + me.vmid + '/config',
	    method: 'GET',
	    success: function(response) {
		var d = response.result.data;
		var names = ['name', 'memory', 'sockets', 'cores', 'ostype',
			     'bootdisk', /^net\d+/, 
			     /^ide\d+/, /^virtio\d+/, /^sata\d+/, 
			     /^scsi\d+/, /^unused\d+/ ];
		var kv = PVE.Workspace.obj_to_kv(d, names);
		vmc.setData(kv);
	    },
	    failure: error_handler
	});
    },

    initialize: function() {
	var me = this;

	var match = me.self.pathMatch(me.getAppUrl());
	if (!match) {
	    throw "pathMatch failed";
	}

	me.nodename = match[1];
	me.vmid = match[2];

	me.down('titlebar').setTitle('VM: ' + me.vmid);

	me.down('pveMenuButton').setMenuItems([
	    {
		text: gettext('Start'),
		handler: function() {
		    me.vm_command("start", {});
		}
	    },
	    { 
		text: gettext('Suspend'),
		handler: function() {
		    me.vm_command("suspend", {});
		}
	    },
	    { 
		text: gettext('Resume'),
		handler: function() {
		    me.vm_command("resume", {});
		}
	    },
	    { 
		text: gettext('Shutdown'),
		handler: function() {
		    me.vm_command("shutdown", {});
		}
	    },
	    { 
		text: gettext('Stop'),
		handler: function() {
		    me.vm_command("stop", {});
		}
	    },
	    { 
		text: gettext('Migrate'),
		handler: function() {
		    PVE.Workspace.gotoPage('nodes/' + me.nodename + '/qemu/' + me.vmid + '/migrate'); 
		}
	    },
	    { 
		text: gettext('Console'),
		handler: function() {
		    PVE.Utils.openConsoleWindow('html5', 'kvm', me.vmid, me.nodename);
		}
	    },
	    { 
		text: gettext('Spice'),
		handler: function() {
		    PVE.Utils.openConsoleWindow('vv', 'kvm', me.vmid, me.nodename);
		}
	    }
	]);

	me.reload();

	this.callParent();
    }
});
