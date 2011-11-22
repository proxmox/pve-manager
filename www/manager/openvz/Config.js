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

	me.statusStore = Ext.create('PVE.data.ObjectStore', {
	    url: "/api2/json/nodes/" + nodename + "/openvz/" + vmid + "/status/current",
	    interval: 1000
	});

	var vm_command = function(cmd, params) {
	    PVE.Utils.API2Request({
		params: params,
		url: '/nodes/' + nodename + '/openvz/' + vmid + "/status/" + cmd,
		waitMsgTarget: me,
		method: 'POST',
		failure: function(response, opts) {
		    Ext.Msg.alert('Error', response.htmlStatus);
		}
	    });
	};

	var startBtn = Ext.create('Ext.Button', { 
	    text: gettext('Start'),
	    handler: function() {
		vm_command('start');
	    }			    
	}); 
 
	var stopBtn = Ext.create('PVE.button.Button', {
	    text: gettext('Stop'),
	    confirmMsg: Ext.String.format(gettext("Do you really want to stop VM {0}?"), vmid),
	    handler: function() {
		vm_command("stop", { fast: 1 });
	    }
	});
 
	var shutdownBtn = Ext.create('PVE.button.Button', {
	    text: gettext('Shutdown'),
	    confirmMsg: Ext.String.format(gettext("Do you really want to shutdown VM {0}?"), vmid),
	    handler: function() {
		vm_command('stop');
	    }			    
	});
 
	var migrateBtn = Ext.create('Ext.Button', { 
	    text: gettext('Migrate'),
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
	    confirmMsg: Ext.String.format(gettext('Are you sure you want to remove VM {0}? This will permanently erase all VM data.'), vmid),
	    handler: function() {
		PVE.Utils.API2Request({
		    url: '/nodes/' + nodename + '/openvz/' + vmid,
		    method: 'DELETE',
		    waitMsgTarget: me,
		    failure: function(response, opts) {
			Ext.Msg.alert('Error', response.htmlStatus);
		    }
		});
	    }
	});

	var consoleBtn = Ext.create('Ext.Button', {
	    text: gettext('Console'),
	    handler: function() {
		PVE.Utils.openConoleWindow('openvz', vmid, nodename);
	    }
	});

	var vmname = me.pveSelNode.data.name;
	var descr = vmid + " (" + (vmname ? "'" + vmname + "' " : "'CT " + vmid + "'") + ")";

	Ext.apply(me, {
	    title: Ext.String.format(gettext("Container {0} on node {1}"), descr, "'" + nodename + "'"),
	    hstateid: 'ovztab',
	    tbar: [ startBtn, stopBtn, shutdownBtn, migrateBtn, 
		    removeBtn, consoleBtn ],
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
		    title: 'DNS',
		    itemId: 'dns',
		    xtype: 'pveOpenVZDNS'
		},
		{
		    title: gettext('Options'),
		    itemId: 'options',
		    xtype: 'pveOpenVZOptions'
		},
		{
		    title: 'UBC',
		    itemId: 'ubc',
		    xtype: 'pveBeanCounterGrid',
		    url: '/api2/json/nodes/' + nodename + '/openvz/' + vmid + '/status/ubc'
		},
		{
		    title: "InitLog",
		    itemId: 'initlog',
		    xtype: 'pveLogView',
		    url: '/api2/extjs/nodes/' + nodename + '/openvz/' + vmid + '/initlog'
		},
		{
		    title: gettext('Backup'),
		    xtype: 'pveBackupView',
		    itemId: 'backup'
		},
		{
		    title: gettext('Permissions'),
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
	    shutdownBtn.setDisabled(status !== 'running');
	    stopBtn.setDisabled(status === 'stopped');
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
