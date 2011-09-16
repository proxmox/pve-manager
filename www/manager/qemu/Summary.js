Ext.define('PVE.qemu.Summary', {
    extend: 'Ext.panel.Panel',
    alias: 'widget.pveQemuSummary',

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

	var statusview = Ext.create('PVE.qemu.StatusView', {
	    title: 'Status',
	    pveSelNode: me.pveSelNode,
	    width: 400
	});

	var rstore = statusview.rstore;

	var rrdurl = "/api2/png/nodes/" + nodename + "/qemu/" + vmid + "/rrd";

	var vm_command = function(cmd) {
	    PVE.Utils.API2Request({
		params: { command: cmd },
		url: '/nodes/' + nodename + '/qemu/' + vmid + "/status",
		waitMsgTarget: me,
		method: 'PUT',
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
			    vm_command("stop");
			}); 
		    }
		},
		{ 
		    itemId: 'migrate',
		    text: 'Migrate',
		    handler: function() {
			var win = Ext.create('PVE.qemu.Migrate', { 
			    pveSelNode: me.pveSelNode,
			});
			win.show();
		    }    
		}, 
		{ 
		    text: 'Reset',
		    itemId: 'reset',
		    handler: function() { 
			var msg = "Do you really want to reset the VM?";
			Ext.Msg.confirm('Confirm', msg, function(btn) {
			    if (btn !== 'yes') {
				return;
			    }
			    vm_command("reset");
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
			    vm_command('shutdown');
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
				url: '/nodes/' + nodename + '/qemu/' + vmid,
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
			    console: 'kvm',
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
		me.workspace.check_vm_migration(me.pveSelNode);
		status = 'unknown';
	    } else {
		var rec = s.data.get('status');
		status = rec ? rec.data.value : 'unknown';
	    }

	    tbar.down('#start').setDisabled(status === 'running');
	    tbar.down('#reset').setDisabled(status !== 'running');
	    tbar.down('#shutdown').setDisabled(status !== 'running');
	    tbar.down('#stop').setDisabled(status === 'stopped');
	    tbar.down('#console').setDisabled(status !== 'running');
	    tbar.down('#remove').setDisabled(status !== 'stopped');
	});

	var notesview = Ext.create('PVE.qemu.NotesView', {
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
