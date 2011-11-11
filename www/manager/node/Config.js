Ext.define('PVE.node.Config', {
    extend: 'PVE.panel.Config',
    alias: 'widget.PVE.node.Config',

    initComponent: function() {
        var me = this;

	var nodename = me.pveSelNode.data.node;
	if (!nodename) {
	    throw "no node name specified";
	}

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
		    Ext.Msg.alert('Error', response.htmlStatus);
		}
	    });
	};

	var rebootBtn = Ext.create('PVE.button.Button', {
	    text: 'Reboot',
	    confirmMsg: "Do you really want to reboot node '" + nodename + "'?",
	    handler: function() { 
		node_command('reboot');
	    }
	});

	var shutdownBtn = Ext.create('PVE.button.Button', {
	    text: 'Shutdown',
	    confirmMsg: "Do you really want to shutdown node '" + nodename + "'?",
	    handler: function() { 
		node_command('shutdown');
	    }
	});

	var shellBtn = Ext.create('Ext.Button', { 
	    text: 'Shell',
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

	Ext.apply(me, {
	    title: "Node '" + nodename + "'",
	    hstateid: 'nodetab',
	    defaults: { statusStore: me.statusStore },
	    tbar: [ rebootBtn, shutdownBtn, shellBtn ],
	    items: [
		{
		    title: 'Summary',
		    itemId: 'summary',
		    xtype: 'pveNodeSummary'
		},
		{
		    title: 'Services',
		    itemId: 'services',
		    xtype: 'pveNodeServiceView'
		},
		{
		    title: 'Network',
		    itemId: 'network',
		    xtype: 'pveNodeNetworkView'
		},
		{
		    title: 'DNS',
		    itemId: 'dns',
		    xtype: 'pveNodeDNSView'
		},
		{
		    title: 'Time',
		    itemId: 'time',
		    xtype: 'pveNodeTimeView'
		},
		{
		    title: 'Syslog',
		    itemId: 'syslog',
		    xtype: 'pveLogView',
		    url: "/api2/json/nodes/" + nodename + "/syslog"
		},
		{
		    title: 'Task History',
		    itemId: 'tasks',
		    xtype: 'pveNodeTasks'
		},
		{
		    title: 'UBC',
		    itemId: 'ubc',
		    xtype: 'pveNodeBCFailCnt'
		}
	    ]
	});

	me.callParent();

	me.statusStore.on('load', function(s, records, success) {
	    var uptimerec = s.data.get('uptime');
	    var uptime = uptimerec ? uptimerec.data.value : false;

	    rebootBtn.setDisabled(!uptime);
	    shutdownBtn.setDisabled(!uptime);
	    shellBtn.setDisabled(!uptime);
	});

	me.on('afterrender', function() {
	    me.statusStore.startUpdate();
	});

	me.on('destroy', function() {
	    me.statusStore.stopUpdate();
	});
    }
});
