Ext.define('PVE.node.Summary', {
    extend: 'Ext.panel.Panel',
    alias: 'widget.pveNodeSummary',

    initComponent: function() {
        var me = this;

	var nodename = me.pveSelNode.data.node;
	if (!nodename) {
	    throw "no node name specified";
	}

	var statusview = Ext.create('PVE.node.StatusView', {
	    title: 'Status',
	    pveSelNode: me.pveSelNode,
	    style: 'padding-top:0px'
	});

	var rstore = statusview.rstore;

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

	var rrdurl = "/api2/png/nodes/" + nodename + "/rrd";
  
	var tbar = Ext.create('Ext.toolbar.Toolbar', {
	    items: [
		{
		    itemId: 'reboot',
		    text: 'Reboot',
		    handler: function() { 
			var msg = "Do you really want to reboot node '" + nodename + "'?";
			Ext.Msg.confirm('Confirm', msg, function(btn) {
			    if (btn !== 'yes') {
				return;
			    }
			    node_command('reboot');
			});
		    }
		},
		{ 
		    itemId: 'shutdown',
		    text: 'Shutdown', 
		    handler: function() { 
			var msg = "Do you really want to shutdown node '" + nodename + "'?";
			Ext.Msg.confirm('Confirm', msg, function(btn) {
			    if (btn !== 'yes') {
				return;
			    }
			    node_command('shutdown');
			});
		    }
		},
		{ 
		    itemId: 'shell',
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
		}, '->',
		{
		    xtype: 'pveRRDTypeSelector'
		}
	    ]
	});

	me.mon(rstore, 'load', function(s, records, success) {
	    var uptimerec = s.data.get('uptime');
	    var uptime = uptimerec ? uptimerec.data.value : false;

	    tbar.down('#reboot').setDisabled(!uptime);
	    tbar.down('#shutdown').setDisabled(!uptime);
	    tbar.down('#shell').setDisabled(!uptime);
	});

	Ext.apply(me, {
	    autoScroll: true,
	    bodyStyle: 'padding:10px',
	    defaults: {
		width: 800,
		style: 'padding-top:10px'
	    },		
	    tbar: tbar,
	    items: [
		statusview,
		{
		    xtype: 'pveRRDView',
		    title: "CPU usage %",
		    datasource: 'cpu,iowait',
		    rrdurl: rrdurl
		},
		{
		    xtype: 'pveRRDView',
		    title: "Server load",
		    datasource: 'loadavg',
		    rrdurl: rrdurl
		},
		{
		    xtype: 'pveRRDView',
		    title: "Memory usage",
		    datasource: 'memtotal,memused',
		    rrdurl: rrdurl
		},
		{
		    xtype: 'pveRRDView',
		    title: "Network traffic",
		    datasource: 'netin,netout',
		    rrdurl: rrdurl
		}
	    ]
	});

	me.on('show', rstore.startUpdate);
	me.on('hide', rstore.stopUpdate);
	me.on('destroy', rstore.stopUpdate);	

	me.callParent();
    }
});
