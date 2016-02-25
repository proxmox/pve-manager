Ext.define('PVE.node.Config', {
    extend: 'PVE.panel.Config',
    alias: 'widget.PVE.node.Config',

    initComponent: function() {
        var me = this;

	var nodename = me.pveSelNode.data.node;
	if (!nodename) {
	    throw "no node name specified";
	}

	var caps = Ext.state.Manager.get('GuiCap');

	me.statusStore = Ext.create('PVE.data.ObjectStore', {
	    url: "/api2/json/nodes/" + nodename + "/status",
	    interval: 1000
	});

	var node_command = function(cmd) {
	    PVE.Utils.API2Request({
		params: { command: cmd },
		url: '/nodes/' + nodename + '/status',
		method: 'POST',
		waitMsgTarget: me,
		failure: function(response, opts) {
		    Ext.Msg.alert(gettext('Error'), response.htmlStatus);
		}
	    });
	};
	
	var actionBtn = Ext.create('Ext.Button', {
	    text: gettext('More'),
	    disabled: !caps.nodes['Sys.PowerMgmt'],
	    menu: new Ext.menu.Menu({
		items: [
		    {
			text: gettext('Start All VMs'),
			icon: '/pve2/images/start.png',
			handler: function() {
			    var msg = Ext.String.format(gettext("Do you really want to start all Vms on  node {0}?"), nodename);
			    Ext.Msg.confirm(gettext('Confirm'), msg, function(btn) {
				if (btn !== 'yes') {
				    return;
				}
				PVE.Utils.API2Request({
				    params: { force: 1 },
				    url: '/nodes/' + nodename + '/startall',
				    method: 'POST',
				    waitMsgTarget: me,
				    failure: function(response, opts) {
					Ext.Msg.alert('Error', response.htmlStatus);
				    }
				});
			    });
			}
		    },
		    {
			text: gettext('Stop All VMs'),
			icon: '/pve2/images/gtk-stop.png',
			handler: function() {
			    var msg = Ext.String.format(gettext("Do you really want to stop all Vms on  node {0}?"), nodename);
			    Ext.Msg.confirm(gettext('Confirm'), msg, function(btn) {
				if (btn !== 'yes') {
				    return;
				}
			    
				PVE.Utils.API2Request({
				    url: '/nodes/' + nodename + '/stopall',
				    method: 'POST',
				    waitMsgTarget: me,
				    failure: function(response, opts) {
					Ext.Msg.alert('Error', response.htmlStatus);
				    }
				});
			    });
			}
		    },
		    {
			text: gettext('Migrate All VMs'),
			icon: '/pve2/images/forward.png',
			handler: function() {
			    var win = Ext.create('PVE.window.MigrateAll', {
				nodename: nodename,
			    });
			    win.show();
			}
		    }
		]
	    })
	}); 

	var restartBtn = Ext.create('PVE.button.Button', {
	    text: gettext('Restart'),
	    disabled: !caps.nodes['Sys.PowerMgmt'],
	    confirmMsg: Ext.String.format(gettext("Do you really want to restart node {0}?"), nodename),
	    handler: function() { 
		node_command('reboot');
	    }
	});

	var shutdownBtn = Ext.create('PVE.button.Button', {
	    text: gettext('Shutdown'),
	    disabled: !caps.nodes['Sys.PowerMgmt'],
	    confirmMsg: Ext.String.format(gettext("Do you really want to shutdown node {0}?"), nodename),
	    handler: function() { 
		node_command('shutdown');
	    }
	});

	var shellBtn = Ext.create('PVE.button.ConsoleButton', {
	    disabled: !caps.nodes['Sys.Console'],
	    text: gettext('Shell'),
	    consoleType: 'shell',
	    nodename: nodename
	});

	me.items = [];

	Ext.apply(me, {
	    title: gettext('Node') + " '" + nodename + "'",
	    hstateid: 'nodetab',
	    defaults: { statusStore: me.statusStore },
	    tbar: [ restartBtn, shutdownBtn, shellBtn, actionBtn]
	});

	if (caps.nodes['Sys.Audit']) {
	    me.items.push(
		{
		    title: gettext('Summary'),
		    itemId: 'summary',
		    xtype: 'pveNodeSummary'
		},
		{
		    title: gettext('Services'),
		    itemId: 'services',
//		    xtype: 'pveNodeServiceView',
		    xtype: 'panel',
		},
		{
		    title: gettext('Network'),
		    itemId: 'network',
//		    xtype: 'pveNodeNetworkView'
		    xtype: 'panel',
		},
		{
		    title: gettext('DNS'),
		    itemId: 'dns',
//		    xtype: 'pveNodeDNSView'
		    xtype: 'panel',
		},
		{
		    title: gettext('Time'),
		    itemId: 'time',
//		    xtype: 'pveNodeTimeView'
		    xtype: 'panel',
		}
	    );
	}

	if (caps.nodes['Sys.Syslog']) {
	    me.items.push(
		{
		    title: 'Syslog',
		    itemId: 'syslog',
		    xtype: 'pveLogView',
		    url: "/api2/extjs/nodes/" + nodename + "/syslog"
		}
	    );
	}

	me.items.push(
	    {
		title: gettext('Task History'),
		itemId: 'tasks',
		xtype: 'pveNodeTasks'
	    }
	);

	if (caps.nodes['Sys.Console']) {
	    me.items.push(
		{
//		    xtype: 'pveFirewallPanel',
		    xtype: 'panel',
		    title: gettext('Firewall'),
		    base_url: '/nodes/' + nodename + '/firewall',
		    fwtype: 'node',
		    phstateid: me.hstateid,
		    itemId: 'firewall'
		},
		{
		    title: gettext('Updates'),
		    itemId: 'apt',
//		    xtype: 'pveNodeAPT',
		    xtype: 'panel',
		    nodename: nodename
		},
		{
		    title: gettext('Console'),
		    itemId: 'console',
//		    xtype: 'pveNoVncConsole',
		    xtype: 'panel',
		    consoleType: 'shell',
		    nodename: nodename
		},
		{
		    title: 'Ceph',
		    itemId: 'ceph',
//		xtype: 'pveNodeCeph',
		    xtype: 'panel',
		    phstateid: me.hstateid,
		    nodename: nodename
		}
	    );
	}

	me.items.push(
	    {
		title: gettext('Subscription'),
		itemId: 'support',
//		xtype: 'pveNodeSubscription',
		xtype: 'panel',
		nodename: nodename
	    }
	);

	me.callParent();

	me.statusStore.on('load', function(s, records, success) {
	    var uptimerec = s.data.get('uptime');
	    var powermgmt = uptimerec ? uptimerec.data.value : false;
	    if (!caps.nodes['Sys.PowerMgmt']) {
		powermgmt = false;
	    }
	    restartBtn.setDisabled(!powermgmt);
	    shutdownBtn.setDisabled(!powermgmt);
	    shellBtn.setDisabled(!powermgmt);
	});

	me.on('afterrender', function() {
	    me.statusStore.startUpdate();
	});

	me.on('destroy', function() {
	    me.statusStore.stopUpdate();
	});
    }
});
