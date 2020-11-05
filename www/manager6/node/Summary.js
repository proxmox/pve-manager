Ext.define('PVE.node.Summary', {
    extend: 'Ext.panel.Panel',
    alias: 'widget.pveNodeSummary',

    scrollable: true,
    bodyPadding: 5,

    showVersions: function() {
	var me = this;

	// Note: we use simply text/html here, because ExtJS grid has problems
	// with cut&paste

	var nodename = me.pveSelNode.data.node;

	var view = Ext.createWidget('component', {
	    autoScroll: true,
	    padding: 5,
	    style: {
		'background-color': 'white',
		'white-space': 'pre',
		'font-family': 'monospace'
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

	Proxmox.Utils.API2Request({
	    waitMsgTarget: me,
	    url: `/nodes/${nodename}/apt/versions`,
	    method: 'GET',
	    failure: function(response, opts) {
		win.close();
		Ext.Msg.alert(gettext('Error'), response.htmlStatus);
	    },
	    success: function(response, opts) {
		win.show();
		let text = '';
		Ext.Array.each(response.result.data, function(rec) {
		    let version = "not correctly installed";
		    let pkg = rec.Package;
		    if (rec.OldVersion && rec.CurrentState === 'Installed') {
			version = rec.OldVersion;
		    }
		    if (rec.RunningKernel) {
			text += `${pkg}: ${version} (running kernel: ${rec.RunningKernel})\n`;
		    } else if (rec.ManagerVersion) {
			text += `${pkg}: ${version} (running version: ${rec.ManagerVersion})\n`;
		    } else {
			text += `${pkg}: ${version}\n`;
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

	var version_btn = new Ext.Button({
	    text: gettext('Package versions'),
	    handler: function(){
		Proxmox.Utils.checked_command(function() { me.showVersions(); });
	    }
	});

	var rrdstore = Ext.create('Proxmox.data.RRDStore', {
	    rrdurl: "/api2/json/nodes/" + nodename + "/rrddata",
	    model: 'pve-rrd-node'
	});

	Ext.apply(me, {
	    tbar: [version_btn, '->', { xtype: 'proxmoxRRDTypeSelector' } ],
	    items: [
		{
		    xtype: 'container',
		    itemId: 'itemcontainer',
		    layout: 'column',
		    minWidth: 700,
		    defaults: {
			minHeight: 320,
			padding: 5,
			columnWidth: 1
		    },
		    items: [
			{
			    xtype: 'pveNodeStatus',
			    rstore: rstore,
			    width: 770,
			    pveSelNode: me.pveSelNode
			},
			{
			    xtype: 'proxmoxRRDChart',
			    title: gettext('CPU usage'),
			    fields: ['cpu','iowait'],
			    fieldTitles: [gettext('CPU usage'), gettext('IO delay')],
			    store: rrdstore
			},
			{
			    xtype: 'proxmoxRRDChart',
			    title: gettext('Server load'),
			    fields: ['loadavg'],
			    fieldTitles: [gettext('Load average')],
			    store: rrdstore
			},
			{
			    xtype: 'proxmoxRRDChart',
			    title: gettext('Memory usage'),
			    fields: ['memtotal','memused'],
			    fieldTitles: [gettext('Total'), gettext('RAM usage')],
			    store: rrdstore
			},
			{
			    xtype: 'proxmoxRRDChart',
			    title: gettext('Network traffic'),
			    fields: ['netin','netout'],
			    store: rrdstore
			}
		    ],
		    listeners: {
			resize: function(panel) {
			    PVE.Utils.updateColumns(panel);
			},
		    },
		},
	    ],
	    listeners: {
		activate: function() {
		    rstore.setInterval(1000);
		    rstore.startUpdate(); // just to be sure
		    rrdstore.startUpdate();
		},
		destroy: function() {
		    rstore.setInterval(5000); // don't stop it, it's not ours!
		    rrdstore.stopUpdate();
		},
	    }
	});

	me.callParent();

	let sp = Ext.state.Manager.getProvider();
	me.mon(sp, 'statechange', function(provider, key, value) {
	    if (key !== 'summarycolumns') {
		return;
	    }
	    PVE.Utils.updateColumns(me.getComponent('itemcontainer'));
	});
    }
});
