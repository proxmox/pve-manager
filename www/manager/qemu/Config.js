Ext.define('PVE.qemu.Config', {
    extend: 'PVE.panel.Config',
    alias: 'widget.PVE.qemu.Config',

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

	var caps = Ext.state.Manager.get('GuiCap');

	me.statusStore = Ext.create('PVE.data.ObjectStore', {
	    url: "/api2/json/nodes/" + nodename + "/qemu/" + vmid + "/status/current",
	    interval: 1000
	});

	var vm_command = function(cmd, params) {
	    PVE.Utils.API2Request({
		params: params,
		url: '/nodes/' + nodename + '/qemu/' + vmid + "/status/" + cmd,
		waitMsgTarget: me,
		method: 'POST',
		failure: function(response, opts) {
		    Ext.Msg.alert('Error', response.htmlStatus);
		}
	    });
	};

	var startBtn = Ext.create('Ext.Button', { 
	    text: gettext('Start'),
	    disabled: !caps.vms['VM.PowerMgmt'],
	    handler: function() {
		vm_command('start');
	    }			    
	}); 
 
	var stopBtn = Ext.create('PVE.button.Button', {
	    text: gettext('Stop'),
	    disabled: !caps.vms['VM.PowerMgmt'],
	    confirmMsg: Ext.String.format(gettext("Do you really want to stop VM {0}?"), vmid),
	    handler: function() {
		vm_command("stop", { timeout: 30 });
	    }
	});

	var migrateBtn = Ext.create('Ext.Button', { 
	    text: gettext('Migrate'),
	    disabled: !caps.vms['VM.Migrate'],
	    handler: function() {
		var win = Ext.create('PVE.window.Migrate', {
		    vmtype: 'qemu',
		    nodename: nodename,
		    vmid: vmid
		});
		win.show();
	    }    
	});
 
	var resetBtn = Ext.create('PVE.button.Button', {
	    text: gettext('Reset'),
	    disabled: !caps.vms['VM.PowerMgmt'],
	    confirmMsg: Ext.String.format(gettext("Do you really want to reset VM {0}?"), vmid),
	    handler: function() { 
		vm_command("reset");
	    }
	});

	var shutdownBtn = Ext.create('PVE.button.Button', {
	    text: gettext('Shutdown'),
	    disabled: !caps.vms['VM.PowerMgmt'],
	    confirmMsg: Ext.String.format(gettext("Do you really want to shutdown VM {0}?"), vmid),
	    handler: function() {
		vm_command('shutdown');
	    }			    
	});

	var removeBtn = Ext.create('PVE.button.Button', {
	    text: gettext('Remove'),
	    disabled: !caps.vms['VM.Allocate'],
	    dangerous: true,
	    confirmMsg: Ext.String.format(gettext('Are you sure you want to remove VM {0}? This will permanently erase all VM data.'), vmid),
	    handler: function() {
		PVE.Utils.API2Request({
		    url: '/nodes/' + nodename + '/qemu/' + vmid,
		    method: 'DELETE',
		    waitMsgTarget: me,
		    failure: function(response, opts) {
			Ext.Msg.alert('Error', response.htmlStatus);
		    }
		});
	    } 
	});

	var vmname = me.pveSelNode.data.name;

	var consoleBtn = Ext.create('Ext.Button', {
	    text: gettext('Console'),
	    disabled: !caps.vms['VM.Console'],
	    handler: function() {
		PVE.Utils.openConoleWindow('kvm', vmid, nodename, vmname);
	    }
	});

	var descr = vmid + " (" + (vmname ? "'" + vmname + "' " : "'VM " + vmid + "'") + ")";

	Ext.apply(me, {
	    title: Ext.String.format(gettext("Virtual Machine {0} on node {1}"), descr, "'" + nodename + "'"),
	    hstateid: 'kvmtab',
	    tbar: [ startBtn, shutdownBtn, stopBtn, resetBtn, 
		    removeBtn, migrateBtn, consoleBtn ],
	    defaults: { statusStore: me.statusStore },
	    items: [
		{
		    title: gettext('Summary'),
		    xtype: 'pveQemuSummary',
		    itemId: 'summary'
		},
		{
		    title: gettext('Hardware'),
		    itemId: 'hardware',
		    xtype: 'PVE.qemu.HardwareView'
		},
		{
		    title: gettext('Options'),
		    itemId: 'options',
		    xtype: 'PVE.qemu.Options'
		}
	    ]
	});

	if (caps.vms['VM.Monitor']) {
	    me.items.push({
		title: gettext('Monitor'),
		itemId: 'monitor',
		xtype: 'pveQemuMonitor'
	    });
	}

	if (caps.vms['VM.Backup']) {
	    me.items.push({
		title: gettext('Backup'),
		xtype: 'pveBackupView',
		itemId: 'backup'
	    });
	}

	if (caps.vms['Permissions.Modify']) {
	    me.items.push({
		xtype: 'pveACLView',
		title: gettext('Permissions'),
		itemId: 'permissions',
		path: '/vms/' + vmid
	    });
	}

	me.callParent();

        me.statusStore.on('load', function(s, records, success) {
	    var status;
	    if (!success) {
		me.workspace.checkVmMigration(me.pveSelNode);
		status = 'unknown';
	    } else {
		var rec = s.data.get('status');
		status = rec ? rec.data.value : 'unknown';
	    }

	    startBtn.setDisabled(!caps.vms['VM.PowerMgmt'] || status === 'running');
	    resetBtn.setDisabled(!caps.vms['VM.PowerMgmt'] || status !== 'running');
	    shutdownBtn.setDisabled(!caps.vms['VM.PowerMgmt'] || status !== 'running');
	    stopBtn.setDisabled(!caps.vms['VM.PowerMgmt'] || status === 'stopped');
	    removeBtn.setDisabled(!caps.vms['VM.Allocate'] || status !== 'stopped');
	});

	me.on('afterrender', function() {
	    me.statusStore.startUpdate();
	});

	me.on('destroy', function() {
	    me.statusStore.stopUpdate();
	});
   }
});
