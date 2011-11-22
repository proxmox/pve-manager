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

	var restartBtn = Ext.create('PVE.button.Button', {
	    text: gettext('Restart'),
	    confirmMsg: Ext.String.format(gettext("Do you really want to restart node {0}?"), nodename),
	    handler: function() { 
		node_command('reboot');
	    }
	});

	var shutdownBtn = Ext.create('PVE.button.Button', {
	    text: gettext('Shutdown'),
	    confirmMsg: Ext.String.format(gettext("Do you really want to shutdown node {0}?"), nodename),
	    handler: function() { 
		node_command('shutdown');
	    }
	});

	var shellBtn = Ext.create('Ext.Button', { 
	    text: gettext('Shell'),
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
	    title: gettext('Node') + " '" + nodename + "'",
	    hstateid: 'nodetab',
	    defaults: { statusStore: me.statusStore },
	    tbar: [ restartBtn, shutdownBtn, shellBtn ],
	    items: [
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
		    title: 'DNS',
		    itemId: 'dns',
		    xtype: 'pveNodeDNSView'
		},
		{
		    title: gettext('Time'),
		    itemId: 'time',
		    xtype: 'pveNodeTimeView'
		},
		{
		    title: 'Syslog',
		    itemId: 'syslog',
		    xtype: 'pveLogView',
		    url: "/api2/extjs/nodes/" + nodename + "/syslog"
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

	    restartBtn.setDisabled(!uptime);
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
