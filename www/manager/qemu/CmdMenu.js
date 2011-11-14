Ext.define('PVE.qemu.CmdMenu', {
    extend: 'Ext.menu.Menu',

    initComponent: function() {
	var me = this;

	if (!me.nodename) {
	    throw "no node name specified";
	}

	if (!me.vmid) {
	    throw "no VM ID specified";
	}

	var vm_command = function(cmd, params) {
	    PVE.Utils.API2Request({
		params: params,
		url: '/nodes/' + me.nodename + '/qemu/' + me.vmid + "/status/" + cmd,
		method: 'POST',
		failure: function(response, opts) {
		    Ext.Msg.alert('Error', response.htmlStatus);
		}
	    });
	};

	me.title = "VM " + me.vmid;

	me.items = [
	    {
		text: 'Start',
		icon: '/pve2/images/start.png',
		handler: function() {
		    vm_command('start');
		}
	    },
	    {
		text: 'Shutdown',
		icon: '/pve2/images/stop.png',
		handler: function() {
		    var msg = "Do you really want to shutdown the VM?";
		    Ext.Msg.confirm('Confirmation', msg, function(btn) {
			if (btn !== 'yes') {
			    return;
			}

			vm_command('shutdown', { timeout: 30 });
		    });
		}			    
	    },
	    {
		text: 'Console',
		icon: '/pve2/images/display.png',
		handler: function() {
		    PVE.Utils.openConoleWindow('kvm', me.vmid, me.nodename);
		}
	    }
	];

	me.callParent();
    }
});
