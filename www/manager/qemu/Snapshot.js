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
		var win = Ext.create('PVE.window.TaskProgress', { upid: upid });
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

	var summarystore = Ext.create('Ext.data.Store', {
	    model: 'KeyValue',
	    sorters: [
		{
		    property : 'key',
		    direction: 'ASC'
		}
	    ]
	});

	var items = [
	    {
		xtype: me.snapname ? 'displayfield' : 'textfield',
		name: 'snapname',
		value: me.snapname,
		fieldLabel: 'Snapshot Name',
		vtype: 'StorageId',
		allowBlank: false
	    }
	];

	if (me.snapname) {
	    items.push({
		xtype: 'displayfield',
		name: 'snaptime',
		fieldLabel: 'Timestamp'
	    });
	} else {
	    items.push({
		xtype: 'pvecheckbox',
		name: 'vmstate',
		uncheckedValue: 0,
		defaultValue: 0,
		checked: 1,
		fieldLabel: 'Include RAM'
	    });
	}

	items.push({
	    xtype: 'textareafield',
	    grow: true,
	    name: 'description',
	    fieldLabel: 'Description'
	});

	me.formPanel = Ext.create('Ext.form.Panel', {
	    bodyPadding: 10,
	    border: false,
	    region: 'north',
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

	if (me.snapname) {
	    Ext.apply(me, {
		layout: 'border',
		border: false,
		width: 620,
		height: 400,
		items: [
		    me.formPanel,
		    {
			title: gettext('Settings'),
			xtype: 'grid',
			region: 'center',
			layout: 'fit',
			// NOTE: autoscroll is buggy with firefox, so
			// we use native scrollbars
			// autoScroll: true,
			scroll: false,
			viewConfig: {
			    style: { overflow: 'auto', overflowX: 'hidden' }
			},
			height: 200,
			store: summarystore,
			columns: [
			    {header: 'Key', width: 150, dataIndex: 'key'},
			    {header: 'Value', flex: 1, dataIndex: 'value'}
			]
		    }
		]
	    });
	} else {
	    Ext.apply(me, {
		width: 450,
		layout: 'auto',
		border: false,
		items: [ me.formPanel ]
	    });
	}	 

	Ext.apply(me, {
	    modal: true,
	    buttons: [ submitBtn ]
	});

	me.callParent();

	if (!me.snapname) {
	    return;
	}

	// else load data
	PVE.Utils.API2Request({
	    url: '/nodes/' + me.nodename + '/qemu/' + me.vmid + "/snapshot/" + 
		me.snapname + '/config',
	    waitMsgTarget: me,
	    method: 'GET',
	    failure: function(response, opts) {
		Ext.Msg.alert('Error', response.htmlStatus);
		me.close();
	    },
	    success: function(response, options) {
		var data = response.result.data;
		var kvarray = [];
		Ext.Object.each(data, function(key, value) {
		    if (key === 'description' || key === 'snaptime') {
			return;
		    }
		    kvarray.push({ key: key, value: value });
		});
		summarystore.suspendEvents();
		summarystore.add(kvarray);
		summarystore.sort();
		summarystore.resumeEvents();
		summarystore.fireEvent('datachanged', summarystore);

		form.findField('snaptime').setValue(new Date(data.snaptime));
		form.findField('description').setValue(data.description);
	    }
	});
    }
});
