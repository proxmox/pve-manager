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
	    text: 'Start',
	    handler: function() {
		vm_command('start');
	    }			    
	}); 
 
	var stopBtn = Ext.create('PVE.button.Button', {
	    text: 'Stop',
	    confirmMsg: "Do you really want to stop the VM?",
	    handler: function() {
		vm_command("stop", { timeout: 30 });
	    }
	});

	var migrateBtn = Ext.create('Ext.Button', { 
	    text: 'Migrate',
	    handler: function() {
		var win = Ext.create('PVE.qemu.Migrate', { 
		    pveSelNode: me.pveSelNode
		});
		win.show();
	    }    
	});
 
	var resetBtn = Ext.create('PVE.button.Button', {
	    text: 'Reset',
	    confirmMsg: "Do you really want to reset the VM?",
	    handler: function() { 
		vm_command("reset");
	    }
	});

	var shutdownBtn = Ext.create('PVE.button.Button', {
	    text: 'Shutdown',
	    confirmMsg: "Do you really want to shutdown the VM?",
	    handler: function() {
		vm_command('shutdown', { timeout: 30 });
	    }			    
	});

	var removeBtn = Ext.create('PVE.button.Button', {
	    text: 'Remove',
	    confirmMsg: 'Are you sure you want to remove VM ' + 
		vmid + '? This will permanently erase all VM data.',
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

	var consoleBtn = Ext.create('Ext.Button', {
	    text: 'Console',
	    handler: function() {
		var url = Ext.urlEncode({
		    console: 'kvm',
		    vmid: vmid,
		    node: nodename
		});
		var nw = window.open("?" + url, '_blank', 
				     "innerWidth=745,innerheight=427");
		nw.focus();
	    }
	});

	var vmname = me.pveSelNode.data.name;
	var descr = vmname ? "'" + vmname + "' " : '';
	Ext.apply(me, {
	    title: "Virtual machine " + descr + "'KVM " + vmid + 
		"' on node '" + nodename + "'",
	    hstateid: 'kvmtab',
	    tbar: [ startBtn, stopBtn, migrateBtn, resetBtn, shutdownBtn, removeBtn, consoleBtn ],
	    defaults: { statusStore: me.statusStore },
	    items: [
		{
		    title: 'Summary',
		    xtype: 'pveQemuSummary',
		    itemId: 'summary'
		},
		{
		    title: 'Hardware',
		    itemId: 'hardware',
		    xtype: 'PVE.qemu.HardwareView'
		},
		{
		    title: 'Options',
		    itemId: 'options',
		    xtype: 'PVE.qemu.Options'
		},
		{
		    title: 'Monitor',
		    itemId: 'monitor',
		    xtype: 'pveQemuMonitor'
		},
		{
		    xtype: 'pveBackupView',
		    title: 'Backup',
		    itemId: 'backup'
		},
		{
		    title: 'Permissions',
		    itemId: 'permissions',
		    html: 'permissions ' + vmid
		}

	    ]
	});

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

	    startBtn.setDisabled(status === 'running');
	    resetBtn.setDisabled(status !== 'running');
	    shutdownBtn.setDisabled(status !== 'running');
	    stopBtn.setDisabled(status === 'stopped');
	    consoleBtn.setDisabled(status !== 'running');
	    removeBtn.setDisabled(status !== 'stopped');
	});

	me.on('afterrender', function() {
	    me.statusStore.startUpdate();
	});

	me.on('destroy', function() {
	    me.statusStore.stopUpdate();
	});
   }
});
