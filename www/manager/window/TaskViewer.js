// fixme: how can we avoid those lint errors?
/*jslint confusion: true */

Ext.define('PVE.window.TaskViewer', {
    extend: 'Ext.window.Window',
    requires: [
        'PVE.Utils'
    ],
    alias: 'widget.pveTaskViewer',

    initComponent: function() {
        var me = this;

	if (!me.upid) {
	    throw "no task specified";
	}

	var task = PVE.Utils.parse_task_upid(me.upid);

	var rows = {
	    status: {
		header: gettext('Status'),
		defaultValue: 'unknown'
	    },
	    type: {
		header: 'Task type',
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
		header: 'Process ID',
		required: true
	    },
	    starttime: {
		header: gettext('Start Time'),
		required: true, 
		renderer: PVE.Utils.render_timestamp
	    },
	    upid: {
		header: 'Unique task ID'
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
		    Ext.Msg.alert('Error', response.htmlStatus);
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

	var statgrid = Ext.create('PVE.grid.ObjectGrid', {
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

	Ext.applyIf(me, {
	    title: "Task viewer: " + task.desc,
	    width: 800,
	    height: 400,
	    layout: 'fit',
	    modal: true,
	    bodyPadding: 5,
	    items: [{
		xtype: 'tabpanel',
		region: 'center',
		items: [ logView, statgrid ]
	    }]
        });

        me.callParent();
    }
});

