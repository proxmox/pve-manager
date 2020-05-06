Ext.define('PVE.dc.BackupEdit', {
    extend: 'Proxmox.window.Edit',
    alias: ['widget.pveDcBackupEdit'],

    defaultFocus: undefined,

    initComponent : function() {
         var me = this;

        me.isCreate = !me.jobid;

	var url;
	var method;

	if (me.isCreate) {
            url = '/api2/extjs/cluster/backup';
            method = 'POST';
        } else {
            url = '/api2/extjs/cluster/backup/' + me.jobid;
            method = 'PUT';
        }

	var vmidField = Ext.create('Ext.form.field.Hidden', {
	    name: 'vmid'
	});

	/*jslint confusion: true*/
	// 'value' can be assigned a string or an array
	var selModeField =  Ext.create('Proxmox.form.KVComboBox', {
	    xtype: 'proxmoxKVComboBox',
	    comboItems: [
		['include', gettext('Include selected VMs')],
		['all', gettext('All')],
		['exclude', gettext('Exclude selected VMs')],
		['pool', gettext('Pool based')]
	    ],
	    fieldLabel: gettext('Selection mode'),
	    name: 'selMode',
	    value: ''
	});

	var sm = Ext.create('Ext.selection.CheckboxModel', {
	    mode: 'SIMPLE',
	    listeners: {
		selectionchange: function(model, selected) {
		    var sel = [];
		    Ext.Array.each(selected, function(record) {
			sel.push(record.data.vmid);
		    });

		    // to avoid endless recursion suspend the vmidField change
		    // event temporary as it calls us again
		    vmidField.suspendEvent('change');
		    vmidField.setValue(sel);
		    vmidField.resumeEvent('change');
		}
	    }
	});

	var storagesel = Ext.create('PVE.form.StorageSelector', {
	    fieldLabel: gettext('Storage'),
	    nodename: 'localhost',
	    storageContent: 'backup',
	    allowBlank: false,
	    name: 'storage'
	});

	var store = new Ext.data.Store({
	    model: 'PVEResources',
	    sorters: {
		property: 'vmid',
		order: 'ASC'
	    }
	});

	var vmgrid = Ext.createWidget('grid', {
	    store: store,
	    border: true,
	    height: 300,
	    selModel: sm,
	    disabled: true,
	    columns: [
		{
		    header: 'ID',
		    dataIndex: 'vmid',
		    width: 60
		},
		{
		    header: gettext('Node'),
		    dataIndex: 'node'
		},
		{
		    header: gettext('Status'),
		    dataIndex: 'uptime',
		    renderer: function(value) {
			if (value) {
			    return Proxmox.Utils.runningText;
			} else {
			    return Proxmox.Utils.stoppedText;
			}
		    }
		},
		{
		    header: gettext('Name'),
		    dataIndex: 'name',
		    flex: 1
		},
		{
		    header: gettext('Type'),
		    dataIndex: 'type'
		}
	    ]
	});

	var selectPoolMembers = function(poolid) {
	    if (!poolid) {
		return;
	    }
	    sm.deselectAll(true);
	    store.filter([
		{
		    id: 'poolFilter',
		    property: 'pool',
		    value: poolid
		}
	    ]);
	    sm.selectAll(true);
	};

	var selPool = Ext.create('PVE.form.PoolSelector', {
	    fieldLabel: gettext('Pool to backup'),
	    hidden: true,
	    allowBlank: true,
	    name: 'pool',
	    listeners: {
		change: function( selpool, newValue, oldValue) {
		    selectPoolMembers(newValue);
		}
	    }
	});

	var nodesel = Ext.create('PVE.form.NodeSelector', {
	    name: 'node',
	    fieldLabel: gettext('Node'),
	    allowBlank: true,
	    editable: true,
	    autoSelect: false,
	    emptyText: '-- ' + gettext('All') + ' --',
	    listeners: {
		change: function(f, value) {
		    storagesel.setNodename(value || 'localhost');
		    var mode = selModeField.getValue();
		    store.clearFilter();
		    store.filterBy(function(rec) {
			return (!value || rec.get('node') === value);
		    });
		    if (mode === 'all') {
			sm.selectAll(true);
		    }

		    if (mode === 'pool') {
			selectPoolMembers(selPool.value);
		    }
		}
	    }
	});

	var column1 = [
	    nodesel,
	    storagesel,
	    {
		xtype: 'pveDayOfWeekSelector',
		name: 'dow',
		fieldLabel: gettext('Day of week'),
		multiSelect: true,
		value: ['sat'],
		allowBlank: false
	    },
	    {
		xtype: 'timefield',
		fieldLabel: gettext('Start Time'),
		name: 'starttime',
		format: 'H:i',
		formatText: 'HH:MM',
		value: '00:00',
		allowBlank: false
	    },
	    selModeField,
	    selPool
	];

	var column2 = [
	    {
		xtype: 'textfield',
		fieldLabel: gettext('Send email to'),
		name: 'mailto'
	    },
	    {
		xtype: 'pveEmailNotificationSelector',
		fieldLabel: gettext('Email notification'),
		name: 'mailnotification',
		deleteEmpty: me.isCreate ? false : true,
		value: me.isCreate ? 'always' : ''
	    },
	    {
		xtype: 'pveCompressionSelector',
		fieldLabel: gettext('Compression'),
		name: 'compress',
		deleteEmpty: me.isCreate ? false : true,
		value: 'zstd'
	    },
	    {
		xtype: 'pveBackupModeSelector',
		fieldLabel: gettext('Mode'),
		value: 'snapshot',
		name: 'mode'
	    },
	    {
		xtype: 'proxmoxcheckbox',
		fieldLabel: gettext('Enable'),
		name: 'enabled',
		uncheckedValue: 0,
		defaultValue: 1,
		checked: true
	    },
	    vmidField
	];
	/*jslint confusion: false*/

	var ipanel = Ext.create('Proxmox.panel.InputPanel', {
	    onlineHelp: 'chapter_vzdump',
	    column1: column1,
	    column2:  column2,
	    onGetValues: function(values) {
		if (!values.node) {
		    if (!me.isCreate) {
			Proxmox.Utils.assemble_field_data(values, { 'delete': 'node' });
		    }
		    delete values.node;
		}

		var selMode = values.selMode;
		delete values.selMode;

		if (selMode === 'all') {
		    values.all = 1;
		    values.exclude = '';
		    delete values.vmid;
		} else if (selMode === 'exclude') {
		    values.all = 1;
		    values.exclude = values.vmid;
		    delete values.vmid;
		} else if (selMode === 'pool') {
		    delete values.vmid;
		}

		if (selMode !== 'pool') {
		    delete values.pool;
		}
		return values;
	    }
	});

	var update_vmid_selection = function(list, mode) {
	    if (mode !== 'all' && mode !== 'pool') {
		sm.deselectAll(true);
		if (list) {
		    Ext.Array.each(list.split(','), function(vmid) {
			var rec = store.findRecord('vmid', vmid);
			if (rec) {
			    sm.select(rec, true);
			}
		    });
		}
	    }
	};

	vmidField.on('change', function(f, value) {
	    var mode = selModeField.getValue();
	    update_vmid_selection(value, mode);
	});

	selModeField.on('change', function(f, value, oldValue) {
	    if (oldValue === 'pool') {
		store.removeFilter('poolFilter');
	    }

	    if (oldValue === 'all') {
		sm.deselectAll(true);
		vmidField.setValue('');
	    }

	    if (value === 'all') {
		sm.selectAll(true);
		vmgrid.setDisabled(true);
	    } else {
		vmgrid.setDisabled(false);
	    }

	    if (value === 'pool') {
		vmgrid.setDisabled(true);
		vmidField.setValue('');
		selPool.setVisible(true);
		selPool.allowBlank = false;
		selectPoolMembers(selPool.value);

	    } else {
		selPool.setVisible(false);
		selPool.allowBlank = true;
	    }
	    var list = vmidField.getValue();
	    update_vmid_selection(list, value);
	});

	var reload = function() {
	    store.load({
		params: { type: 'vm' },
		callback: function() {
		    var node = nodesel.getValue();
		    store.clearFilter();
		    store.filterBy(function(rec) {
			return (!node || node.length === 0 || rec.get('node') === node);
		    });
		    var list = vmidField.getValue();
		    var mode = selModeField.getValue();
		    if (mode === 'all') {
			sm.selectAll(true);
		    } else if (mode === 'pool'){
			selectPoolMembers(selPool.value);
		    } else {
			update_vmid_selection(list, mode);
		    }
		}
	    });
	};

        Ext.applyIf(me, {
            subject: gettext("Backup Job"),
            url: url,
            method: method,
	    items: [ ipanel, vmgrid ]
        });

        me.callParent();

        if (me.isCreate) {
	    selModeField.setValue('include');
	} else {
            me.load({
		success: function(response, options) {
		    var data = response.result.data;

		    data.dow = data.dow.split(',');

		    if (data.all || data.exclude) {
			if (data.exclude) {
			    data.vmid = data.exclude;
			    data.selMode = 'exclude';
			} else {
			    data.vmid = '';
			    data.selMode = 'all';
			}
		    } else if (data.pool) {
			data.selMode = 'pool';
			data.selPool = data.pool;
		    } else {
			data.selMode = 'include';
		    }

		    me.setValues(data);
               }
            });
        }

	reload();
    }
});


Ext.define('PVE.dc.BackupView', {
    extend: 'Ext.grid.GridPanel',

    alias: ['widget.pveDcBackupView'],

    onlineHelp: 'chapter_vzdump',

    allText: '-- ' + gettext('All') + ' --',
    allExceptText: gettext('All except {0}'),

    initComponent : function() {
	var me = this;

	var store = new Ext.data.Store({
	    model: 'pve-cluster-backup',
	    proxy: {
                type: 'proxmox',
		url: "/api2/json/cluster/backup"
	    }
	});

	var reload = function() {
	    store.load();
	};

	var sm = Ext.create('Ext.selection.RowModel', {});

	var run_editor = function() {
	    var rec = sm.getSelection()[0];
	    if (!rec) {
		return;
	    }

	    var win = Ext.create('PVE.dc.BackupEdit', {
		jobid: rec.data.id
	    });
	    win.on('destroy', reload);
	    win.show();
	};

	var run_backup_now = function(job) {
	    job = Ext.clone(job);

	    let jobNode = job.node;
	    // Remove properties related to scheduling
	    delete job.enabled;
	    delete job.starttime;
	    delete job.dow;
	    delete job.id;
	    delete job.node;
	    job.all = job.all === true ? 1 : 0;

	    let allNodes = PVE.data.ResourceStore.getNodes();
	    let nodes = allNodes.filter(node => node.status === 'online').map(node => node.node);
	    let errors = [];

	    if (jobNode !== undefined) {
		if (!nodes.includes(jobNode)) {
		    Ext.Msg.alert('Error', "Node '"+ jobNode +"' from backup job isn't online!");
		    return;
		}
		nodes = [ jobNode ];
	    } else {
		let unkownNodes = allNodes.filter(node => node.status !== 'online');
		if (unkownNodes.length > 0)
		    errors.push(unkownNodes.map(node => node.node + ": " + gettext("Node is offline")));
	    }
	    let jobTotalCount = nodes.length, jobsStarted = 0;

	    Ext.Msg.show({
		title: gettext('Please wait...'),
		closable: false,
		progress: true,
		progressText: '0/' + jobTotalCount,
	    });

	    let postRequest = function () {
		jobsStarted++;
		Ext.Msg.updateProgress(jobsStarted / jobTotalCount, jobsStarted + '/' + jobTotalCount);

		if (jobsStarted == jobTotalCount) {
		    Ext.Msg.hide();
		    if (errors.length > 0) {
			Ext.Msg.alert('Error', 'Some errors have been encountered:<br />' + errors.join('<br />'));
		    }
		}
	    };

	    nodes.forEach(node => Proxmox.Utils.API2Request({
		url: '/nodes/' + node + '/vzdump',
		method: 'POST',
		params: job,
		failure: function (response, opts) {
		    errors.push(node + ': ' + response.htmlStatus);
		    postRequest();
		},
		success: postRequest
	    }));
	};

	var edit_btn = new Proxmox.button.Button({
	    text: gettext('Edit'),
	    disabled: true,
	    selModel: sm,
	    handler: run_editor
	});

	var run_btn = new Proxmox.button.Button({
	    text: gettext('Run now'),
	    disabled: true,
	    selModel: sm,
	    handler: function() {
		var rec = sm.getSelection()[0];
		if (!rec) {
		    return;
		}

		Ext.Msg.show({
		    title: gettext('Confirm'),
		    icon: Ext.Msg.QUESTION,
		    msg: gettext('Start the selected backup job now?'),
		    buttons: Ext.Msg.YESNO,
		    callback: function(btn) {
			if (btn !== 'yes') {
			    return;
			}
			run_backup_now(rec.data);
		    }
		});
	    }
	});

	var remove_btn = Ext.create('Proxmox.button.StdRemoveButton', {
	    selModel: sm,
	    baseurl: '/cluster/backup',
	    callback: function() {
		reload();
	    }
	});

	Proxmox.Utils.monStoreErrors(me, store);

	Ext.apply(me, {
	    store: store,
	    selModel: sm,
	    stateful: true,
	    stateId: 'grid-dc-backup',
	    viewConfig: {
		trackOver: false
	    },
	    tbar: [
		{
		    text: gettext('Add'),
		    handler: function() {
			var win = Ext.create('PVE.dc.BackupEdit',{});
			win.on('destroy', reload);
			win.show();
		    }
		},
		'-',
		remove_btn,
		edit_btn,
		'-',
		run_btn
	    ],
	    columns: [
		{
		    header: gettext('Enabled'),
		    width: 80,
		    dataIndex: 'enabled',
		    xtype: 'checkcolumn',
		    sortable: true,
		    disabled: true,
		    disabledCls: 'x-item-enabled',
		    stopSelection: false
		},
		{
		    header: gettext('Node'),
		    width: 100,
		    sortable: true,
		    dataIndex: 'node',
		    renderer: function(value) {
			if (value) {
			    return value;
			}
			return me.allText;
		    }
		},
		{
		    header: gettext('Day of week'),
		    width: 200,
		    sortable: false,
		    dataIndex: 'dow',
		    renderer: function(val) {
			var dows = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
			var selected = [];
			var cur = -1;
			val.split(',').forEach(function(day){
			    cur++;
			    var dow = (dows.indexOf(day)+6)%7;
			    if (cur === dow) {
				if (selected.length === 0 || selected[selected.length-1] === 0) {
				    selected.push(1);
				} else {
				    selected[selected.length-1]++;
				}
			    } else {
				while (cur < dow) {
				    cur++;
				    selected.push(0);
				}
				selected.push(1);
			    }
			});

			cur = -1;
			var days = [];
			selected.forEach(function(item) {
			    cur++;
			    if (item > 2) {
				days.push(Ext.Date.dayNames[(cur+1)] + '-' + Ext.Date.dayNames[(cur+item)%7]);
				cur += item-1;
			    } else if (item == 2) {
				days.push(Ext.Date.dayNames[cur+1]);
				days.push(Ext.Date.dayNames[(cur+2)%7]);
				cur++;
			    } else if (item == 1) {
				days.push(Ext.Date.dayNames[(cur+1)%7]);
			    }
			});
			return days.join(', ');
		    }
		},
		{
		    header: gettext('Start Time'),
		    width: 60,
		    sortable: true,
		    dataIndex: 'starttime'
		},
		{
		    header: gettext('Storage'),
		    width: 100,
		    sortable: true,
		    dataIndex: 'storage'
		},
		{
		    header: gettext('Selection'),
		    flex: 1,
		    sortable: false,
		    dataIndex: 'vmid',
		    renderer: function(value, metaData, record) {
			/*jslint confusion: true */
			if (record.data.all) {
			    if (record.data.exclude) {
				return Ext.String.format(me.allExceptText, record.data.exclude);
			    }
			    return me.allText;
			}
			if (record.data.vmid) {
			    return record.data.vmid;
			}

			if (record.data.pool) {
			    return "Pool '"+ record.data.pool + "'";
			}

			return "-";
		    }
		}
	    ],
	    listeners: {
		activate: reload,
		itemdblclick: run_editor
	    }
	});

	me.callParent();
    }
}, function() {

    Ext.define('pve-cluster-backup', {
	extend: 'Ext.data.Model',
	fields: [
	    'id', 'starttime', 'dow',
	    'storage', 'node', 'vmid', 'exclude',
	    'mailto', 'pool', 'compress', 'mode',
	    { name: 'enabled', type: 'boolean' },
	    { name: 'all', type: 'boolean' }
	]
    });
});
