Ext.ns("PVE");

PVE.LogViewer = Ext.extend(Ext.list.ListView, {

    initComponent : function() {
	var self = this;

	var fields = [ 
	    { name: 'time', type : 'date', dateFormat: 'timestamp' }, 
	    { name: 'pri', type: 'int' },
	    { name: 'pid', type: 'int' },
	    'node', 'user', 'tag', 'msg' ];

	var logstore = new PVE.data.UpdateStore({
	    itype: 'log',
	    autoDestroy: true,
	    url: self.url,
	    fields: fields
	});

	Ext.apply(self, {
	    store: logstore,
	    startUpdate: function() { logstore.startUpdate(); },
	    stopUpdate: function() { logstore.stopUpdate(); },
	    columnSort: false,
	    columns: [
		{ header: "Time", width: 0.10, dataIndex: 'time',
		  tpl: '{time:date("M d H:i:s")}'
		},
		{ header: "Node", width: 0.05, dataIndex: 'node' },
		{ header: "Tag", width: 0.05, dataIndex: 'tag' },
		{ header: "PID", width: 0.05, dataIndex: 'pid' },
		{ header: "User", width: 0.05, dataIndex: 'user' },
		{ header: "Severity", width: 0.05, dataIndex: 'pri',
		  tpl: '{[ PVE.Utils.render_serverity(values.pri) ]}'
		},
		{ header: "Message", dataIndex: 'msg' }
	    ]});

	var move_to_end = true;

	logstore.on("load", function() {
	    if (move_to_end) {
		move_to_end = false;
		var count = logstore.getCount();
		if (count) {
		    var item = self.getNode(count - 1);
		    if (item) 
			Ext.fly(item).scrollIntoView(self.innerBody.dom.parentNode);
		}
	    }
	});
 
	PVE.LogViewer.superclass.initComponent.call(self);
    }
});


PVE.ClusterTasks = Ext.extend(Ext.grid.GridPanel, {

    initComponent : function() {
	var self = this;

	var fields = [ 
	    { name: 'starttime', type : 'date', dateFormat: 'timestamp' }, 
	    { name: 'endtime', type : 'date', dateFormat: 'timestamp' }, 
	    { name: 'pid', type: 'int' },
	    'node', 'upid', 'user', 'status', 'type', 'id'];

	// fixme: use/define a storage which append new values, but
	// defer removing old values until a maximum numer of entries 
	// is reached
	var taskstore = new PVE.data.UpdateStore({
	    itype: 'tasks',
	    autoDestroy: true,
	    url: '/api2/json/cluster/tasks',
	    idProperty: 'upid',
	    fields: fields
	});

	Ext.apply(self, {
	    store: taskstore,
	    border: false,
	    startUpdate: function() { taskstore.startUpdate(); },
	    stopUpdate: function() { taskstore.stopUpdate(); },
	    columnSort: false,
	    autoExpandColumn: 'status',
	    viewConfig: {
		getRowClass: function(record, index) {
		    var status = record.get('status');

		    if (status && status != 'OK') 
			return "x-form-invalid";
		}
	    },
	    columns: [
		{ header: "Start Time", dataIndex: 'starttime',
		  width: 100,
		  renderer: function(value) { return value.format("M d H:i:s"); }
		},
		{ header: "End Time", dataIndex: 'endtime',
		  width: 100,
		  renderer: function(value, metaData, record) {
		      if (record.data.pid) {
			  metaData.css =  "x-grid-row-loading";
			  return "";
		      }
		      return value.format("M d H:i:s"); 
		  }
		},
		{ header: "Node", dataIndex: 'node',
		  width: 100
		},
		{ header: "User", dataIndex: 'user',
		  width: 150
		},
		{ id: 'desc', header: "Description", dataIndex: 'upid', 
		  width: 400,
		  renderer: PVE.Utils.render_upid
		},
		{ id: 'status', header: "Status", dataIndex: 'status', 
		  width: 200,
		  renderer: function(value, metaData, record) { 
		      if (record.data.pid) {
			  metaData.css =  "x-grid-row-loading";
			  return "";
		      }
		      if (value == 'OK')
			  return 'OK';
		      // metaData.attr = 'style="color:red;"'; 
		      return "ERROR: " + value;
		  }
		}
	    ]});

	PVE.ClusterTasks.superclass.initComponent.call(self);
    }
});

PVE.StatusPanel = Ext.extend(Ext.Panel, {

    initComponent : function() {
	var self = this;

	self.title = "Realtime logfile viewer";
	self.layout = 'fit';

	var syslogview = new PVE.LogViewer({ 
	    url: '/api2/json/nodes/localhost/syslog'
	});
	var cllogview = new PVE.LogViewer({ 
	    url: '/api2/json/cluster/log',
	});
	var tasklist = new PVE.ClusterTasks();

	self.items = {
	    xtype: 'tabpanel',
 	    border: false,
	    tabPosition: 'bottom',
            activeTab: 0,

	    defaults: { layout: 'fit' },

	    items: [
		{
                    title: 'Cluster Log',
		    items: cllogview,
		    listeners: {
			show: function() {
			    cllogview.startUpdate();
			},
			hide: function() {
			    cllogview.stopUpdate();
			}
		    }
 		},
		{
                    title: 'System Log',
		    items: syslogview,
		    listeners: {
			show: function() {
			    syslogview.startUpdate();
			},
			hide: function() {
			    syslogview.stopUpdate();
			}
		    }
 		},
		{
                    title: 'Task list',
		    items: tasklist,
		    listeners: {
			show: function() {
			    tasklist.startUpdate();
			},
			hide: function() {
			    tasklist.stopUpdate();
			}
		    }
		}
	    ]
 	};	

	PVE.StatusPanel.superclass.initComponent.call(self);

    }
});

Ext.reg('pveStatusPanel', PVE.StatusPanel);

