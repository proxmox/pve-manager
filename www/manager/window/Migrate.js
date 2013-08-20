Ext.define('PVE.window.Migrate', {
    extend: 'Ext.window.Window',

    resizable: false,

    migrate: function(target, online) {
	var me = this;
	PVE.Utils.API2Request({
	    params: { target: target, online: online },
	    url: '/nodes/' + me.nodename + '/' + me.vmtype + '/' + me.vmid + "/migrate",
	    waitMsgTarget: me,
	    method: 'POST',
	    failure: function(response, opts) {
		Ext.Msg.alert(gettext('Error'), response.htmlStatus);
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

	if (!me.nodename) {
	    throw "no node name specified";
	}

	if (!me.vmid) {
	    throw "no VM ID specified";
	}

	if (!me.vmtype) {
	    throw "no VM type specified";
	}

	var running = false;
	var vmrec = PVE.data.ResourceStore.findRecord('vmid', me.vmid,
						      0, false, false, true);
	if (vmrec && vmrec.data && vmrec.data.running) {
	    running = true;
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
		    fieldLabel: gettext('Target node'),
		    allowBlank: false,
		    onlineValidator: true
		},
		{
		    xtype: 'pvecheckbox',
		    name: 'online',
		    uncheckedValue: 0,
		    defaultValue: 0,
		    checked: running,
		    fieldLabel: gettext('Online')
		}
	    ]
	});

	var form = me.formPanel.getForm();

	var submitBtn = Ext.create('Ext.Button', {
	    text: gettext('Migrate'),
	    handler: function() {
		var values = form.getValues();
		me.migrate(values.target, values.online);
	    }
	});

	Ext.apply(me, {
	    title: gettext('Migrate VM') + " " + me.vmid,
	    width: 350,
	    modal: true,
	    layout: 'auto',
	    border: false,
	    items: [ me.formPanel ],
	    buttons: [ submitBtn ]
	});

	me.callParent();
    }
});
