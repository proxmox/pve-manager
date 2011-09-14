Ext.define('PVE.dc.Tasks', {
    extend: 'Ext.grid.GridPanel',

    alias: ['widget.pveClusterTasks'],

    initComponent : function() {
	var me = this;

	var taskstore = new PVE.data.UpdateStore({
	    storeid: 'pve-cluster-tasks',
	    model: 'pve-tasks',
	    proxy: {
                type: 'pve',
		url: '/api2/json/cluster/tasks'
	    },
	    sorters: [
		{
		    property : 'starttime',
		    direction: 'DESC'
		}
	    ]
	});

	var store = Ext.create('PVE.data.DiffStore', { 
	    rstore: taskstore,
	    appendAtStart: true 
	});

	var run_task_viewer = function() {
	    var sm = me.getSelectionModel();
	    var rec = sm.getSelection()[0];
	    if (!rec) {
		return;
	    }

	    var win = Ext.create('PVE.window.TaskViewer', { 
		upid: rec.data.upid
	    });
	    win.show();
	};

	Ext.apply(me, {
	    store: store,
	    stateful: false,

	    viewConfig: {
		trackOver: false,
		stripeRows: false, // does not work with getRowClass()
 
		getRowClass: function(record, index) {
		    var status = record.get('status');

		    if (status && status != 'OK') {
			return "x-form-invalid-field";
		    }
		}
	    },
	    sortableColumns: false,
	    columns: [
		{ 
		    header: "Start Time", 
		    dataIndex: 'starttime',
		    width: 100,
		    renderer: function(value) { 
			return Ext.Date.format(value, "M d H:i:s"); 
		    }
		},
		{ 
		    header: "End Time", 
		    dataIndex: 'endtime',
		    width: 100,
		    renderer: function(value, metaData, record) {
			if (record.data.pid) {
			    metaData.tdCls =  "x-grid-row-loading";
			    return "";
			}
			return Ext.Date.format(value, "M d H:i:s"); 
		    }
		},
		{ 
		    header: "Node", 
		    dataIndex: 'node',
		    width: 100
		},
		{ 
		    header: "User", 
		    dataIndex: 'user',
		    width: 150
		},
		{ 
		    header: "Description", 
		    dataIndex: 'upid', 
		    flex: 1,		  
		    renderer: PVE.Utils.render_upid
		},
		{ 
		    header: "Status", 
		    dataIndex: 'status', 
		    width: 200,
		    renderer: function(value, metaData, record) { 
			if (record.data.pid) {
			    metaData.tdCls =  "x-grid-row-loading";
			    return "";
			}
			if (value == 'OK') {
			    return 'OK';
			}
			// metaData.attr = 'style="color:red;"'; 
			return "ERROR: " + value;
		    }
		}
	    ],
	    listeners: {
		itemdblclick: run_task_viewer,
		show: taskstore.startUpdate,
		hide: taskstore.stopUpdate,
		destroy: taskstore.stopUpdate
	    }
	});

	me.callParent();
    }
});