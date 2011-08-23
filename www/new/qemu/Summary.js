Ext.define('PVE.qemu.Summary', {
    extend: 'Ext.panel.Panel',
    alias: 'widget.pveQemuSummary',

    initComponent: function() {
        var me = this;

	var nodename = me.pveSelNode.data.node;
	if (!nodename) 
	    throw "no node name specified";

	var vmid = me.pveSelNode.data.vmid;
	if (!vmid) 
	    throw "no VM ID specified";

	var statusview = Ext.create('PVE.qemu.StatusView', {
	    title: 'Status',
	    pveSelNode: me.pveSelNode,
	    width: 400
	})

	rstore = statusview.rstore;

	var rrdurl = "/api2/png/nodes/" + nodename + "/qemu/" + vmid + "/rrd";

	var vm_command = function(cmd) {
	    me.setLoading(true, true);
	    PVE.Utils.API2Request({
		params: { command: cmd },
		url: '/nodes/' + nodename + '/qemu/' + vmid + "/status",
		method: 'PUT',
		callback: function() {
		    me.setLoading(false);
		},
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
			    if (btn !== 'yes')
				return;
			    vm_command("stop");
			}); 
		    }
		},
		{ 
		    text: 'Reset',
		    itemId: 'reset',
		    handler: function() { 
			var msg = "Do you really want to reset the VM?";
			Ext.Msg.confirm('Confirm', msg, function(btn) {
			    if (btn !== 'yes')
				return;
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
			    if (btn !== 'yes')
				return;
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
			    if (btn !== 'yes')
				return;
			    
			    me.setLoading(true, true);
			    PVE.Utils.API2Request({
				url: '/nodes/' + nodename + '/qemu/' + vmid,
				method: 'DELETE',
				callback: function() {
				    me.setLoading(false);
				},
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
	    var statusrec = s.data.get('status');
	    var status = statusrec ? statusrec.data.value : 'unknown';

	    tbar.down('#start').setDisabled(status === 'running');
	    tbar.down('#reset').setDisabled(status !== 'running');
	    tbar.down('#shutdown').setDisabled(status !== 'running');
	    tbar.down('#stop').setDisabled(status === 'stopped');
	    tbar.down('#console').setDisabled(status !== 'running');
	    tbar.down('#remove').setDisabled(status !== 'stopped');
	});

	Ext.apply(me, {
	    tbar: tbar,
	    layout: {
		type: 'table',
		columns: 1
	    },
	    autoScroll: true,
	    bodyStyle: 'padding:10px',
	    defaults: {
		style: 'padding-bottom:10px'
	    },		
	    items: [
		{
		    layout: {
			type: 'hbox',
			align: 'stretchmax'
		    },
		    width: 800,
		    border: false,
		    items: [
			statusview,
			{
			    title: 'Comments',
			    style: 'padding-left:10px',
			    pveSelNode: me.pveSelNode,
			    rstore: rstore,
			    html: "test",
			    width: 400
			}
		    ]
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
		}
	    ]
	});

	me.on('show', rstore.startUpdate);
	me.on('hide', rstore.stopUpdate);
	me.on('destroy', rstore.stopUpdate);	

 	me.callParent();
    }
});
