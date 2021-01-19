Ext.define('PVE.qemu.CmdMenu', {
    extend: 'Ext.menu.Menu',

    showSeparator: false,
    initComponent: function() {
	var me = this;

	var nodename = me.pveSelNode.data.node;
	if (!nodename) {
	    throw "no node name specified";
	}

	var vmid = me.pveSelNode.data.vmid;
	if (!vmid) {
	    throw "no VM ID specified";
	}

	var vmname = me.pveSelNode.data.name;

	var vm_command = function(cmd, params) {
	    Proxmox.Utils.API2Request({
		params: params,
		url: '/nodes/' + nodename + '/qemu/' + vmid + "/status/" + cmd,
		method: 'POST',
		failure: function(response, opts) {
		    Ext.Msg.alert('Error', response.htmlStatus);
		},
	    });
	};

	var caps = Ext.state.Manager.get('GuiCap');

	var running = false;
	var stopped = true;
	var suspended = false;
	var standalone = PVE.data.ResourceStore.getNodes().length < 2;

	switch (me.pveSelNode.data.status) {
	    case 'running':
		running = true;
		stopped = false;
		break;
	    case 'suspended':
		stopped = false;
		suspended = true;
		break;
	    case 'paused':
		stopped = false;
		suspended = true;
		break;
	    default: break;
	}

	me.title = "VM " + vmid;

	me.items = [
	    {
		text: gettext('Start'),
		iconCls: 'fa fa-fw fa-play',
		hidden: running || suspended,
		disabled: running || suspended,
		handler: function() {
		    vm_command('start');
		},
	    },
	    {
		text: gettext('Pause'),
		iconCls: 'fa fa-fw fa-pause',
		hidden: stopped || suspended,
		disabled: stopped || suspended,
		handler: function() {
		    var msg = Proxmox.Utils.format_task_description('qmpause', vmid);
		    Ext.Msg.confirm(gettext('Confirm'), msg, function(btn) {
			if (btn !== 'yes') {
			    return;
			}
			vm_command('suspend');
		    });
		},
	    },
	    {
		text: gettext('Hibernate'),
		iconCls: 'fa fa-fw fa-download',
		hidden: stopped || suspended,
		disabled: stopped || suspended,
		tooltip: gettext('Suspend to disk'),
		handler: function() {
		    var msg = Proxmox.Utils.format_task_description('qmsuspend', vmid);
		    Ext.Msg.confirm(gettext('Confirm'), msg, function(btn) {
			if (btn !== 'yes') {
			    return;
			}
			vm_command('suspend', { todisk: 1 });
		    });
		},
	    },
	    {
		text: gettext('Resume'),
		iconCls: 'fa fa-fw fa-play',
		hidden: !suspended,
		handler: function() {
		    vm_command('resume');
		},
	    },
	    {
		text: gettext('Shutdown'),
		iconCls: 'fa fa-fw fa-power-off',
		disabled: stopped || suspended,
		handler: function() {
		    var msg = Proxmox.Utils.format_task_description('qmshutdown', vmid);
		    Ext.Msg.confirm(gettext('Confirm'), msg, function(btn) {
			if (btn !== 'yes') {
			    return;
			}

			vm_command('shutdown');
		    });
		},
	    },
	    {
		text: gettext('Stop'),
		iconCls: 'fa fa-fw fa-stop',
		disabled: stopped,
		tooltip: Ext.String.format(gettext('Stop {0} immediately'), 'VM'),
		handler: function() {
		    var msg = Proxmox.Utils.format_task_description('qmstop', vmid);
		    Ext.Msg.confirm(gettext('Confirm'), msg, function(btn) {
			if (btn !== 'yes') {
			    return;
			}

			vm_command("stop");
		    });
		},
	    },
	    {
		text: gettext('Reboot'),
		iconCls: 'fa fa-fw fa-refresh',
		disabled: stopped,
		tooltip: Ext.String.format(gettext('Reboot {0}'), 'VM'),
		handler: function() {
		    var msg = Proxmox.Utils.format_task_description('qmreboot', vmid);
		    Ext.Msg.confirm(gettext('Confirm'), msg, function(btn) {
			if (btn !== 'yes') {
			    return;
			}

			vm_command("reboot");
		    });
		},
	    },
	    {
		xtype: 'menuseparator',
		hidden: (standalone || !caps.vms['VM.Migrate']) && !caps.vms['VM.Allocate'] && !caps.vms['VM.Clone'],
	    },
	    {
		text: gettext('Migrate'),
		iconCls: 'fa fa-fw fa-send-o',
		hidden: standalone || !caps.vms['VM.Migrate'],
		handler: function() {
		    var win = Ext.create('PVE.window.Migrate', {
			vmtype: 'qemu',
			nodename: nodename,
			vmid: vmid,
		    });
		    win.show();
		},
	    },
	    {
		text: gettext('Clone'),
		iconCls: 'fa fa-fw fa-clone',
		hidden: !caps.vms['VM.Clone'],
		handler: function() {
		    PVE.window.Clone.wrap(nodename, vmid, me.isTemplate, 'qemu');
		},
	    },
	    {
		text: gettext('Convert to template'),
		iconCls: 'fa fa-fw fa-file-o',
		hidden: !caps.vms['VM.Allocate'],
		handler: function() {
		    var msg = Proxmox.Utils.format_task_description('qmtemplate', vmid);
		    Ext.Msg.confirm(gettext('Confirm'), msg, function(btn) {
			if (btn !== 'yes') {
			    return;
			}

			Proxmox.Utils.API2Request({
			     url: '/nodes/' + nodename + '/qemu/' + vmid + '/template',
			     method: 'POST',
			     failure: function(response, opts) {
				Ext.Msg.alert('Error', response.htmlStatus);
			     },
			});
		    });
		},
	    },
	    { xtype: 'menuseparator' },
	    {
		text: gettext('Console'),
		iconCls: 'fa fa-fw fa-terminal',
		handler: function() {
		    Proxmox.Utils.API2Request({
			url: '/nodes/' + nodename + '/qemu/' + vmid + '/status/current',
			failure: function(response, opts) {
			    Ext.Msg.alert('Error', response.htmlStatus);
			},
			success: function(response, opts) {
			    var allowSpice = response.result.data.spice;
			    var allowXtermjs = response.result.data.serial;
			    var consoles = {
				spice: allowSpice,
				xtermjs: allowXtermjs,
			    };
			    PVE.Utils.openDefaultConsoleWindow(consoles, 'kvm', vmid, nodename, vmname);
			},
		    });
		},
	    },
	];

	me.callParent();
    },
});
