Ext.define('PVE.node.Summary', {
    extend: 'Ext.panel.Panel',
    alias: 'widget.pveNodeSummary',

    showVersions: function() {
	var me = this;

	// Note: we use simply text/html here, because ExtJS grid has problems
	// with cut&paste

	var nodename = me.pveSelNode.data.node;

	var view = Ext.createWidget('component', {
	    autoScroll: true,
	    style: {
		'background-color': 'white',
		'white-space': 'pre',
		'font-family': 'monospace',
		padding: '5px'
	    }
	});

	var win = Ext.create('Ext.window.Window', {
	    title: gettext('Package versions'),
	    width: 600,
	    height: 400,
	    layout: 'fit',
	    modal: true,
	    items: [ view ] 
	});

	PVE.Utils.API2Request({
	    waitMsgTarget: me,
	    url: "/nodes/" + nodename + "/apt/versions",
	    method: 'GET',
	    failure: function(response, opts) {
		win.close();
		Ext.Msg.alert(gettext('Error'), response.htmlStatus);
	    },
	    success: function(response, opts) {
		win.show();
		var text = '';

		Ext.Array.each(response.result.data, function(rec) {
		    var version = "not correctly installed";
		    var pkg = rec.Package;
		    if (rec.OldVersion && rec.CurrentState === 'Installed') {
			version = rec.OldVersion;
		    }
		    if (rec.RunningKernel) {
			text += pkg + ': ' + version + ' (running kernel: ' +
			    rec.RunningKernel + ')\n'; 
		    } else if (rec.ManagerVersion) {
			text += pkg + ': ' + version + ' (running version: ' +
			    rec.ManagerVersion + ')\n'; 
		    } else {
			text += pkg + ': ' + version + '\n'; 
		    }
		});

		view.update(Ext.htmlEncode(text));
	    }
	});
    },

    initComponent: function() {
        var me = this;

	var nodename = me.pveSelNode.data.node;
	if (!nodename) {
	    throw "no node name specified";
	}

	if (!me.statusStore) {
	    throw "no status storage specified";
	}

	var rstore = me.statusStore;

	var statusview = Ext.create('PVE.node.StatusView', {
	    title: gettext('Status'),
	    pveSelNode: me.pveSelNode,
	    style: { 'padding-top': '0px' },
	    rstore: rstore
	});

	var rrdurl = "/api2/png/nodes/" + nodename + "/rrd";
  
	var version_btn = new Ext.Button({
	    text: gettext('Package versions'),
	    handler: function(){
		PVE.Utils.checked_command(function() { me.showVersions(); });
	    }
	});

	Ext.apply(me, {
	    autoScroll: true,
	    bodyStyle: 'padding:10px',
	    defaults: {
		width: 800,
		style: { 'padding-top': '10px' }
	    },		
	    tbar: [version_btn, '->', { xtype: 'pveRRDTypeSelector' } ],
	    items: [
		statusview,
		{
		    xtype: 'pveRRDView',
		    title: gettext('CPU usage'),
		    datasource: 'cpu,iowait',
		    rrdurl: rrdurl
		},
		{
		    xtype: 'pveRRDView',
		    title: gettext('Server load'),
		    datasource: 'loadavg',
		    rrdurl: rrdurl
		},
		{
		    xtype: 'pveRRDView',
		    title: gettext('Memory usage'),
		    datasource: 'memtotal,memused',
		    rrdurl: rrdurl
		},
		{
		    xtype: 'pveRRDView',
		    title: gettext('Network traffic'),
		    datasource: 'netin,netout',
		    rrdurl: rrdurl
		}
	    ],
	    listeners: {
		show: rstore.startUpdate,
		hide: rstore.stopUpdate,
		destroy: rstore.stopUpdate
	    }
	});

	me.callParent();
    }
});
