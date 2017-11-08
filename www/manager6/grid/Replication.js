Ext.define('PVE.window.ReplicaEdit', {
    extend: 'PVE.window.Edit',
    xtype: 'pveReplicaEdit',

    subject: gettext('Replication Job'),


    url: '/cluster/replication',
    method: 'POST',

    initComponent: function() {
	var me = this;

	var vmid = me.pveSelNode.data.vmid;
	var nodename = me.pveSelNode.data.node;

	var items = [];

	items.push({
	    xtype: (me.isCreate && !vmid)?'pveGuestIDSelector':'displayfield',
	    name: 'guest',
	    fieldLabel: 'CT/VM ID',
	    value: vmid || ''
	});

	items.push(
	    {
		xtype: me.isCreate ? 'pveNodeSelector':'displayfield',
		name: 'target',
		disallowedNodes: [nodename],
		allowBlank: false,
		onlineValidator: true,
		fieldLabel: gettext("Target")
	    },
	    {
		xtype: 'pveCalendarEvent',
		fieldLabel: gettext('Schedule'),
		emptyText: '*/15 - ' + Ext.String.format(gettext('Every {0} minutes'), 15),
		name: 'schedule'
	    },
	    {
		xtype: 'numberfield',
		fieldLabel: gettext('Rate limit') + ' (MB/s)',
		step: 1,
		minValue: 1,
		emptyText: gettext('unlimited'),
		name: 'rate'
	    },
	    {
		xtype: 'textfield',
		fieldLabel: gettext('Comment'),
		name: 'comment'
	    },
	    {
		xtype: 'pvecheckbox',
		name: 'enabled',
		defaultValue: 'on',
		checked: true,
		fieldLabel: gettext('Enabled')
	    }
	);

	me.items = [
	    {
		xtype: 'inputpanel',
		itemId: 'ipanel',
		onlineHelp: 'pvesr_schedule_time_format',

		onGetValues: function(values) {
		    var me = this.up('window');

		    values.disable = values.enabled ? 0 : 1;
		    delete values.enabled;

		    PVE.Utils.delete_if_default(values, 'rate', '', me.isCreate);
		    PVE.Utils.delete_if_default(values, 'disable', 0, me.isCreate);
		    PVE.Utils.delete_if_default(values, 'schedule', '*/15', me.isCreate);
		    PVE.Utils.delete_if_default(values, 'comment', '', me.isCreate);

		    if (me.isCreate) {
			values.type = 'local';
			var vm = vmid || values.guest;
			var id = -1;
			if (me.highestids[vm] !== undefined) {
			    id = me.highestids[vm];
			}
			id++;
			values.id = vm + '-' + id.toString();
			delete values.guest;
		    }
		    return values;
		},
		items: items
	    }
	];

	me.callParent();

	if (me.isCreate) {
	    me.load({
		success: function(response) {
		    var jobs = response.result.data;
		    var highestids = {};
		    Ext.Array.forEach(jobs, function(job) {
			var match = /^([0-9]+)\-([0-9]+)$/.exec(job.id);
			if (match) {
			    var vmid = parseInt(match[1],10);
			    var id = parseInt(match[2],10);
			    if (highestids[vmid] < id ||
				highestids[vmid] === undefined) {
				highestids[vmid] = id;
			    }
			}
		    });

		    me.highestids = highestids;
		}
	    });

	} else {
	    me.load({
		success: function(response, options) {
		    response.result.data.enabled = !response.result.data.disable;
		    me.setValues(response.result.data);
		    me.digest = response.result.data.digest;
		}
	    });
	}
    }
});

Ext.define('PVE.grid.ReplicaView', {
    extend: 'Ext.grid.Panel',
    xtype: 'pveReplicaView',

    onlineHelp: 'chapter_pvesr',

    stateful: true,
    stateId: 'grid-pve-replication-status',

    controller: {
	xclass: 'Ext.app.ViewController',

	addJob: function(button,event,rec) {
	    var me = this.getView();
	    var controller = this;
	    var win = Ext.create('PVE.window.ReplicaEdit', {
		isCreate: true,
		method: 'POST',
		pveSelNode: me.pveSelNode
	    });
	    win.on('destroy', function() { controller.reload(); });
	    win.show();
	},

	editJob: function(button,event,rec) {
	    var me = this.getView();
	    var controller = this;
	    var data = rec.data;
	    var win = Ext.create('PVE.window.ReplicaEdit', {
		url: '/cluster/replication/' + data.id,
		method: 'PUT',
		pveSelNode: me.pveSelNode
	    });
	    win.on('destroy', function() { controller.reload(); });
	    win.show();
	},

	removeJob: function(button,event,rec) {
	    var me = this.getView();
	    var controller = this;
	    PVE.Utils.API2Request({
		url: '/api2/extjs/cluster/replication/' + rec.data.id,
		waitMsgTarget: me,
		method: 'DELETE',
		callback: function() { controller.reload(); },
		failure: function (response, opts) {
		    Ext.Msg.alert(gettext('Error'), response.htmlStatus);
		}
	    });
	},

	scheduleJobNow: function(button,event,rec) {
	    var me = this.getView();
	    var controller = this;

	    PVE.Utils.API2Request({
		url: "/api2/extjs/nodes/" + me.nodename + "/replication/" + rec.data.id + "/schedule_now",
		method: 'POST',
		waitMsgTarget: me,
		callback: function() { controller.reload(); },
		failure: function (response, opts) {
		    Ext.Msg.alert(gettext('Error'), response.htmlStatus);
		}
	    });
	},

	showLog: function(button, event, rec) {
	    var me = this.getView();
	    var controller = this;
	    var logView = Ext.create('PVE.panel.LogView', {
		border: false,
		url: "/api2/extjs/nodes/" + me.nodename + "/replication/" + rec.data.id + "/log"
	    });
	    var win = Ext.create('Ext.window.Window', {
		items: [ logView ],
		layout: 'fit',
		width: 800,
		height: 400,
		modal: true,
		title: gettext("Replication Log")
	    });
	    var task = {
		run: function() {
		    logView.requestUpdate();
		},
		interval: 1000
	    };
	    Ext.TaskManager.start(task);
	    win.on('destroy', function() {
		Ext.TaskManager.stop(task);
		controller.reload();
	    });
	    win.show();
	},

	reload: function() {
	    var me = this.getView();
	    me.rstore.load();
	},

	dblClick: function(grid, record, item) {
	    var me = this;
	    me.editJob(undefined, undefined, record);
	},

	// check for cluster
	// currently replication is for cluster only, so we disable the whole
	// component
	checkPrerequisites: function() {
	    var me = this.getView();
	    if (PVE.data.ResourceStore.getNodes().length < 2) {
		me.mask(gettext("Replication needs at least two nodes"), ['pve-static-mask']);
	    }
	},

	control: {
	    '#': {
		itemdblclick: 'dblClick',
		afterlayout: 'checkPrerequisites'
	    }
	}
    },

    tbar: [
	{
	    text: gettext('Add'),
	    itemId: 'addButton',
	    handler: 'addJob'
	},
	{
	    xtype: 'pveButton',
	    text: gettext('Edit'),
	    itemId: 'editButton',
	    handler: 'editJob',
	    disabled: true
	},
	{
	    xtype: 'pveButton',
	    text: gettext('Remove'),
	    itemId: 'removeButton',
	    handler: 'removeJob',
	    dangerous: true,
	    confirmMsg: function(rec) {
		var msg = Ext.String.format(gettext("Are you sure you want to remove entry {0}"), rec.id);
		return msg;
	    },
	    disabled: true
	},
	{
	    xtype: 'pveButton',
	    text: gettext('Log'),
	    itemId: 'logButton',
	    handler: 'showLog',
	    disabled: true
	},
	{
	    xtype: 'pveButton',
	    text: gettext('Schedule now'),
	    itemId: 'scheduleNowButton',
	    handler: 'scheduleJobNow',
	    disabled: true
	}
    ],

    initComponent: function() {
	var me = this;
	var mode = '';
	var url = '/cluster/replication';

	me.nodename = me.pveSelNode.data.node;
	me.vmid = me.pveSelNode.data.vmid;

	me.columns = [
	    {
		text: gettext('Enabled'),
		dataIndex: 'enabled',
		xtype: 'checkcolumn',
		sortable: true,
		disabled: true
	    },
	    {
		text: 'ID',
		dataIndex: 'id',
		width: 60,
		hidden: true
	    },
	    {
		text: gettext('Guest'),
		dataIndex: 'guest',
		width: 75
	    },
	    {
		text: gettext('Job'),
		dataIndex: 'jobnum',
		width: 60
	    },
	    {
		text: gettext('Target'),
		dataIndex: 'target'
	    }
	];

	if (!me.nodename) {
	    mode = 'dc';
	    me.stateId = 'grid-pve-replication-dc';
	} else if (!me.vmid) {
	    mode = 'node';
	    url = '/nodes/' + me.nodename + '/replication';
	} else {
	    mode = 'vm';
	    url = '/nodes/' + me.nodename + '/replication' + '?guest=' + me.vmid;
	}

	if (mode !== 'dc') {
	    me.columns.push(
		{
		    text: gettext('Status'),
		    dataIndex: 'state',
		    minWidth: 160,
		    flex: 1,
		    renderer: function(value, metadata, record) {

			if (record.data.pid) {
			    metadata.tdCls = 'x-grid-row-loading';
			    return '';
			}

			var icons = [];
			var states = [];

			if (record.data.remove_job) {
			    icons.push('<i class="fa fa-ban warning" title="'
					+ gettext("Removal Scheduled") + '"></i>');
			    states.push(gettext("Removal Scheduled"));
			}

			if (record.data.error) {
			    icons.push('<i class="fa fa-times critical" title="'
					+ gettext("Error") + '"></i>');
			    states.push(record.data.error);
			}

			if (icons.length == 0) {
			    icons.push('<i class="fa fa-check good"></i>');
			    states.push(gettext('OK'));
			}

			return icons.join(',') + ' ' + states.join(',');
		    }
		},
		{
		    text: gettext('Last Sync'),
		    dataIndex: 'last_sync',
		    width: 150,
		    renderer: function(value, metadata, record) {
			if (!value) {
			    return '-';
			}

			if (record.data.pid) {
			    return gettext('syncing');
			}

			return PVE.Utils.render_timestamp(value);
		    }
		},
		{
		    text: gettext('Duration'),
		    dataIndex: 'duration',
		    width: 60,
		    renderer: PVE.Utils.render_duration
		},
		{
		    text: gettext('Next Sync'),
		    dataIndex: 'next_sync',
		    width: 150,
		    renderer: function(value) {
			if (!value) {
			    return '-';
			}

			var now = new Date();
			var next = new Date(value*1000);

			if (next < now) {
			    return gettext('pending');
			}

			return PVE.Utils.render_timestamp(value);
		    }
		}
	    );
	}

	me.columns.push(
	    {
		text: gettext('Schedule'),
		width: 75,
		dataIndex: 'schedule'
	    },
	    {
		text: gettext('Rate limit'),
		dataIndex: 'rate',
		renderer: function(value) {
		    if (!value) {
			return gettext('unlimited');
		    }

		    return value.toString() + ' MB/s';
		},
		hidden: true
	    },
	    {
		text: gettext('Comment'),
		dataIndex: 'comment',
		renderer: Ext.htmlEncode
	    }
	);

	me.rstore = Ext.create('PVE.data.UpdateStore', {
	    storeid: 'pve-replica-' + me.nodename + me.vmid,
	    model: (mode === 'dc')? 'pve-replication' : 'pve-replication-state',
	    interval: 3000,
	    proxy: {
		type: 'pve',
		url: "/api2/json" + url
	    }
	});

	me.store = Ext.create('PVE.data.DiffStore', {
	    rstore: me.rstore,
	    sorters: [
		{
		    property: 'guest'
		},
		{
		    property: 'jobnum'
		}
	    ]
	});

	me.callParent();

	// we cannot access the log and scheduleNow button
	// in the datacenter, because
	// we do not know where/if the jobs runs
	if (mode === 'dc') {
	    me.down('#logButton').setHidden(true);
	    me.down('#scheduleNowButton').setHidden(true);
	}

	// if we set the warning mask, we do not want to load
	// or set the mask on store errors
	if (PVE.data.ResourceStore.getNodes().length < 2) {
	    return;
	}

	PVE.Utils.monStoreErrors(me, me.rstore);

	me.on('destroy', me.rstore.stopUpdate);
	me.rstore.startUpdate();
    }
}, function() {

    Ext.define('pve-replication', {
	extend: 'Ext.data.Model',
	fields: [
	    'id', 'target', 'comment', 'rate', 'type',
	    { name: 'guest', type: 'integer' },
	    { name: 'jobnum', type: 'integer' },
	    { name: 'schedule', defaultValue: '*/15' },
	    { name: 'disable', defaultValue: '' },
	    { name: 'enabled', calculate: function(data) { return !data.disable; } }
	]
    });

    Ext.define('pve-replication-state', {
	extend: 'pve-replication',
	fields: [
	    'last_sync', 'next_sync', 'error', 'duration', 'state',
	    'fail_count', 'remove_job', 'pid'
	]
    });

});
