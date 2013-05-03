Ext.define('PVE.qemu.TemplateMenu', {
    extend: 'Ext.menu.Menu',

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

	var vmname = me.pveSelNode.data.name;

	var template = me.pveSelNode.data.template;

	var vm_command = function(cmd, params) {
	    PVE.Utils.API2Request({
		params: params,
		url: '/nodes/' + nodename + '/qemu/' + vmid + "/status/" + cmd,
		method: 'POST',
		failure: function(response, opts) {
		    Ext.Msg.alert('Error', response.htmlStatus);
		}
	    });
	};

	me.title = "VM " + vmid;

	me.items = [
	    {
		text: gettext('Migrate'),
		icon: '/pve2/images/forward.png',
		handler: function() {
		    var win = Ext.create('PVE.window.Migrate', {
			vmtype: 'qemu',
			nodename: nodename,
			vmid: vmid
		    });
		    win.show();
		}
	    },
	    {
		text: gettext('Clone'),
		icon: '/pve2/images/forward.png',
		handler: function() {
		    var clonefeature;
		    //check if linked clone feature is available
		    var params = { feature: 'clone' };

		    PVE.Utils.API2Request({
			waitMsgTarget: me,
			url: '/nodes/' + nodename + '/qemu/' + vmid + '/feature',
			params: params,
			method: 'GET',
			success: function(response, options) {
			    var res = response.result.data;
			    if (res === 1) {
				clonefeature = 1;
			    }
			    var win = Ext.create('PVE.window.Clone', {
				snapname: 'current',
				nodename: nodename,
				vmid: vmid,
				istemplate: template,
				clonefeature: clonefeature
			    });
			    win.show();
			}
		    });
		}
	    }
	];

	me.callParent();
    }
});
