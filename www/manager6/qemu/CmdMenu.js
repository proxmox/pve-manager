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
	    PVE.Utils.API2Request({
		params: params,
		url: '/nodes/' + nodename + '/qemu/' + vmid + "/status/" + cmd,
		method: 'POST',
		failure: function(response, opts) {
		    Ext.Msg.alert('Error', response.htmlStatus);
		}
	    });
	};

	var caps = Ext.state.Manager.get('GuiCap');

	var running = false;
	var stopped = true;
	var suspended = false;

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

	me.title = "VM " + vmid;

	me.items = [
	    {
		text: gettext('Start'),
		iconCls: 'fa fa-fw fa-play',
		disabled: running || suspended,
		handler: function() {
		    vm_command('start');
		}
	    },
	    {
		text: gettext('Suspend'),
		iconCls: 'fa fa-fw fa-pause',
		hidden: suspended,
		disabled: stopped || suspended,
		handler: function() {
		    var msg = PVE.Utils.format_task_description('qmsuspend', vmid);
		    Ext.Msg.confirm(gettext('Confirm'), msg, function(btn) {
			if (btn !== 'yes') {
			    return;
			}
			vm_command('suspend');
		    });
		}
	    },
	    {
		text: gettext('Resume'),
		iconCls: 'fa fa-fw fa-play',
		hidden: !suspended,
		handler: function() {
		    vm_command('resume');
		}
	    },
	    {
		text: gettext('Shutdown'),
		iconCls: 'fa fa-fw fa-power-off',
		disabled: stopped || suspended,
		handler: function() {
		    var msg = PVE.Utils.format_task_description('qmshutdown', vmid);
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
		    var msg = PVE.Utils.format_task_description('qmstop', vmid);
		    Ext.Msg.confirm(gettext('Confirm'), msg, function(btn) {
			if (btn !== 'yes') {
			    return;
			}

			vm_command("stop");
		    });
		}
	    },
	    { xtype: 'menuseparator' },
	    {
		text: gettext('Migrate'),
		iconCls: 'fa fa-fw fa-send-o',
		hidden: caps.vms['VM.Migrate'] ? false : true,
		handler: function() {
		    var win = Ext.create('PVE.window.Migrate', {
			vmtype: 'qemu',
			nodename: nodename,
			vmid: vmid
		    });
		    win.show();
		}
	    },
	    {
		text: gettext('Clone'),
		iconCls: 'fa fa-fw fa-clone',
		hidden: caps.vms['VM.Clone'] ? false : true,
		handler: function() {
		    PVE.Utils.API2Request({
			url: '/nodes/' + nodename + '/qemu/' + vmid +'/snapshot',
			failure: function(response, opts) {
			    Ext.Msg.alert('Error', response.htmlStatus);
			},
			success: function(response, opts) {
			    var snapshotList = response.result.data;
			    var hasSnapshots = snapshotList.length === 1 &&
				snapshotList[0].name === 'current' ? false : true;

			    Ext.create('PVE.window.Clone', {
				nodename: nodename,
				vmid: vmid,
				hasSnapshots: hasSnapshots
			    }).show();
			}
		    });
		}
	    },
	    {
		text: gettext('Convert to template'),
		iconCls: 'fa fa-fw fa-file-o',
		hidden: caps.vms['VM.Allocate'] ? false : true,
		handler: function() {
		    var msg = PVE.Utils.format_task_description('qmtemplate', vmid);
		    Ext.Msg.confirm(gettext('Confirm'), msg, function(btn) {
			if (btn !== 'yes') {
			    return;
			}

			PVE.Utils.API2Request({
			     url: '/nodes/' + nodename + '/qemu/' + vmid + '/template',
			     method: 'POST',
			     failure: function(response, opts) {
				Ext.Msg.alert('Error', response.htmlStatus);
			     }
			});
		    });
		}
	    },
	    { xtype: 'menuseparator' },
	    {
		text: gettext('Console'),
		iconCls: 'fa fa-fw fa-terminal',
		handler: function() {
		    PVE.Utils.API2Request({
			url: '/nodes/' + nodename + '/qemu/' + vmid + '/status/current',
			failure: function(response, opts) {
			    Ext.Msg.alert('Error', response.htmlStatus);
			},
			success: function(response, opts) {
			    var allowSpice = response.result.data.spice;
			    PVE.Utils.openDefaultConsoleWindow(allowSpice, 'kvm', vmid, nodename, vmname);
			}
		    });
		}
	    }
	];

	me.callParent();
    }
});
