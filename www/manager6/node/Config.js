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
	    iconCls: 'fa fa-fw fa-ellipsis-v',
	    disabled: !caps.nodes['Sys.PowerMgmt'],
	    menu: new Ext.menu.Menu({
		items: [
		    {
			text: gettext('Start all VMs and Containers'),
			text: gettext('Start All VMs'),
			iconCls: 'fa fa-fw fa-play',
			handler: function() {
			    var msg = gettext('Start all VMs and Containers') + ' (' + gettext('Node') + " '" + nodename + "')";
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
			text: gettext('Stop all VMs and Containers'),
			iconCls: 'fa fa-fw fa-stop fa-red',
			handler: function() {
			    var msg = gettext('Stop all VMs and Containers') + ' (' + gettext('Node') + " '" + nodename + "')";
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
			text: gettext('Migrate all VMs and Containers'),
			iconCls: 'fa fa-fw fa-send-o',
			handler: function() {
			    var win = Ext.create('PVE.window.MigrateAll', {
				nodename: nodename
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
	    confirmMsg: gettext('Node') + " '" + nodename + "' - " + gettext('Restart'),
	    handler: function() {
		node_command('reboot');
	    },
	    iconCls: 'fa fa-undo'
	});

	var shutdownBtn = Ext.create('PVE.button.Button', {
	    text: gettext('Shutdown'),
	    disabled: !caps.nodes['Sys.PowerMgmt'],
	    confirmMsg: gettext('Node') + " '" + nodename + "' - " + gettext('Shutdown'),
	    handler: function() {
		node_command('shutdown');
	    },
	    iconCls: 'fa fa-power-off'
	});

	var shellBtn = Ext.create('PVE.button.ConsoleButton', {
	    disabled: !caps.nodes['Sys.Console'],
	    text: gettext('Shell'),
	    consoleType: 'shell',
	    nodename: nodename,
		iconCls: 'fa fa-terminal'
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
		    xtype: 'pveNodeServiceView'
		},
		{
		    title: gettext('Network'),
		    itemId: 'network',
		    xtype: 'pveNodeNetworkView'
		},
		{
		    title: gettext('DNS'),
		    itemId: 'dns',
		    xtype: 'pveNodeDNSView'
		},
		{
		    title: gettext('Time'),
		    itemId: 'time',
		    xtype: 'pveNodeTimeView'
		}
	    );
	}

	if (caps.nodes['Sys.Syslog']) {
	    me.items.push(
		{
		    title: 'Syslog',
		    itemId: 'syslog',
		    xtype: 'pveLogView',
		    url: "/api2/extjs/nodes/" + nodename + "/syslog",
		    log_select_timespan: 1
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
		    xtype: 'pveFirewallPanel',
		    title: gettext('Firewall'),
		    base_url: '/nodes/' + nodename + '/firewall',
		    fwtype: 'node',
		    phstateid: me.hstateid,
		    itemId: 'firewall'
		},
		{
		    title: gettext('Updates'),
		    itemId: 'apt',
		    xtype: 'pveNodeAPT',
		    nodename: nodename
		},
		{
		    title: gettext('Console'),
		    itemId: 'console',
		    xtype: 'pveNoVncConsole',
		    consoleType: 'shell',
		    nodename: nodename
		},
		{
		    title: 'Ceph',
		    itemId: 'ceph',
		    xtype: 'pveNodeCeph',
		    phstateid: me.hstateid,
		    nodename: nodename
		}
	    );
	}

	me.items.push(
	    {
		title: gettext('Subscription'),
		itemId: 'support',
		xtype: 'pveNodeSubscription',
		nodename: nodename
	    }
	);

	me.callParent();

	me.mon(me.statusStore, 'load', function(s, records, success) {
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
