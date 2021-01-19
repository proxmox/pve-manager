Ext.define('PVE.menu.TemplateMenu', {
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

	var guestType = me.pveSelNode.data.type;
	if (guestType !== 'qemu' && guestType != 'lxc') {
	    throw "invalid guest type";
	}

	var vmname = me.pveSelNode.data.name;

	var template = me.pveSelNode.data.template;

	var vm_command = function(cmd, params) {
	    Proxmox.Utils.API2Request({
		params: params,
		url: '/nodes/' + nodename + '/' + guestType + '/' + vmid + "/status/" + cmd,
		method: 'POST',
		failure: function(response, opts) {
		    Ext.Msg.alert(gettext('Error'), response.htmlStatus);
		},
	    });
	};

	me.title = (guestType === 'qemu' ? 'VM ' : 'CT ') + vmid;

	me.items = [
	    {
		text: gettext('Migrate'),
		iconCls: 'fa fa-fw fa-send-o',
		handler: function() {
		    var win = Ext.create('PVE.window.Migrate', {
			vmtype: guestType,
			nodename: nodename,
			vmid: vmid,
		    });
		    win.show();
		},
	    },
	    {
		text: gettext('Clone'),
		iconCls: 'fa fa-fw fa-clone',
		handler: function() {
		    var win = Ext.create('PVE.window.Clone', {
			nodename: nodename,
			guestType: guestType,
			vmid: vmid,
			isTemplate: template,
		    });
		    win.show();
		},
	    },
	];

	me.callParent();
    },
});
