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
	
	var template = me.pveSelNode.data.template;

	var caps = Ext.state.Manager.get('GuiCap');

	var base_url = '/nodes/' + nodename + "/qemu/" + vmid;
 
	me.statusStore = Ext.create('PVE.data.ObjectStore', {
	    url: '/api2/json' + base_url + '/status/current',
	    interval: 1000
	});

	var vm_command = function(cmd, params) {
	    PVE.Utils.API2Request({
		params: params,
		url: base_url + '/status/' + cmd,
		waitMsgTarget: me,
		method: 'POST',
		failure: function(response, opts) {
		    Ext.Msg.alert('Error', response.htmlStatus);
		}
	    });
	};

	var resumeBtn = Ext.create('Ext.Button', { 
	    text: gettext('Resume'),
	    disabled: !caps.vms['VM.PowerMgmt'],
	    visible: false,
	    handler: function() {
		vm_command('resume');
	    }			    
	}); 

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
		    url: base_url,
		    method: 'DELETE',
		    waitMsgTarget: me,
		    failure: function(response, opts) {
			Ext.Msg.alert('Error', response.htmlStatus);
		    }
		});
	    } 
	});

	var vmname = me.pveSelNode.data.name;

	var consoleBtn = Ext.create('PVE.button.ConsoleButton', {
	    disabled: !caps.vms['VM.Console'],
	    consoleType: 'kvm',
	    consoleName: vmname,
	    nodename: nodename,
	    vmid: vmid
	});

	var descr = vmid + " (" + (vmname ? "'" + vmname + "' " : "'VM " + vmid + "'") + ")";

	Ext.apply(me, {
	    title: Ext.String.format(gettext("Virtual Machine {0} on node {1}"), descr, "'" + nodename + "'"),
	    hstateid: 'kvmtab',
	    tbar: [ resumeBtn, startBtn, shutdownBtn, stopBtn, resetBtn, 
		    removeBtn, migrateBtn, consoleBtn],
	    defaults: { statusStore: me.statusStore },
	    items: [
		{
		    title: gettext('SummaryTODO'),
		    xtype: 'panel',
//		    title: gettext('Summary'),
//		    xtype: 'pveQemuSummary',
		    itemId: 'summary'
		} ]
	});
/*
		{
		    title: gettext('Hardware'),
		    itemId: 'hardware',
		    xtype: 'PVE.qemu.HardwareView'
		},
		{
		    title: gettext('Options'),
		    itemId: 'options',
		    xtype: 'PVE.qemu.Options'
		},
		{
		    title: gettext('Task History'),
		    itemId: 'tasks',
		    xtype: 'pveNodeTasks',
		    vmidFilter: vmid
		}
	    ]
	});

	if (caps.vms['VM.Monitor'] && !template) {
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

	if (caps.vms['VM.Snapshot']) {
	    me.items.push({
		title: gettext('Snapshots'),
		xtype: 'pveQemuSnapshotTree',
		itemId: 'snapshot'
	    });
	}

	if (caps.vms['VM.Console'] && !template) {
	    me.items.push({
		title: gettext('Console'),
		itemId: 'console',
		xtype: 'pveNoVncConsole',
		vmid: vmid,
		consoleType: 'kvm',
		nodename: nodename
	    });
	}

	if (caps.vms['VM.Console']) {
	    me.items.push([
		{
		    xtype: 'pveFirewallPanel',
		    title: gettext('Firewall'),
		    base_url: base_url + '/firewall',
		    fwtype: 'vm',
		    phstateid: me.hstateid,
		    itemId: 'firewall'
		}
	    ]);
	}

	if (caps.vms['Permissions.Modify']) {
	    me.items.push({
		xtype: 'pveACLView',
		title: gettext('Permissions'),
		itemId: 'permissions',
		path: '/vms/' + vmid
	    });
	}
*/
	me.callParent();

        me.statusStore.on('load', function(s, records, success) {
	    var status;
	    var qmpstatus;
	    var spice = false;

	    if (!success) {
		me.workspace.checkVmMigration(me.pveSelNode);
		status = qmpstatus = 'unknown';
	    } else {
		var rec = s.data.get('status');
		status = rec ? rec.data.value : 'unknown';
		rec = s.data.get('qmpstatus');
		qmpstatus = rec ? rec.data.value : 'unknown';
		rec = s.data.get('template');
		if(rec.data.value){
		    template = rec.data.value;
		}
		spice = s.data.get('spice') ? true : false;

	    }

	    if (qmpstatus === 'prelaunch' || qmpstatus === 'paused') {
		startBtn.setVisible(false);
		resumeBtn.setVisible(true);
	    } else {
		startBtn.setVisible(true);
		resumeBtn.setVisible(false);
	    }

	    consoleBtn.setEnableSpice(spice);

	    startBtn.setDisabled(!caps.vms['VM.PowerMgmt'] || status === 'running' || template);
	    resetBtn.setDisabled(!caps.vms['VM.PowerMgmt'] || status !== 'running' || template);
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
