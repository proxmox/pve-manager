Ext.define('PVE.window.TaskProgress', {
    extend: 'Ext.window.Window',
    alias: 'widget.pveTaskProgress',

    initComponent: function() {
        var me = this;

	if (!me.upid) {
	    throw "no task specified";
	}

	var task = PVE.Utils.parse_task_upid(me.upid);

	var statstore = Ext.create('PVE.data.ObjectStore', {
            url: "/api2/json/nodes/" + task.node + "/tasks/" + me.upid + "/status",
	    interval: 1000,
	    rows: {
		status: { defaultValue: 'unknown' },
		exitstatus: { defaultValue: 'unknown' }
	    }
	});

	me.on('destroy', statstore.stopUpdate);	

	var getObjectValue = function(key, defaultValue) {
	    var rec = statstore.getById(key);
	    if (rec) {
		return rec.data.value;
	    }
	    return defaultValue;
	};

	var pbar = Ext.create('Ext.ProgressBar', { text: 'running...' });

	me.mon(statstore, 'load', function() {
	    var status = getObjectValue('status');
	    if (status === 'stopped') {
		var exitstatus = getObjectValue('exitstatus');
		if (exitstatus == 'OK') {
		    pbar.reset();
		    pbar.updateText("Done!");
		    Ext.Function.defer(me.close, 1000, me);
		} else {
		    me.close();
		    Ext.Msg.alert('Task failed', exitstatus);
		}
	    }
	});

	var descr = PVE.Utils.format_task_description(task.type, task.id);

	Ext.apply(me, {
	    title: "Task: " + descr,
	    width: 300,
	    layout: 'auto',
	    modal: true,
	    bodyPadding: 5,
	    items: pbar,
	    buttons: [
		{ 
		    text: gettext('Details'),
		    handler: function() {			
			var win = Ext.create('PVE.window.TaskViewer', { 
			    upid: me.upid
			});
			win.show();
			me.close();
		    }
		}
	    ]
	});

	me.callParent();

	statstore.startUpdate();

	pbar.wait();
    }
});

// fixme: how can we avoid those lint errors?
/*jslint confusion: true */

Ext.define('PVE.window.TaskViewer', {
    extend: 'Ext.window.Window',
    alias: 'widget.pveTaskViewer',
    extraTitle: '', // string to prepend after the generic task title

    initComponent: function() {
        var me = this;

	if (!me.upid) {
	    throw "no task specified";
	}

	var task = PVE.Utils.parse_task_upid(me.upid);

	var statgrid;

	var rows = {
	    status: {
		header: gettext('Status'),
		defaultValue: 'unknown',
		renderer: function(value) {
		    if (value != 'stopped') {
			return value;
		    }
		    var es = statgrid.getObjectValue('exitstatus');
		    if (es) {
			return value + ': ' + es;
		    }
		}
	    },
	    exitstatus: { 
		visible: false
	    },
	    type: {
		header: gettext('Task type'),
		required: true
	    },
	    user: {
		header: gettext('User name'),
		required: true 
	    },
	    node: {
		header: gettext('Node'),
		required: true 
	    },
	    pid: {
		header: gettext('Process ID'),
		required: true
	    },
	    starttime: {
		header: gettext('Start Time'),
		required: true, 
		renderer: PVE.Utils.render_timestamp
	    },
	    upid: {
		header: gettext('Unique task ID')
	    }
	};

	var statstore = Ext.create('PVE.data.ObjectStore', {
            url: "/api2/json/nodes/" + task.node + "/tasks/" + me.upid + "/status",
	    interval: 1000,
	    rows: rows
	});

	me.on('destroy', statstore.stopUpdate);	

	var stop_task = function() {
	    PVE.Utils.API2Request({
		url: "/nodes/" + task.node + "/tasks/" + me.upid,
		waitMsgTarget: me,
		method: 'DELETE',
		failure: function(response, opts) {
		    Ext.Msg.alert(gettext('Error'), response.htmlStatus);
		}
	    });
	};

	var stop_btn1 = new Ext.Button({
	    text: gettext('Stop'),
	    disabled: true,
	    handler: stop_task
	});

	var stop_btn2 = new Ext.Button({
	    text: gettext('Stop'),
	    disabled: true,
	    handler: stop_task
	});

	statgrid = Ext.create('PVE.grid.ObjectGrid', {
	    title: gettext('Status'),
	    layout: 'fit',
	    tbar: [ stop_btn1 ],
	    rstore: statstore,
	    rows: rows,
	    border: false
	});

	var logView = Ext.create('PVE.panel.LogView', {
	    title: gettext('Output'),
	    tbar: [ stop_btn2 ],
	    border: false,
	    url: "/api2/extjs/nodes/" + task.node + "/tasks/" + me.upid + "/log"
	});

	me.mon(statstore, 'load', function() {
	    var status = statgrid.getObjectValue('status');
	    
	    if (status === 'stopped') {
		logView.requestUpdate(undefined, true);
		logView.scrollToEnd = false;
		statstore.stopUpdate();
	    }

	    stop_btn1.setDisabled(status !== 'running');
	    stop_btn2.setDisabled(status !== 'running');
	});

	statstore.startUpdate();

	Ext.apply(me, {
	    title: "Task viewer: " + task.desc + me.extraTitle,
	    width: 800,
	    height: 400,
	    layout: 'fit',
	    modal: true,
	    items: [{
		xtype: 'tabpanel',
		region: 'center',
		items: [ logView, statgrid ]
	    }]
        });

	me.callParent();

	logView.fireEvent('show', logView);
    }
});

