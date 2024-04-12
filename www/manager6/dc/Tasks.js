/* This class defines the "Tasks" tab of the bottom status panel
 * Tasks are jobs with a start, end and log output
 */

Ext.define('PVE.dc.Tasks', {
    extend: 'Ext.grid.GridPanel',

    alias: ['widget.pveClusterTasks'],

    initComponent: function() {
	let me = this;

	let taskstore = Ext.create('Proxmox.data.UpdateStore', {
	    storeId: 'pve-cluster-tasks',
	    model: 'proxmox-tasks',
	    proxy: {
		type: 'proxmox',
		url: '/api2/json/cluster/tasks',
	    },
	});
	let store = Ext.create('Proxmox.data.DiffStore', {
	    rstore: taskstore,
	    sortAfterUpdate: true,
	    appendAtStart: true,
	    sorters: [
		{
		    property: 'pid',
		    direction: 'DESC',
		},
		{
		    property: 'starttime',
		    direction: 'DESC',
		},
	    ],

	});

	let run_task_viewer = function() {
	    var sm = me.getSelectionModel();
	    var rec = sm.getSelection()[0];
	    if (!rec) {
		return;
	    }

	    var win = Ext.create('Proxmox.window.TaskViewer', {
		upid: rec.data.upid,
		endtime: rec.data.endtime,
	    });
	    win.show();
	};

	Ext.apply(me, {
	    store: store,
	    stateful: false,
	    viewConfig: {
		trackOver: false,
		stripeRows: true, // does not work with getRowClass()
		getRowClass: function(record, index) {
		    let taskState = record.get('status');
		    if (taskState) {
			let parsed = Proxmox.Utils.parse_task_status(taskState);
			if (parsed === 'warning') {
			    return "proxmox-warning-row";
			} else if (parsed !== 'ok') {
			    return "proxmox-invalid-row";
			}
		    }
		    return '';
		},
	    },
	    sortableColumns: false,
	    columns: [
		{
		    header: gettext("Start Time"),
		    dataIndex: 'starttime',
		    width: 150,
		    renderer: function(value) {
			return Ext.Date.format(value, "M d H:i:s");
		    },
		},
		{
		    header: gettext("End Time"),
		    dataIndex: 'endtime',
		    width: 150,
		    renderer: function(value, metaData, record) {
			if (record.data.pid) {
			    if (record.data.type === "vncproxy" ||
				record.data.type === "vncshell" ||
				record.data.type === "spiceproxy") {
				metaData.tdCls = "x-grid-row-console";
			    } else {
				metaData.tdCls = "x-grid-row-loading";
			    }
			    return "";
			}
			return Ext.Date.format(value, "M d H:i:s");
		    },
		},
		{
		    header: gettext("Node"),
		    dataIndex: 'node',
		    width: 100,
		},
		{
		    header: gettext("User name"),
		    dataIndex: 'user',
		    renderer: Ext.String.htmlEncode,
		    width: 150,
		},
		{
		    header: gettext("Description"),
		    dataIndex: 'upid',
		    flex: 1,
		    renderer: Proxmox.Utils.render_upid,
		},
		{
		    header: gettext("Status"),
		    dataIndex: 'status',
		    width: 200,
		    renderer: function(value, metaData, record) {
			if (record.data.pid) {
			    if (record.data.type !== "vncproxy") {
				metaData.tdCls = "x-grid-row-loading";
			    }
			    return "";
			}
			return Proxmox.Utils.format_task_status(value);
		    },
		},
	    ],
	    listeners: {
		itemdblclick: run_task_viewer,
		show: () => taskstore.startUpdate(),
		destroy: () => taskstore.stopUpdate(),
	    },
	});

	me.callParent();
    },
});
