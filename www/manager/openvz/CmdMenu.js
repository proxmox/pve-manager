Ext.define('PVE.openvz.CmdMenu', {
    extend: 'Ext.menu.Menu',

    initComponent: function() {
	var me = this;

	var nodename = me.pveSelNode.data.node;
	if (!nodename) {
	    throw "no node name specified";
	}

	var vmid = me.pveSelNode.data.vmid;
	if (!vmid) {
	    throw "no CT ID specified";
	}

	var vmname = me.pveSelNode.data.name;

	var vm_command = function(cmd, params) {
	    PVE.Utils.API2Request({
		params: params,
		url: '/nodes/' + nodename + '/openvz/' + vmid + "/status/" + cmd,
		method: 'POST',
		failure: function(response, opts) {
		    Ext.Msg.alert(gettext('Error'), response.htmlStatus);
		}
	    });
	};

	me.title = "CT " + vmid;

	me.items = [
	    {
		text: gettext('Start'),
		icon: '/pve2/images/start.png',
		handler: function() {
		    vm_command('start');
		}
	    },
	    { 
		text: gettext('Migrate'),
		icon: '/pve2/images/forward.png',
		handler: function() {
		    var win = Ext.create('PVE.window.Migrate', {
			vmtype: 'openvz',
			nodename: nodename,
			vmid: vmid
		    });
		    win.show();
		}
	    },
	    {
		text: gettext('Suspend'),
		icon: '/pve2/images/forward.png',
		handler: function() {
		    var msg = Ext.String.format(gettext("Do you really want to suspend CT {0}?"), vmid);
		    Ext.Msg.confirm(gettext('Confirm'), msg, function(btn) {
			if (btn !== 'yes') {
			    return;
			}
			
			vm_command('suspend');
		    });
		}
	    },
	    {
		text: gettext('Resume'),
		icon: '/pve2/images/forward.png',
		handler: function() {
		    vm_command('resume');
		}
	    },
	    {
		text: gettext('Shutdown'),
		icon: '/pve2/images/stop.png',
		handler: function() {
		    var msg = Ext.String.format(gettext("Do you really want to shutdown CT {0}?"), vmid);
		    Ext.Msg.confirm(gettext('Confirm'), msg, function(btn) {
			if (btn !== 'yes') {
			    return;
			}

			vm_command('shutdown');
		    });
		}			    
	    },
	    {
		text: gettext('Stop'),
		icon: '/pve2/images/gtk-stop.png',
		handler: function() {
		    var msg = Ext.String.format(gettext("Do you really want to stop CT {0}?"), vmid);
		    Ext.Msg.confirm(gettext('Confirm'), msg, function(btn) {
			if (btn !== 'yes') {
			    return;
			}

			vm_command("stop");
		    });
		}
	    },
	    {
		text: gettext('Console'),
		icon: '/pve2/images/display.png',
		handler: function() {
		    PVE.Utils.openDefaultConsoleWindow(true, 'openvz', vmid, nodename, vmname);
		}
	    }
	];

	me.callParent();
    }
});
