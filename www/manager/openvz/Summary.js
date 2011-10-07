Ext.define('PVE.openvz.Summary', {
    extend: 'Ext.panel.Panel',
    alias: 'widget.pveOpenVZSummary',

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

	if (!me.workspace) {
	    throw "no workspace specified";
	}

	var statusview = Ext.create('PVE.openvz.StatusView', {
	    title: 'Status',
	    pveSelNode: me.pveSelNode,
	    width: 400
	});

	var rstore = statusview.rstore;

	var rrdurl = "/api2/png/nodes/" + nodename + "/openvz/" + vmid + "/rrd";

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

	var tbar = Ext.create('Ext.toolbar.Toolbar', {
	    items: [
		{ 
		    itemId: 'start',
		    text: 'Start',
		    handler: function() {
			vm_command('start');
		    }			    
		}, 
		{ 
		    itemId: 'stop',
		    text: 'Stop',
		    handler: function() {
			var msg = "Do you really want to stop the VM?";
			Ext.Msg.confirm('Confirm', msg, function(btn) {
			    if (btn !== 'yes') {
				return;
			    }
			    vm_command("stop", { fast: 1 });
			}); 
		    }
		},
		{ 
		    itemId: 'shutdown',
		    text: 'Shutdown',
		    handler: function() {
			var msg = "Do you really want to shutdown the VM?";
			Ext.Msg.confirm('Confirm', msg, function(btn) {
			    if (btn !== 'yes') {
				return;
			    }
			    vm_command('stop');
			});
		    }			    
		}, 
		{ 
		    itemId: 'remove',
		    text: 'Remove',
		    handler: function() {
			var msg = 'Are you sure you want to remove VM ' + 
			    vmid + '? This will permanently erase all VM data.';
			Ext.Msg.confirm('Confirm', msg, function(btn) {
			    if (btn !== 'yes') {
				return;
			    }
			    PVE.Utils.API2Request({
				url: '/nodes/' + nodename + '/openvz/' + vmid,
				method: 'DELETE',
				waitMsgTarget: me,
				failure: function(response, opts) {
				    Ext.Msg.alert('Error', response.htmlStatus);
				}
			    });
			}); 
		    }
		},
		{ 
		    itemId: 'console',
		    text: 'Console',
		    handler: function() {
			var url = Ext.urlEncode({
			    console: 'openvz',
			    vmid: vmid,
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
	    var status;
	    if (!success) {
		me.workspace.checkVmMigration(me.pveSelNode);
		status = 'unknown';
	    } else {
		var rec = s.data.get('status');
		status = rec ? rec.data.value : 'unknown';
	    }

	    tbar.down('#start').setDisabled(status === 'running');
	    tbar.down('#shutdown').setDisabled(status !== 'running');
	    tbar.down('#stop').setDisabled(status === 'stopped');
	    tbar.down('#console').setDisabled(status !== 'running');
	    tbar.down('#remove').setDisabled(status !== 'stopped');
	});

	var notesview = Ext.create('PVE.panel.NotesView', {
	    pveSelNode: me.pveSelNode,
	    flex: 1
	});

	Ext.apply(me, {
	    tbar: tbar,
	    autoScroll: true,
	    bodyStyle: 'padding:10px',
	    defaults: {
		style: 'padding-top:10px',
		width: 800
	    },		
	    items: [
		{
		    style: 'padding-top:0px',
		    layout: {
			type: 'hbox',
			align: 'stretchmax'
		    },
		    border: false,
		    items: [ statusview, notesview ]
		},
		{
		    xtype: 'pveRRDView',
		    title: "CPU usage %",
		    pveSelNode: me.pveSelNode,
		    datasource: 'cpu',
		    rrdurl: rrdurl
		},
		{
		    xtype: 'pveRRDView',
		    title: "Memory usage",
		    pveSelNode: me.pveSelNode,
		    datasource: 'mem,maxmem',
		    rrdurl: rrdurl
		},
		{
		    xtype: 'pveRRDView',
		    title: "Network traffic",
		    pveSelNode: me.pveSelNode,
		    datasource: 'netin,netout',
		    rrdurl: rrdurl
		},
		{
		    xtype: 'pveRRDView',
		    title: "Disk IO",
		    pveSelNode: me.pveSelNode,
		    datasource: 'diskread,diskwrite',
		    rrdurl: rrdurl
		}
	    ]
	});

	me.on('show', function() {
	    rstore.startUpdate();
	    notesview.load();
	});

	me.on('hide', rstore.stopUpdate);
	me.on('destroy', rstore.stopUpdate);	

	me.callParent();
    }
});
