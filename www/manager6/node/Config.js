Ext.define('PVE.node.Config', {
    extend: 'PVE.panel.Config',
    alias: 'widget.PVE.node.Config',

    onlineHelp: 'chapter_system_administration',

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
	    text: gettext('Bulk Actions'),
	    iconCls: 'fa fa-fw fa-ellipsis-v',
	    disabled: !caps.nodes['Sys.PowerMgmt'],
	    menu: new Ext.menu.Menu({
		items: [
		    {
			text: gettext('Bulk Start'),
			iconCls: 'fa fa-fw fa-play',
			handler: function() {
			    var win = Ext.create('PVE.window.BulkAction', {
				nodename: nodename,
				title: gettext('Bulk Start'),
				btnText: gettext('Start'),
				action: 'startall'
			    });
			    win.show();
			}
		    },
		    {
			text: gettext('Bulk Stop'),
			iconCls: 'fa fa-fw fa-stop',
			handler: function() {
			    var win = Ext.create('PVE.window.BulkAction', {
				nodename: nodename,
				title: gettext('Bulk Stop'),
				btnText: gettext('Stop'),
				action: 'stopall'
			    });
			    win.show();
			}
		    },
		    {
			text: gettext('Bulk Migrate'),
			iconCls: 'fa fa-fw fa-send-o',
			handler: function() {
			    var win = Ext.create('PVE.window.BulkAction', {
				nodename: nodename,
				title: gettext('Bulk Migrate'),
				btnText: gettext('Migrate'),
				action: 'migrateall'
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
	    dangerous: true,
	    confirmMsg: gettext('Node') + " '" + nodename + "' - " + gettext('Restart'),
	    handler: function() {
		node_command('reboot');
	    },
	    iconCls: 'fa fa-undo'
	});

	var shutdownBtn = Ext.create('PVE.button.Button', {
	    text: gettext('Shutdown'),
	    disabled: !caps.nodes['Sys.PowerMgmt'],
	    dangerous: true,
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
		    iconCls: 'fa fa-book',
		    itemId: 'summary',
		    xtype: 'pveNodeSummary'
		}
	    );
	}

	if (caps.nodes['Sys.Console']) {
	    me.items.push(
		{
		    title: gettext('Shell'),
		    iconCls: 'fa fa-terminal',
		    itemId: 'console',
		    xtype: 'pveNoVncConsole',
		    consoleType: 'shell',
		    nodename: nodename
		},
		{
		    title: gettext('Shell (JS)'),
		    iconCls: 'fa fa-terminal',
		    itemId: 'jsconsole',
		    xtype: 'pveNoVncConsole',
		    consoleType: 'shell',
		    xtermjs: true,
		    nodename: nodename
		}
	    );
	}

	if (caps.nodes['Sys.Audit']) {
	    me.items.push(
		{
		    title: gettext('System'),
		    iconCls: 'fa fa-cogs',
		    itemId: 'services',
		    expandedOnInit: true,
		    xtype: 'pveNodeServiceView'
		},
		{
		    title: gettext('Network'),
		    iconCls: 'fa fa-exchange',
		    itemId: 'network',
		    groups: ['services'],
		    xtype: 'pveNodeNetworkView'
		},
		{
		    title: gettext('DNS'),
		    iconCls: 'fa fa-globe',
		    groups: ['services'],
		    itemId: 'dns',
		    xtype: 'pveNodeDNSView'
		},
		{
		    title: gettext('Time'),
		    itemId: 'time',
		    groups: ['services'],
		    xtype: 'pveNodeTimeView',
		    iconCls: 'fa fa-clock-o'
		});
	}

	if (caps.nodes['Sys.Syslog']) {
	    me.items.push({
		title: 'Syslog',
		iconCls: 'fa fa-list',
		groups: ['services'],
		disabled: !caps.nodes['Sys.Syslog'],
		itemId: 'syslog',
		xtype: 'pveLogView',
		url: "/api2/extjs/nodes/" + nodename + "/syslog",
		log_select_timespan: 1
	    });

	    if (caps.nodes['Sys.Modify']) {
		me.items.push({
		    title: gettext('Updates'),
		    iconCls: 'fa fa-refresh',
		    disabled: !caps.nodes['Sys.Console'],
		    // do we want to link to system updates instead?
		    itemId: 'apt',
		    xtype: 'pveNodeAPT',
		    nodename: nodename
		});
	    }
	}

	if (caps.nodes['Sys.Audit']) {
	    me.items.push(
		{
		    xtype: 'pveFirewallRules',
		    iconCls: 'fa fa-shield',
		    title: gettext('Firewall'),
		    allow_iface: true,
		    base_url: '/nodes/' + nodename + '/firewall/rules',
		    list_refs_url: '/cluster/firewall/refs',
		    itemId: 'firewall'
		},
		{
		    xtype: 'pveFirewallOptions',
		    title: gettext('Options'),
		    iconCls: 'fa fa-gear',
		    onlineHelp: 'pve_firewall_host_specific_configuration',
		    groups: ['firewall'],
		    base_url: '/nodes/' + nodename + '/firewall/options',
		    fwtype: 'node',
		    itemId: 'firewall-options'
		});
	}


	if (caps.nodes['Sys.Audit']) {
	    me.items.push(
		{
		    title: gettext('Disks'),
		    itemId: 'storage',
		    expandedOnInit: true,
		    iconCls: 'fa fa-hdd-o',
		    xtype: 'pveNodeDiskList'
		},
		{
		    title: 'Ceph',
		    itemId: 'ceph',
		    iconCls: 'fa fa-ceph',
		    xtype: 'pveNodeCephStatus'
		},
		{
		    xtype: 'pveReplicaView',
		    iconCls: 'fa fa-retweet',
		    title: gettext('Replication'),
		    itemId: 'replication'
		},
		{
		    xtype: 'pveNodeCephConfigCrush',
		    title: gettext('Configuration'),
		    iconCls: 'fa fa-gear',
		    groups: ['ceph'],
		    itemId: 'ceph-config'
		},
		{
		    xtype: 'pveNodeCephMonList',
		    title: gettext('Monitor'),
		    iconCls: 'fa fa-tv',
		    groups: ['ceph'],
		    itemId: 'ceph-monlist'
		},
		{
		    xtype: 'pveNodeCephOsdTree',
		    title: 'OSD',
		    iconCls: 'fa fa-hdd-o',
		    groups: ['ceph'],
		    itemId: 'ceph-osdtree'
		},
		{
		    xtype: 'pveNodeCephPoolList',
		    title: 'Pools',
		    iconCls: 'fa fa-sitemap',
		    groups: ['ceph'],
		    itemId: 'ceph-pools'
		}
	    );
	}

	if (caps.nodes['Sys.Syslog']) {
	    me.items.push(
		{
		    xtype: 'pveLogView',
		    title: gettext('Log'),
		    iconCls: 'fa fa-list',
		    groups: ['firewall'],
		    onlineHelp: 'chapter_pve_firewall',
		    url: '/api2/extjs/nodes/' + nodename + '/firewall/log',
		    itemId: 'firewall-fwlog'
		},
		{
		    title: gettext('Log'),
		    itemId: 'ceph-log',
		    iconCls: 'fa fa-list',
		    groups: ['ceph'],
		    onlineHelp: 'chapter_pveceph',
		    xtype: 'pveLogView',
		    url: "/api2/extjs/nodes/" + nodename + "/ceph/log"
		});
	}

	me.items.push(
	    {
		title: gettext('Task History'),
		iconCls: 'fa fa-list',
		itemId: 'tasks',
		xtype: 'pveNodeTasks'
	    },
	    {
		title: gettext('Subscription'),
		iconCls: 'fa fa-support',
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
