Ext.define('PVE.VMSummaryBase', {
    extend: 'PVE.Page',

    nodename: undefined,
    vmid: undefined,
    vmtype: undefined, // qemu or lxc

    // defines the key/value config keys do display
    config_keys: undefined,

    vm_command: function(cmd, params) {
	var me = this;

	PVE.Utils.API2Request({
	    params: params,
	    url: '/nodes/' + me.nodename + '/' + me.vmtype + '/' + me.vmid +
		 '/status/' + cmd,
	    method: 'POST',
	    success: function(response, opts) {
		var upid = response.result.data;
		var page = 'nodes/' + me.nodename + '/tasks/' + upid;
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
		    '<tr><td>Status:</td><td>{[this.status(values)]}</td></tr>',
		    '<tr><td>Memory:</td><td>{[this.meminfo(values)]}</td></tr>',
		    '<tr><td>CPU:</td><td>{[this.cpuinfo(values)]}</td></tr>',
		    '<tr><td>Uptime:</td><td>{[PVE.Utils.format_duration_long' +
			'(values.uptime)]}</td></tr>',
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
			},
			status: function(values) {
			    return values.qmpstatus ? values.qmpstatus :
				values.status;
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

	var vm_stat = me.down('#vmstatus');

	var error_handler = function(response) {
	    me.setMasked({ xtype: 'loadmask', message: response.htmlStatus });
	};

	PVE.Utils.API2Request({
	    url: '/nodes/' + me.nodename + '/' + me.vmtype + '/' + me.vmid +
		 '/status/current',
	    method: 'GET',
	    success: function(response) {
		var d = response.result.data;

		me.render_menu(d);

		vm_stat.setData(d);
	    },
	    failure: error_handler
	});

	var vm_cfg = me.down('#vmconfig');

	PVE.Utils.API2Request({
	    url: '/nodes/' + me.nodename + '/' + me.vmtype + '/' + me.vmid +
		 '/config',
	    method: 'GET',
	    success: function(response) {
		var d = response.result.data;
		var kv = PVE.Workspace.obj_to_kv(d, me.config_keys);
		vm_cfg.setData(kv);
	    },
	    failure: error_handler
	});
    },

    render_menu: function(data) {
	var me = this;

	// use two item arrays for format reasons.
	// display start, stop and migrate by default
	var top_items = [
	    {
		text: gettext('Start'),
		handler: function() {
		    me.vm_command("start", {});
		}
	    },
	    {
		text: gettext('Stop'),
		handler: function() {
		    me.vm_command("stop", {});
		}
	    }
	];

	var bottom_items = [{
	    text: gettext('Migrate'),
	    handler: function() {
		PVE.Workspace.gotoPage('nodes/' + me.nodename + '/' + me.vmtype +
				       '/' + me.vmid +'/migrate');
	    }
	}];

	// use qmpstatus with qemu, as it's exacter
	var vm_status = (me.vmtype === 'qemu') ? data.qmpstatus : data.status;

	if(vm_status === 'running') {

	    top_items.push(
		{
		    text: gettext('Shutdown'),
		    handler: function() {
			me.vm_command("shutdown", {});
		    }
		},
		{
		    text: gettext('Suspend'),
		    handler: function() {
			me.vm_command("suspend", {});
		    }
		}
	    );

	    bottom_items.push({
		text: gettext('Console'),
		handler: function() {
		    var vmtype = me.vmtype === 'qemu' ? 'kvm' : me.vmtype;
		    PVE.Utils.openConsoleWindow('html5', vmtype, me.vmid,
						me.nodename);
		}
	    });

	    if(data.spice || me.vmtype==='lxc') {
		bottom_items.push({
		    text: gettext('Spice'),
		    handler: function() {
			var vmtype = me.vmtype === 'qemu' ? 'kvm' : me.vmtype;
			PVE.Utils.openConsoleWindow('vv', vmtype, me.vmid,
						    me.nodename);
		    }
		});
	    }

	} else if(vm_status === 'paused') {
	    top_items.push({
		text: gettext('Resume'),
		handler: function() {
		    me.vm_command("resume", {});
		}
	    });
	}

	// concat our item arrays and add them to the menu
	me.down('pveMenuButton').setMenuItems(top_items.concat(bottom_items));

    },

    initialize: function() {
	var me = this;

	me.reload();

	this.callParent();
    }
});
