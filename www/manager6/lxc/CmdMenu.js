Ext.define('PVE.lxc.CmdMenu', {
    extend: 'Ext.menu.Menu',

    showSeparator: false,
    initComponent: function() {
	let me = this;

	let info = me.pveSelNode.data;
	if (!info.node) {
	    throw "no node name specified";
	}
	if (!info.vmid) {
	    throw "no CT ID specified";
	}

	let vm_command = function(cmd, params) {
	    Proxmox.Utils.API2Request({
		params: params,
		url: `/nodes/${info.node}/${info.type}/${info.vmid}/status/${cmd}`,
		method: 'POST',
		failure: (response, opts) => Ext.Msg.alert(gettext('Error'), response.htmlStatus),
	    });
	};

	let caps = Ext.state.Manager.get('GuiCap');
	let standalone = PVE.data.ResourceStore.getNodes().length < 2;

	let running = false, stopped = true, suspended = false;
	switch (info.status) {
	    case 'running':
		running = true;
		stopped = false;
		break;
	    case 'paused':
		stopped = false;
		suspended = true;
		break;
	    default: break;
	}

	me.title = 'CT ' + info.vmid;

	me.items = [
	    {
		text: gettext('Start'),
		iconCls: 'fa fa-fw fa-play',
		disabled: running,
		handler: () => vm_command('start'),
	    },
	    {
		text: gettext('Shutdown'),
		iconCls: 'fa fa-fw fa-power-off',
		disabled: stopped || suspended,
		handler: function() {
		    var msg = Proxmox.Utils.format_task_description('vzshutdown', info.vmid);
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
		tooltip: Ext.String.format(gettext('Stop {0} immediately'), 'CT'),
		handler: function() {
		    var msg = Proxmox.Utils.format_task_description('vzstop', info.vmid);
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
		tooltip: Ext.String.format(gettext('Reboot {0}'), 'CT'),
		handler: function() {
		    var msg = Proxmox.Utils.format_task_description('vzreboot', info.vmid);
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
		text: gettext('Clone'),
		iconCls: 'fa fa-fw fa-clone',
		hidden: !caps.vms['VM.Clone'],
		handler: () => PVE.window.Clone.wrap(info.node, info.vmid, me.isTemplate, 'lxc'),
	    },
	    {
		text: gettext('Migrate'),
		iconCls: 'fa fa-fw fa-send-o',
		hidden: standalone || !caps.vms['VM.Migrate'],
		handler: function() {
		    Ext.create('PVE.window.Migrate', {
			vmtype: 'lxc',
			nodename: info.node,
			vmid: info.vmid,
			autoShow: true,
		    });
		},
	    },
	    {
		text: gettext('Convert to template'),
		iconCls: 'fa fa-fw fa-file-o',
		handler: function() {
		    let msg = Proxmox.Utils.format_task_description('vztemplate', info.vmid);
		    Ext.Msg.confirm(gettext('Confirm'), msg, function(btn) {
			if (btn === 'yes') {
			    Proxmox.Utils.API2Request({
				url: `/nodes/${info.node}/lxc/${info.vmid}/template`,
				method: 'POST',
				failure: (response, opts) => Ext.Msg.alert('Error', response.htmlStatus),
			    });
			}
		    });
		},
	    },
	    { xtype: 'menuseparator' },
	    {
		text: gettext('Console'),
		iconCls: 'fa fa-fw fa-terminal',
		handler: () =>
		    PVE.Utils.openDefaultConsoleWindow(true, 'lxc', info.vmid, info.node, info.vmname),
	    },
	];

	me.callParent();
    },
});
