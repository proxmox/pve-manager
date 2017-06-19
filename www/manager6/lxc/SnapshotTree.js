Ext.define('PVE.lxc.SnapshotTree', {
    extend: 'Ext.tree.Panel',
    alias: ['widget.pveLxcSnapshotTree'],

    onlineHelp: 'pct_snapshots',

    load_delay: 3000,

    old_digest: 'invalid',

    stateful: true,
    stateId: 'grid-lxc-snapshots',

    sorterFn: function(rec1, rec2) {
	var v1 = rec1.data.snaptime;
	var v2 = rec2.data.snaptime;

	if (rec1.data.name === 'current') {
	    return 1;
	}
	if (rec2.data.name === 'current') {
	    return -1;
	}

	return (v1 > v2 ? 1 : (v1 < v2 ? -1 : 0));
    },

    reload: function(repeat) {
	var me = this;

	PVE.Utils.API2Request({
	    url: '/nodes/' + me.nodename + '/lxc/' + me.vmid + '/snapshot',
	    method: 'GET',
	    failure: function(response, opts) {
		PVE.Utils.setErrorMask(me, response.htmlStatus);
		me.load_task.delay(me.load_delay);
	    },
	    success: function(response, opts) {
		PVE.Utils.setErrorMask(me, false);
		var digest = 'invalid';
		var idhash = {};
		var root = { name: '__root', expanded: true, children: [] };
		Ext.Array.each(response.result.data, function(item) {
		    item.leaf = true;
		    item.children = [];
		    if (item.name === 'current') {
			digest = item.digest + item.running;
			if (item.running) {
			    item.iconCls = 'fa fa-fw fa-desktop x-fa-tree-running';
			} else {
			    item.iconCls = 'fa fa-fw fa-desktop x-fa-tree';
			}
		    } else {
			item.iconCls = 'fa fa-fw fa-history x-fa-tree';
		    }
		    idhash[item.name] = item;
		});

		if (digest !== me.old_digest) {
		    me.old_digest = digest;

		    Ext.Array.each(response.result.data, function(item) {
			if (item.parent && idhash[item.parent]) {
			    var parent_item = idhash[item.parent];
			    parent_item.children.push(item);
			    parent_item.leaf = false;
			    parent_item.expanded = true;
			    parent_item.expandable = false;
			} else {
			    root.children.push(item);
			}
		    });

		    me.setRootNode(root);
		}

		me.load_task.delay(me.load_delay);
	    }
	});

	PVE.Utils.API2Request({
	    url: '/nodes/' + me.nodename + '/lxc/' + me.vmid + '/feature',
	    params: { feature: 'snapshot' },
	    method: 'GET',
	    success: function(response, options) {
		var res = response.result.data;
		if (res.hasFeature) {
		    var snpBtns = Ext.ComponentQuery.query('#snapshotBtn');
		    snpBtns.forEach(function(item){
			item.enable();
		    });
		}
	    }
	});


    },

    listeners: {
	beforestatesave: function(grid, state, eopts) {
	    // extjs cannot serialize functions,
	    // so a the sorter with only the sorterFn will
	    // not be a valid sorter when restoring the state
	    delete state.storeState.sorters;
	}
    },

    initComponent: function() {
	var me = this;

	me.nodename = me.pveSelNode.data.node;
	if (!me.nodename) {
	    throw "no node name specified";
	}

	me.vmid = me.pveSelNode.data.vmid;
	if (!me.vmid) {
	    throw "no VM ID specified";
	}

	me.load_task = new Ext.util.DelayedTask(me.reload, me);

	var sm = Ext.create('Ext.selection.RowModel', {});

	var valid_snapshot = function(record) {
	    return record && record.data && record.data.name &&
		record.data.name !== 'current';
	};

	var valid_snapshot_rollback = function(record) {
	    return record && record.data && record.data.name &&
		record.data.name !== 'current' && !record.data.snapstate;
	};

	var run_editor = function() {
	    var rec = sm.getSelection()[0];
	    if (valid_snapshot(rec)) {
		var win = Ext.create('PVE.window.LxcSnapshot', {
		    snapname: rec.data.name,
		    nodename: me.nodename,
		    vmid: me.vmid
		});
		win.show();
		me.mon(win, 'close', me.reload, me);
	    }
	};

	var editBtn = new PVE.button.Button({
	    text: gettext('Edit'),
	    disabled: true,
	    selModel: sm,
	    enableFn: valid_snapshot,
	    handler: run_editor
	});

	var rollbackBtn = new PVE.button.Button({
	    text: gettext('Rollback'),
	    disabled: true,
	    selModel: sm,
	    enableFn: valid_snapshot_rollback,
	    confirmMsg: function(rec) {
		return PVE.Utils.format_task_description('vzrollback', me.vmid) +
		    " '" +  rec.data.name + "'";
	    },
	    handler: function(btn, event) {
		var rec = sm.getSelection()[0];
		if (!rec) {
		    return;
		}
		var snapname = rec.data.name;

		PVE.Utils.API2Request({
		    url: '/nodes/' + me.nodename + '/lxc/' + me.vmid + '/snapshot/' + snapname + '/rollback',
		    method: 'POST',
		    waitMsgTarget: me,
		    callback: function() {
			me.reload();
		    },
		    failure: function (response, opts) {
			Ext.Msg.alert(gettext('Error'), response.htmlStatus);
		    },
		    success: function(response, options) {
			var upid = response.result.data;
			var win = Ext.create('PVE.window.TaskProgress', { upid: upid });
			win.show();
		    }
		});
	    }
	});

	var removeBtn = new PVE.button.Button({
	    text: gettext('Remove'),
	    disabled: true,
	    selModel: sm,
	    confirmMsg: function(rec) {
		var msg = Ext.String.format(gettext('Are you sure you want to remove entry {0}'),
					    "'" + rec.data.name + "'");
		return msg;
	    },
	    enableFn: valid_snapshot,
	    handler: function(btn, event) {
		var rec = sm.getSelection()[0];
		if (!rec) {
		    return;
		}
		var snapname = rec.data.name;

		PVE.Utils.API2Request({
		    url: '/nodes/' + me.nodename + '/lxc/' + me.vmid + '/snapshot/' + snapname,
		    method: 'DELETE',
		    waitMsgTarget: me,
		    callback: function() {
			me.reload();
		    },
		    failure: function (response, opts) {
			Ext.Msg.alert(gettext('Error'), response.htmlStatus);
		    },
		    success: function(response, options) {
			var upid = response.result.data;
			var win = Ext.create('PVE.window.TaskProgress', { upid: upid });
			win.show();
		    }
		});
	    }
	});

	var snapshotBtn = Ext.create('Ext.Button', {
	    itemId: 'snapshotBtn',
	    text: gettext('Take Snapshot'),
	    disabled: true,
	    handler: function() {
		var win = Ext.create('PVE.window.LxcSnapshot', {
		    nodename: me.nodename,
		    vmid: me.vmid
		});
		win.show();
	    }
	});

	Ext.apply(me, {
	    layout: 'fit',
	    rootVisible: false,
	    animate: false,
	    sortableColumns: false,
	    selModel: sm,
	    tbar: [ snapshotBtn, rollbackBtn, removeBtn, editBtn ],
	    fields: [
		'name', 'description', 'snapstate', 'vmstate', 'running',
		{ name: 'snaptime', type: 'date', dateFormat: 'timestamp' }
	    ],
	    columns: [
		{
		    xtype: 'treecolumn',
		    text: gettext('Name'),
		    dataIndex: 'name',
		    width: 200,
		    renderer: function(value, metaData, record) {
			if (value === 'current') {
			    return "NOW";
			} else {
			    return value;
			}
		    }
		},
//		{
//		    text: gettext('RAM'),
//		    align: 'center',
//		    resizable: false,
//		    dataIndex: 'vmstate',
//		    width: 50,
//		    renderer: function(value, metaData, record) {
//			if (record.data.name !== 'current') {
//			    return PVE.Utils.format_boolean(value);
//			}
//		    }
//		},
		{
		    text: gettext('Date') + "/" + gettext("Status"),
		    dataIndex: 'snaptime',
		    resizable: false,
		    width: 150,
		    renderer: function(value, metaData, record) {
			if (record.data.snapstate) {
			    return record.data.snapstate;
			}
			if (value) {
			    return Ext.Date.format(value,'Y-m-d H:i:s');
			}
		    }
		},
		{
		    text: gettext('Description'),
		    dataIndex: 'description',
		    flex: 1,
		    renderer: function(value, metaData, record) {
			if (record.data.name === 'current') {
			    return gettext("You are here!");
			} else {
			    return Ext.String.htmlEncode(value);
			}
		    }
		}
	    ],
	    columnLines: true,
	    listeners: {
		activate: me.reload,
		destroy: me.load_task.cancel,
		itemdblclick: run_editor
	    }
	});

	me.callParent();

	me.store.sorters.add(new Ext.util.Sorter({
	    sorterFn: me.sorterFn
	}));
    }
});
