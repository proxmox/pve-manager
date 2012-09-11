Ext.define('PVE.window.Snapshot', {
    extend: 'Ext.window.Window',

    resizable: false,

    take_snapshot: function(snapname, descr, vmstate) {
	var me = this;
	var params = { snapname: snapname, vmstate: vmstate ? 1 : 0 };
	if (descr) {
	    params.description = descr;
	}
	PVE.Utils.API2Request({
	    params: params,
	    url: '/nodes/' + me.nodename + '/qemu/' + me.vmid + "/snapshot",
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

    update_snapshot: function(snapname, descr) {
	var me = this;
	PVE.Utils.API2Request({
	    params: { description: descr },
	    url: '/nodes/' + me.nodename + '/qemu/' + me.vmid + "/snapshot/" + 
		snapname + '/config',
	    waitMsgTarget: me,
	    method: 'PUT',
	    failure: function(response, opts) {
		Ext.Msg.alert('Error', response.htmlStatus);
	    },
	    success: function(response, options) {
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

	var items = [
	    {
		xtype: me.snapname ? 'displayfield' : 'textfield',
		name: 'snapname',
		value: me.snapname,
		fieldLabel: 'Snapshot Name',
		allowBlank: false
	    }
	];

	if (me.snapname) {
	    items.push({
		xtype: 'displayfield',
		name: 'snaptime',
		value: new Date(me.snaptime),
		fieldLabel: 'Timestamp'
	    });
	} else {
	    items.push({
		xtype: 'pvecheckbox',
		name: 'vmstate',
		uncheckedValue: 0,
		defaultValue: 0,
		checked: 1,
		fieldLabel: 'Include State'
	    });
	}

	items.push({
	    xtype: 'textareafield',
	    grow: true,
	    name: 'description',
	    value: me.description,
	    fieldLabel: 'Description'
	});

	me.formPanel = Ext.create('Ext.form.Panel', {
	    bodyPadding: 10,
	    border: false,
	    fieldDefaults: {
		labelWidth: 100,
		anchor: '100%'
	    },
	    items: items
	});

	var form = me.formPanel.getForm();

	var submitBtn;

	if (me.snapname) {
	    me.title = "Edit Snapshot '" + me.snapname + " of VM " + me.vmid;
	    submitBtn = Ext.create('Ext.Button', {
		text: gettext('Update'),
		handler: function() {
		    if (form.isValid()) {
			var values = form.getValues();
			me.update_snapshot(me.snapname, values.description);
		    }
		}
	    });
	} else {
	    me.title = "Take Snapshot of VM " + me.vmid;
	    submitBtn = Ext.create('Ext.Button', {
		text: 'Take Snapshot',
		handler: function() {
		    if (form.isValid()) {
			var values = form.getValues();
			me.take_snapshot(values.snapname, values.description, values.vmstate);
		    }
		}
	    });
	}

	Ext.apply(me, {
	    width: 450,
	    modal: true,
	    layout: 'auto',
	    border: false,
	    items: [ me.formPanel ],
	    buttons: [ submitBtn ]
	});

	me.callParent();
    }
});
