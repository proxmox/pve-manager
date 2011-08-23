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
		header: 'Status',
		defaultValue: 'unknown'
	    },
	    type: {
		header: 'Task type',
		required: true
	    },
	    user: {
		header: 'User name',
		required: true 
	    },
	    node: {
		header: 'Node',
		required: true 
	    },
	    pid: {
		header: 'Process ID',
		required: true
	    },
	    starttime: {
		header: 'Start time',
		required: true, 
		renderer: PVE.Utils.render_timestamp
	    },
	    upid: {
		header: 'Unique task ID'
	    }
	};

	var store = Ext.create('Ext.data.Store', {
	    model: 'pve-string-list',
            pageSize: 200,
	    buffered: true,
	    proxy: {
                type: 'pve',
		startParam: 'start',
		limitParam: 'limit',
                url: "/api2/json/nodes/" + task.node + "/tasks/" + me.upid + "/log"
	    }
	});

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
	    text: 'Stop',
	    disabled: true,
	    handler: stop_task
	});

	var stop_btn2 = new Ext.Button({
	    text: 'Stop',
	    disabled: true,
	    handler: stop_task
	});

	var statgrid = Ext.create('PVE.grid.ObjectGrid', {
	    title: 'Status',
	    layout: 'fit',
	    tbar: [ stop_btn1 ],
	    rstore: statstore,
	    rows: rows,
	    border: false
	});

	me.mon(statstore, 'load', function() {
	    var status = statgrid.getObjectValue('status');
	    if (status === 'stopped') {
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
		items: [
		    {
			title: 'Output',
			tbar: [ stop_btn2 ],
			border: false,
			xtype: 'gridpanel',
			features: [ {ftype: 'selectable'}],
			store: store,
			stateful: false,
			//tbar: [ 'test' ],
			verticalScrollerType: 'paginggridscroller',
			loadMask: true,
			disableSelection: true,
			invalidateScrollerOnRefresh: false,
			viewConfig: {
			    trackOver: false,
			    stripeRows: false
			},
			hideHeaders: true,
			columns: [ 
			    //{ header: "Line", dataIndex: 'n', width: 50 },
			    { header: "Text", dataIndex: 't', flex: 1 } 
			]
		    },
		    statgrid
		]
	    }]
        });

        me.callParent();

	store.guaranteeRange(0, store.pageSize - 1);
    }
});

