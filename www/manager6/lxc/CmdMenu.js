Ext.define('PVE.lxc.CmdMenu', {
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
	    throw "no CT ID specified";
	}
	var vmname = me.pveSelNode.data.name;

	var vm_command = function(cmd, params) {
	    PVE.Utils.API2Request({
		params: params,
		url: '/nodes/' + nodename + '/lxc/' + vmid + "/status/" + cmd,
		method: 'POST',
		failure: function(response, opts) {
		    Ext.Msg.alert(gettext('Error'), response.htmlStatus);
		}
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
	    case 'paused':
		stopped = false;
		suspended = true;
		break;
	    default: break;
	}

	me.title = 'CT ' + vmid;

	me.items = [
	    {
		text: gettext('Start'),
		iconCls: 'fa fa-fw fa-play',
		disabled: running,
		handler: function() {
		    vm_command('start');
		}
	    },
//	    {
//		text: gettext('Suspend'),
//		iconCls: 'fa fa-fw fa-pause',
//		hidde: suspended,
//		disabled: stopped || suspended,
//		handler: function() {
//		    var msg = PVE.Utils.format_task_description('vzsuspend', vmid);
//		    Ext.Msg.confirm(gettext('Confirm'), msg, function(btn) {
//			if (btn !== 'yes') {
//			    return;
//			}
//
//			vm_command('suspend');
//		    });
//		}
//	    },
//	    {
//		text: gettext('Resume'),
//		iconCls: 'fa fa-fw fa-play',
//		hidden: !suspended,
//		handler: function() {
//		    vm_command('resume');
//		}
//	    },
	    {
		text: gettext('Shutdown'),
		iconCls: 'fa fa-fw fa-power-off',
		disabled: stopped || suspended,
		handler: function() {
		    var msg = PVE.Utils.format_task_description('vzshutdown', vmid);
		    Ext.Msg.confirm(gettext('Confirm'), msg, function(btn) {
			if (btn !== 'yes') {
			    return;
			}

			vm_command('shutdown');
		    });
		}
	    },
	    {
		text: gettext('Stop'),
		iconCls: 'fa fa-fw fa-stop',
		disabled: stopped,
		handler: function() {
		    var msg = PVE.Utils.format_task_description('vzstop', vmid);
		    Ext.Msg.confirm(gettext('Confirm'), msg, function(btn) {
			if (btn !== 'yes') {
			    return;
			}

			vm_command("stop");
		    });
		}
	    },
	    {
		xtype: 'menuseparator',
		hidden: standalone || !caps.vms['VM.Migrate']
	    },
	    {
		text: gettext('Migrate'),
		iconCls: 'fa fa-fw fa-send-o',
		hidden: standalone || !caps.vms['VM.Migrate'],
		handler: function() {
		    var win = Ext.create('PVE.window.Migrate', {
			vmtype: 'lxc',
			nodename: nodename,
			vmid: vmid
		    });
		    win.show();
		}
	    },
//	    {
//		text: gettext('Convert to template'),
//		icon: '/pve2/images/forward.png',
//		handler: function() {
//		    var msg = PVE.Utils.format_task_description('vztemplate', vmid);
//		    Ext.Msg.confirm(gettext('Confirm'), msg, function(btn) {
//			if (btn !== 'yes') {
//			    return;
//			}
//
//			PVE.Utils.API2Request({
//			     url: '/nodes/' + nodename + '/lxc/' + vmid + '/template',
//			     method: 'POST',
//			     failure: function(response, opts) {
//				Ext.Msg.alert('Error', response.htmlStatus);
//			     }
//			});
//		    });
//		}
//	    },
	    { xtype: 'menuseparator' },
	    {
		text: gettext('Console'),
		iconCls: 'fa fa-fw fa-terminal',
		handler: function() {
		    PVE.Utils.openDefaultConsoleWindow(true, 'lxc', vmid, nodename, vmname);
		}
	    }
	];

	me.callParent();
    }
});
