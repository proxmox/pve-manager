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

	var shellBtn = Ext.create('Ext.Button', { 
	    text: gettext('Shell'),
	    disabled: !caps.nodes['Sys.Console'],
	    handler: function() {
		var url = Ext.urlEncode({
		    console: 'shell',
		    node: nodename
		});
		var nw = window.open("?" + url, '_blank', 
				     "innerWidth=745,innerheight=427");
		nw.focus();
	    }
	}); 

	me.items = [];

	Ext.apply(me, {
	    title: gettext('Node') + " '" + nodename + "'",
	    hstateid: 'nodetab',
	    defaults: { statusStore: me.statusStore },
	    tbar: [ restartBtn, shutdownBtn, shellBtn ]
	});

	if (caps.nodes['Sys.Audit']) {
	    me.items.push([
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
	    ]);
	}

	if (caps.nodes['Sys.Syslog']) {
	    me.items.push([
		{
		    title: 'Syslog',
		    itemId: 'syslog',
		    xtype: 'pveLogView',
		    url: "/api2/extjs/nodes/" + nodename + "/syslog"
		}
	    ]);
	    me.items.push([
		{
		    title: 'Bootlog',
		    itemId: 'bootlog',
		    xtype: 'pveLogView',
		    url: "/api2/extjs/nodes/" + nodename + "/bootlog"
		}
	    ]);
	}

	me.items.push([
	    {
		title: gettext('Task History'),
		itemId: 'tasks',
		xtype: 'pveNodeTasks'
	    }
	]);


	if (caps.nodes['Sys.Audit']) {
	    me.items.push([
		{
		    title: 'UBC',
		    itemId: 'ubc',
		    xtype: 'pveNodeBCFailCnt'
		}
	    ]);
	}
	
	me.items.push([
	    {
		title: gettext('Subscription'),
		itemId: 'support',
		xtype: 'pveNodeSubscription',
		nodename: nodename
	    }
	]);

	if (caps.nodes['Sys.Console']) {
	    me.items.push([{
		title: gettext('Updates'),
		itemId: 'apt',
		xtype: 'pveNodeAPT',
		nodename: nodename
	    }]);
	    me.items.push([{
		title: 'Ceph',
		itemId: 'ceph',
		xtype: 'pveNodeCeph',
		phstateid: me.hstateid,
		nodename: nodename
	    }]);
	}

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
