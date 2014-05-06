Ext.define('PVE.openvz.Config', {
    extend: 'PVE.panel.Config',
    alias: 'widget.PVE.openvz.Config',

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

	var base_url = '/nodes/' + nodename + '/openvz/' + vmid;
 
	me.statusStore = Ext.create('PVE.data.ObjectStore', {
	    url: '/api2/json' + base_url + '/status/current',
	    interval: 1000
	});

	var vm_command = function(cmd, params) {
	    PVE.Utils.API2Request({
		params: params,
		url: base_url + "/status/" + cmd,
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

	var umountBtn = Ext.create('Ext.Button', { 
	    text: gettext('Unmount'),
	    disabled: true,
	    hidden: true,
	    handler: function() {
		vm_command('umount');
	    }			    
	}); 
 
	var stopBtn = Ext.create('PVE.button.Button', {
	    text: gettext('Stop'),
	    disabled: !caps.vms['VM.PowerMgmt'],
	    confirmMsg: Ext.String.format(gettext("Do you really want to stop VM {0}?"), vmid),
	    handler: function() {
		vm_command("stop");
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
 
	var migrateBtn = Ext.create('Ext.Button', { 
	    text: gettext('Migrate'),
	    disabled: !caps.vms['VM.Migrate'],
	    handler: function() {
		var win = Ext.create('PVE.window.Migrate', { 
		    vmtype: 'openvz',
		    nodename: nodename,
		    vmid: vmid
		});
		win.show();
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
	    consoleType: 'openvz',
	    consoleName: vmname,
	    nodename: nodename,
	    vmid: vmid
	});

	var descr = vmid + " (" + (vmname ? "'" + vmname + "' " : "'CT " + vmid + "'") + ")";

	Ext.apply(me, {
	    title: Ext.String.format(gettext("Container {0} on node {1}"), descr, "'" + nodename + "'"),
	    hstateid: 'ovztab',
	    tbar: [ startBtn, shutdownBtn, umountBtn, stopBtn, removeBtn, 
		    migrateBtn, consoleBtn ],
	    defaults: { statusStore: me.statusStore },
	    items: [
		{
		    title: gettext('Summary'),
		    xtype: 'pveOpenVZSummary',
		    itemId: 'summary'
		},
		{
		    title: gettext('Resources'),
		    itemId: 'resources',
		    xtype: 'pveOpenVZRessourceView'
		},
		{
		    title: gettext('Network'),
		    itemId: 'network',
		    xtype: 'pveOpenVZNetworkView'
		},
		{
		    title: gettext('DNS'),
		    itemId: 'dns',
		    xtype: 'pveOpenVZDNS'
		},
		{
		    title: gettext('Options'),
		    itemId: 'options',
		    xtype: 'pveOpenVZOptions'
		},
		{
		    title: gettext('Task History'),
		    itemId: 'tasks',
		    xtype: 'pveNodeTasks',
		    vmidFilter: vmid
		},
		{
		    title: 'UBC',
		    itemId: 'ubc',
		    xtype: 'pveBeanCounterGrid',
		    url: '/api2/json' + base_url + '/status/ubc'
		}
	    ]
	});

	if (caps.vms['VM.Backup']) {
	    me.items.push({
		title: gettext('Backup'),
		xtype: 'pveBackupView',
		itemId: 'backup'
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
	    shutdownBtn.setDisabled(!caps.vms['VM.PowerMgmt'] || status !== 'running');
	    stopBtn.setDisabled(!caps.vms['VM.PowerMgmt'] || status === 'stopped');
	    removeBtn.setDisabled(!caps.vms['VM.Allocate'] || status !== 'stopped');

	    if (status === 'mounted') {
		umountBtn.setDisabled(false);
		umountBtn.setVisible(true);
		stopBtn.setVisible(false);
	    } else {
		umountBtn.setDisabled(true);
		umountBtn.setVisible(false);
		stopBtn.setVisible(true);
	    }
	});

	me.on('afterrender', function() {
	    me.statusStore.startUpdate();
	});

	me.on('destroy', function() {
	    me.statusStore.stopUpdate();
	});
    }
});
