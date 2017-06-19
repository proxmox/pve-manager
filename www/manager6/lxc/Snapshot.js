Ext.define('PVE.window.LxcSnapshot', {
    extend: 'Ext.window.Window',

    resizable: false,

    // needed for finding the reference to submitbutton
    // because we do not have a controller
    referenceHolder: true,
    defaultButton: 'submitbutton',
    defaultFocus: 'field',

    take_snapshot: function(snapname, descr, vmstate) {
	var me = this;
	var params = { snapname: snapname };
	if (descr) {
	    params.description = descr;
	}

	PVE.Utils.API2Request({
	    params: params,
	    url: '/nodes/' + me.nodename + '/lxc/' + me.vmid + "/snapshot",
	    waitMsgTarget: me,
	    method: 'POST',
	    failure: function(response, opts) {
		Ext.Msg.alert(gettext('Error'), response.htmlStatus);
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
	    url: '/nodes/' + me.nodename + '/lxc/' + me.vmid + "/snapshot/" +
		snapname + '/config',
	    waitMsgTarget: me,
	    method: 'PUT',
	    failure: function(response, opts) {
		Ext.Msg.alert(gettext('Error'), response.htmlStatus);
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
		fieldLabel: gettext('Name'),
		vtype: 'ConfigId',
		allowBlank: false
	    }
	];

	if (me.snapname) {
	    items.push({
		xtype: 'displayfield',
		name: 'snaptime',
		renderer: PVE.Utils.render_timestamp_human_readable,
		fieldLabel: gettext('Timestamp')
	    });
	}

	items.push({
	    xtype: 'textareafield',
	    grow: true,
	    name: 'description',
	    fieldLabel: gettext('Description')
	});

	if (me.snapname) {
	    items.push({
		title: gettext('Settings'),
		xtype: 'grid',
		height: 200,
		store: summarystore,
		columns: [
		    {header: gettext('Key'), width: 150, dataIndex: 'key'},
		    {header: gettext('Value'), flex: 1, dataIndex: 'value'}
		]
	    });
	}

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
	    me.title = gettext('Edit') + ': ' + gettext('Snapshot');
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
	    me.title ="VM " + me.vmid + ': ' + gettext('Take Snapshot');
	    submitBtn = Ext.create('Ext.Button', {
		text: gettext('Take Snapshot'),
		reference: 'submitbutton',
		handler: function() {
		    if (form.isValid()) {
			var values = form.getValues();
			me.take_snapshot(values.snapname, values.description);
		    }
		}
	    });
	}

	Ext.apply(me, {
	    modal: true,
	    width: 450,
	    border: false,
	    layout: 'fit',
	    buttons: [ submitBtn ],
	    items: [ me.formPanel ]
	});

	if (me.snapname) {
	    Ext.apply(me, {
		width: 620,
		height: 420
	    });
	}

	me.callParent();

	if (!me.snapname) {
	    return;
	}

	// else load data
	PVE.Utils.API2Request({
	    url: '/nodes/' + me.nodename + '/lxc/' + me.vmid + "/snapshot/" +
		me.snapname + '/config',
	    waitMsgTarget: me,
	    method: 'GET',
	    failure: function(response, opts) {
		Ext.Msg.alert(gettext('Error'), response.htmlStatus);
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
		summarystore.fireEvent('refresh', summarystore);

		form.findField('snaptime').setValue(data.snaptime);
		form.findField('description').setValue(data.description);
	    }
	});
    }
});
