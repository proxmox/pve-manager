Ext.define('PVE.window.MigrateAll', {
    extend: 'Ext.window.Window',

    resizable: false,

    migrate: function(target, maxworkers) {
	var me = this;
	PVE.Utils.API2Request({
	    params: { target: target, maxworkers: maxworkers},
	    url: '/nodes/' + me.nodename + '/' + "/migrateall",
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

	if (!me.nodename) {
	    throw "no node name specified";
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
		    xtype: 'pveNodeSelector',
		    name: 'target',
		    disallowedNodes: [me.nodename],
		    fieldLabel: 'Target node',
		    allowBlank: false,
		    onlineValidator: true
		},
		{
		    xtype: 'pveIntegerField',
		    name: 'maxworkers',
		    minValue: 1,
		    maxValue: 100,
		    value: 1,
		    fieldLabel: 'Parallel jobs',
		    allowBlank: false
		}
	    ]
	});

	var form = me.formPanel.getForm();

	var submitBtn = Ext.create('Ext.Button', {
	    text: 'Migrate',
	    handler: function() {
		var values = form.getValues();
		me.migrate(values.target, values.maxworkers);
	    }
	});

	Ext.apply(me, {
	    title: "Migrate All VMs",
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
