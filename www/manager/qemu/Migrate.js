Ext.define('PVE.qemu.Migrate', {
    extend: 'Ext.window.Window',

    resizable: false,

    migrate: function(vmid, nodename, target, online) {
	var me = this;
	PVE.Utils.API2Request({
	    params: { target: target, online: online },
	    url: '/nodes/' + nodename + '/qemu/' + vmid + "/migrate",
	    waitMsgTarget: me,
	    method: 'POST',
	    failure: function(response, opts) {
		Ext.Msg.alert('Error', response.htmlStatus);
	    },
	    success: function(response, options) {
		var upid = response.result.data;

		var win = Ext.create('PVE.window.TaskViewer', { 
		    upid: upid
		});
		win.show();
		me.close();
	    }
	});
    },

    initComponent : function() {
	var me = this;

	var nodename = me.pveSelNode.data.node;
	if (!nodename) {
	    throw "no node name specified";
	}

	var vmid = me.pveSelNode.data.vmid;
	if (!vmid) {
	    throw "no VM ID specified";
	}

	me.formPanel = Ext.create('Ext.form.Panel', {
	    bodyPadding: 10,
	    border: false,
	    fieldDefaults: {
		labelWidth: 100,
		anchor: '100%'
	    },
	    items: [
		{
		    xtype: 'PVE.form.NodeSelector',
		    name: 'target',
		    fieldLabel: 'Target node',
		    allowBlank: false,
		    onlineValidator: true
		},
		{
		    xtype: 'pvecheckbox',
		    name: 'online',
		    uncheckedValue: 0,
		    defaultValue: 0,
		    fieldLabel: 'Online'
		}
	    ]
	});

	var form = me.formPanel.getForm();

	var submitBtn = Ext.create('Ext.Button', {
	    text: 'Migrate',
	    handler: function() {
		var values = form.getValues();
		console.log("STARTMIGRATE " + vmid + " " + values.target + " " + values.online);
		me.migrate(vmid, nodename, values.target, values.online);
	    }
	});

	Ext.apply(me, {
	    title: "Migrate KVM " + vmid,
	    width: 350,
	    modal: true,
	    layout: 'auto',
	    border: false,
	    items: [ me.formPanel ],
	    buttons: [ submitBtn ],
	});

	me.callParent();
    }
});
