Ext.define('PVE.dc.BackupEdit', {
    extend: 'Proxmox.window.Edit',
    alias: ['widget.pveDcBackupEdit'],

    defaultFocus: undefined,

    initComponent: function() {
	let me = this;

	me.isCreate = !me.jobid;

	let url, method;
	if (me.isCreate) {
	    url = '/api2/extjs/cluster/backup';
	    method = 'POST';
	} else {
	    url = '/api2/extjs/cluster/backup/' + me.jobid;
	    method = 'PUT';
	}

	let vmidField = Ext.create('Ext.form.field.Hidden', {
	    name: 'vmid',
	});

	// 'value' can be assigned a string or an array
	let selModeField = Ext.create('Proxmox.form.KVComboBox', {
	    xtype: 'proxmoxKVComboBox',
	    comboItems: [
		['include', gettext('Include selected VMs')],
		['all', gettext('All')],
		['exclude', gettext('Exclude selected VMs')],
		['pool', gettext('Pool based')],
	    ],
	    fieldLabel: gettext('Selection mode'),
	    name: 'selMode',
	    value: '',
	});

	let sm = Ext.create('Ext.selection.CheckboxModel', {
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
		},
	    },
	});

	let storagesel = Ext.create('PVE.form.StorageSelector', {
	    fieldLabel: gettext('Storage'),
	    nodename: 'localhost',
	    storageContent: 'backup',
	    allowBlank: false,
	    name: 'storage',
	    listeners: {
		change: function(f, v) {
		    let store = f.getStore();
		    let rec = store.findRecord('storage', v, 0, false, true, true);
		    let compressionSelector = me.down('pveCompressionSelector');

		    if (rec && rec.data && rec.data.type === 'pbs') {
			compressionSelector.setValue('zstd');
			compressionSelector.setDisabled(true);
		    } else if (!compressionSelector.getEditable()) {
			compressionSelector.setDisabled(false);
		    }
		},
	    },
	});

	let store = new Ext.data.Store({
	    model: 'PVEResources',
	    sorters: {
		property: 'vmid',
		order: 'ASC',
	    },
	});

	let vmgrid = Ext.createWidget('grid', {
	    store: store,
	    border: true,
	    height: 300,
	    selModel: sm,
	    disabled: true,
	    columns: [
		{
		    header: 'ID',
		    dataIndex: 'vmid',
		    width: 60,
		},
		{
		    header: gettext('Node'),
		    dataIndex: 'node',
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
		    },
		},
		{
		    header: gettext('Name'),
		    dataIndex: 'name',
		    flex: 1,
		},
		{
		    header: gettext('Type'),
		    dataIndex: 'type',
		},
	    ],
	});

	let selectPoolMembers = function(poolid) {
	    if (!poolid) {
		return;
	    }
	    sm.deselectAll(true);
	    store.filter([
		{
		    id: 'poolFilter',
		    property: 'pool',
		    value: poolid,
		},
	    ]);
	    sm.selectAll(true);
	};

	let selPool = Ext.create('PVE.form.PoolSelector', {
	    fieldLabel: gettext('Pool to backup'),
	    hidden: true,
	    allowBlank: true,
	    name: 'pool',
	    listeners: {
		change: function(selpool, newValue, oldValue) {
		    selectPoolMembers(newValue);
		},
	    },
	});

	let nodesel = Ext.create('PVE.form.NodeSelector', {
	    name: 'node',
	    fieldLabel: gettext('Node'),
	    allowBlank: true,
	    editable: true,
	    autoSelect: false,
	    emptyText: '-- ' + gettext('All') + ' --',
	    listeners: {
		change: function(f, value) {
		    storagesel.setNodename(value || 'localhost');
		    let mode = selModeField.getValue();
		    store.clearFilter();
		    store.filterBy(function(rec) {
			return !value || rec.get('node') === value;
		    });
		    if (mode === 'all') {
			sm.selectAll(true);
		    }
		    if (mode === 'pool') {
			selectPoolMembers(selPool.value);
		    }
		},
	    },
	});

	let column1 = [
	    nodesel,
	    storagesel,
	    {
		xtype: 'pveDayOfWeekSelector',
		name: 'dow',
		fieldLabel: gettext('Day of week'),
		multiSelect: true,
		value: ['sat'],
		allowBlank: false,
	    },
	    {
		xtype: 'timefield',
		fieldLabel: gettext('Start Time'),
		name: 'starttime',
		format: 'H:i',
		formatText: 'HH:MM',
		value: '00:00',
		allowBlank: false,
	    },
	    selModeField,
	    selPool,
	];

	let column2 = [
	    {
		xtype: 'textfield',
		fieldLabel: gettext('Send email to'),
		name: 'mailto',
	    },
	    {
		xtype: 'pveEmailNotificationSelector',
		fieldLabel: gettext('Email notification'),
		name: 'mailnotification',
		deleteEmpty: !me.isCreate,
		value: me.isCreate ? 'always' : '',
	    },
	    {
		xtype: 'pveCompressionSelector',
		fieldLabel: gettext('Compression'),
		name: 'compress',
		deleteEmpty: !me.isCreate,
		value: 'zstd',
	    },
	    {
		xtype: 'pveBackupModeSelector',
		fieldLabel: gettext('Mode'),
		value: 'snapshot',
		name: 'mode',
	    },
	    {
		xtype: 'proxmoxcheckbox',
		fieldLabel: gettext('Enable'),
		name: 'enabled',
		uncheckedValue: 0,
		defaultValue: 1,
		checked: true,
	    },
	    vmidField,
	];

	let ipanel = Ext.create('Proxmox.panel.InputPanel', {
	    onlineHelp: 'chapter_vzdump',
	    column1: column1,
	    column2: column2,
	    onGetValues: function(values) {
		if (!values.node) {
		    if (!me.isCreate) {
			Proxmox.Utils.assemble_field_data(values, { 'delete': 'node' });
		    }
		    delete values.node;
		}

		let selMode = values.selMode;
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
	    },
	});

	let update_vmid_selection = function(list, mode) {
	    if (mode !== 'all' && mode !== 'pool') {
		sm.deselectAll(true);
		if (list) {
		    Ext.Array.each(list.split(','), function(vmid) {
			var rec = store.findRecord('vmid', vmid, 0, false, true, true);
			if (rec) {
			    sm.select(rec, true);
			}
		    });
		}
	    }
	};

	vmidField.on('change', function(f, value) {
	    let mode = selModeField.getValue();
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
	    let list = vmidField.getValue();
	    update_vmid_selection(list, value);
	});

	let reload = function() {
	    store.load({
		params: {
		    type: 'vm',
		},
		callback: function() {
		    let node = nodesel.getValue();
		    store.clearFilter();
		    store.filterBy(rec => !node || node.length === 0 || rec.get('node') === node);
		    let list = vmidField.getValue();
		    let mode = selModeField.getValue();
		    if (mode === 'all') {
			sm.selectAll(true);
		    } else if (mode === 'pool') {
			selectPoolMembers(selPool.value);
		    } else {
			update_vmid_selection(list, mode);
		    }
		},
	    });
	};

	Ext.applyIf(me, {
	    subject: gettext("Backup Job"),
	    url: url,
	    method: method,
	    bodyPadding: 0,
	    items: [
		{
		    xtype: 'tabpanel',
		    region: 'center',
		    layout: 'fit',
		    bodyPadding: 10,
		    items: [
			{
			    xtype: 'container',
			    title: gettext('General'),
			    region: 'center',
			    layout: {
				type: 'vbox',
				align: 'stretch',
			    },
			    items: [
				ipanel,
				vmgrid,
			    ],
			},
			{
			    xtype: 'pveBackupJobPrunePanel',
			    title: gettext('Retention'),
			    isCreate: me.isCreate,
			    keepAllDefaultForCreate: false,
			    showPBSHint: false,
			    fallbackHintHtml: gettext('Without any keep option, the storage\'s configuration or node\'s vzdump.conf is used as fallback'),
			},
		    ],
		},
	    ],

	});

	me.callParent();

	if (me.isCreate) {
	    selModeField.setValue('include');
	} else {
            me.load({
		success: function(response, options) {
		    let data = response.result.data;

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

		    if (data['prune-backups']) {
			Object.assign(data, data['prune-backups']);
			delete data['prune-backups'];
		    } else if (data.maxfiles !== undefined) {
			if (data.maxfiles > 0) {
			    data['keep-last'] = data.maxfiles;
			} else {
			    data['keep-all'] = 1;
			}
			delete data.maxfiles;
		    }

		    me.setValues(data);
		},
	    });
	}

	reload();
    },
});


Ext.define('PVE.dc.BackupDiskTree', {
    extend: 'Ext.tree.Panel',
    alias: 'widget.pveBackupDiskTree',

    folderSort: true,
    rootVisible: false,

    store: {
	sorters: 'id',
	data: {},
    },

    tools: [
	{
	    type: 'expand',
	    tooltip: gettext('Expand All'),
	    callback: panel => panel.expandAll(),
	},
	{
	    type: 'collapse',
	    tooltip: gettext('Collapse All'),
	    callback: panel => panel.collapseAll(),
	},
    ],

    columns: [
	{
	    xtype: 'treecolumn',
	    text: gettext('Guest Image'),
	    renderer: function(value, meta, record) {
		if (record.data.type) {
		    // guest level
		    let ret = value;
		    if (record.data.name) {
			ret += " (" + record.data.name + ")";
		    }
		    return ret;
		} else {
		    // extJS needs unique IDs but we only want to show the volumes key from "vmid:key"
		    return value.split(':')[1] + " - " + record.data.name;
		}
	    },
	    dataIndex: 'id',
	    flex: 6,
	},
	{
	    text: gettext('Type'),
	    dataIndex: 'type',
	    flex: 1,
	},
	{
	    text: gettext('Backup Job'),
	    renderer: PVE.Utils.render_backup_status,
	    dataIndex: 'included',
	    flex: 3,
	},
    ],

    reload: function() {
	let me = this;
	let sm = me.getSelectionModel();

	Proxmox.Utils.API2Request({
	    url: `/cluster/backup/${me.jobid}/included_volumes`,
	    waitMsgTarget: me,
	    method: 'GET',
	    failure: function(response, opts) {
		Proxmox.Utils.setErrorMask(me, response.htmlStatus);
	    },
	    success: function(response, opts) {
		sm.deselectAll();
		me.setRootNode(response.result.data);
		me.expandAll();
	    },
	});
    },

    initComponent: function() {
	var me = this;

	if (!me.jobid) {
	    throw "no job id specified";
	}

	var sm = Ext.create('Ext.selection.TreeModel', {});

	Ext.apply(me, {
	    selModel: sm,
	    fields: ['id', 'type',
		{
		    type: 'string',
		    name: 'iconCls',
		    calculate: function(data) {
			var txt = 'fa x-fa-tree fa-';
			if (data.leaf && !data.type) {
			    return txt + 'hdd-o';
			} else if (data.type === 'qemu') {
			    return txt + 'desktop';
			} else if (data.type === 'lxc') {
			    return txt + 'cube';
			} else {
			    return txt + 'question-circle';
			}
		    },
		},
	    ],
	    header: {
		items: [{
		    xtype: 'textfield',
		    fieldLabel: gettext('Search'),
		    labelWidth: 50,
		    emptyText: 'Name, VMID, Type',
		    width: 200,
		    padding: '0 5 0 0',
		    enableKeyEvents: true,
		    listeners: {
			buffer: 500,
			keyup: function(field) {
			    let searchValue = field.getValue().toLowerCase();
			    me.store.clearFilter(true);
			    me.store.filterBy(function(record) {
				let data = {};
				if (record.data.depth === 0) {
				    return true;
				} else if (record.data.depth === 1) {
				    data = record.data;
				} else if (record.data.depth === 2) {
				    data = record.parentNode.data;
				}

				for (const property of ['name', 'id', 'type']) {
				    if (!data[property]) {
					continue;
				    }
				    let v = data[property].toString();
				    if (v !== undefined) {
					v = v.toLowerCase();
					if (v.includes(searchValue)) {
					    return true;
					}
				    }
				}
				return false;
			    });
			},
		    },
		}],
	    },
	});

	me.callParent();

	me.reload();
    },
});

Ext.define('PVE.dc.BackupInfo', {
    extend: 'Proxmox.panel.InputPanel',
    alias: 'widget.pveBackupInfo',

    viewModel: {
	data: {
	    retentionType: 'none',
	},
	formulas: {
	    hasRetention: (get) => get('retentionType') !== 'none',
	    retentionKeepAll: (get) => get('retentionType') === 'all',
	},
    },

    padding: '5 0 5 10',

    column1: [
	{
	    xtype: 'displayfield',
	    name: 'node',
	    fieldLabel: gettext('Node'),
	    renderer: value => value || `-- ${gettext('All')} --`,
	},
	{
	    xtype: 'displayfield',
	    name: 'storage',
	    fieldLabel: gettext('Storage'),
	},
	{
	    xtype: 'displayfield',
	    name: 'dow',
	    fieldLabel: gettext('Day of week'),
	    renderer: PVE.Utils.render_backup_days_of_week,
	},
	{
	    xtype: 'displayfield',
	    name: 'starttime',
	    fieldLabel: gettext('Start Time'),
	},
	{
	    xtype: 'displayfield',
	    name: 'selMode',
	    fieldLabel: gettext('Selection mode'),
	},
	{
	    xtype: 'displayfield',
	    name: 'pool',
	    fieldLabel: gettext('Pool to backup'),
	},
    ],
    column2: [
	{
	    xtype: 'displayfield',
	    name: 'mailto',
	    fieldLabel: gettext('Send email to'),
	},
	{
	    xtype: 'displayfield',
	    name: 'mailnotification',
	    fieldLabel: gettext('Email notification'),
	    renderer: function(value) {
		let msg;
		switch (value) {
		    case 'always':
			msg = gettext('Always');
			break;
		    case 'failure':
			msg = gettext('On failure only');
			break;
		}
		return msg;
	    },
	},
	{
	    xtype: 'displayfield',
	    name: 'compress',
	    fieldLabel: gettext('Compression'),
	},
	{
	    xtype: 'displayfield',
	    name: 'mode',
	    fieldLabel: gettext('Mode'),
	    renderer: function(value) {
		let msg;
		switch (value) {
		    case 'snapshot':
			msg = gettext('Snapshot');
			break;
		    case 'suspend':
			msg = gettext('Suspend');
			break;
		    case 'stop':
			msg = gettext('Stop');
			break;
		}
		return msg;
	    },
	},
	{
	    xtype: 'displayfield',
	    name: 'enabled',
	    fieldLabel: gettext('Enabled'),
	    renderer: v => PVE.Parser.parseBoolean(v.toString()) ? gettext('Yes') : gettext('No'),
	},
    ],

    columnB: [
	{
	    xtype: 'label',
	    name: 'pruneLabel',
	    text: gettext('Retention Configuration') + ':',
	    bind: {
		hidden: '{!hasRetention}',
	    },
	},
	{
	    layout: 'hbox',
	    border: false,
	    defaults: {
		border: false,
		layout: 'anchor',
		flex: 1,
	    },
	    items: [
		{
		    padding: '0 10 0 0',
		    defaults: {
			labelWidth: 110,
		    },
		    items: [{
			xtype: 'displayfield',
			name: 'keep-all',
			fieldLabel: gettext('Keep All'),
			renderer: Proxmox.Utils.format_boolean,
			bind: {
			    hidden: '{!retentionKeepAll}',
			},
		    }].concat(
			[
			    ['keep-last', gettext('Keep Last')],
			    ['keep-daily', gettext('Keep Daily')],
			    ['keep-monthly', gettext('Keep Monthly')],
			].map(
			    name => ({
				xtype: 'displayfield',
				name: name[0],
				fieldLabel: name[1],
				bind: {
				    hidden: '{!hasRetention || retentionKeepAll}',
				},
			    }),
			),
		    ),
		},
		{
		    padding: '0 0 0 10',
		    defaults: {
			labelWidth: 110,
		    },
		    items: [
			['keep-hourly', gettext('Keep Hourly')],
			['keep-weekly', gettext('Keep Weekly')],
			['keep-yearly', gettext('Keep Yearly')],
		    ].map(
			name => ({
			    xtype: 'displayfield',
			    name: name[0],
			    fieldLabel: name[1],
			    bind: {
				hidden: '{!hasRetention || retentionKeepAll}',
			    },
			}),
		    ),
		},
	    ],
	},
    ],

    setValues: function(values) {
	var me = this;
	let vm = me.getViewModel();

        Ext.iterate(values, function(fieldId, val) {
	    let field = me.query('[isFormField][name=' + fieldId + ']')[0];
	    if (field) {
		field.setValue(val);
            }
	});

	if (values['prune-backups'] || values.maxfiles !== undefined) {
	    const keepNames = [
		'keep-all',
		'keep-last',
		'keep-hourly',
		'keep-daily',
		'keep-weekly',
		'keep-monthly',
		'keep-yearly',
	    ];

	    let keepValues;
	    if (values['prune-backups']) {
		keepValues = values['prune-backups'];
	    } else if (values.maxfiles > 0) {
		keepValues = { 'keep-last': values.maxfiles };
	    } else {
		keepValues = { 'keep-all': 1 };
	    }

	    vm.set('retentionType', keepValues['keep-all'] ? 'all' : 'other');

	    keepNames.forEach(function(name) {
		let field = me.query('[isFormField][name=' + name + ']')[0];
		if (field) {
		    field.setValue(keepValues[name]);
		}
	    });
	} else {
	    vm.set('retentionType', 'none');
	}

	// selection Mode depends on the presence/absence of several keys
	let selModeField = me.query('[isFormField][name=selMode]')[0];
	let selMode = 'none';
	if (values.vmid) {
	    selMode = gettext('Include selected VMs');
	}
	if (values.all) {
	    selMode = gettext('All');
	}
	if (values.exclude) {
	     selMode = gettext('Exclude selected VMs');
	}
	if (values.pool) {
	    selMode = gettext('Pool based');
	}
	selModeField.setValue(selMode);

	if (!values.pool) {
	    let poolField = me.query('[isFormField][name=pool]')[0];
	    poolField.setVisible(0);
	}
    },

    initComponent: function() {
	var me = this;

	if (!me.record) {
	    throw "no data provided";
	}
	me.callParent();

	me.setValues(me.record);
    },
});


Ext.define('PVE.dc.BackedGuests', {
    extend: 'Ext.grid.GridPanel',
    alias: 'widget.pveBackedGuests',

    textfilter: '',

    columns: [
	{
	    header: gettext('Type'),
	    dataIndex: "type",
	    renderer: PVE.Utils.render_resource_type,
	    flex: 1,
	    sortable: true,
	},
	{
	    header: gettext('VMID'),
	    dataIndex: 'vmid',
	    flex: 1,
	    sortable: true,
	},
	{
	    header: gettext('Name'),
	    dataIndex: 'name',
	    flex: 2,
	    sortable: true,
	},
    ],

    initComponent: function() {
	let me = this;

	me.store.clearFilter(true);

	Ext.apply(me, {
	    stateful: true,
	    stateId: 'grid-dc-backed-guests',
	    tbar: [
	        '->',
		gettext('Search') + ':', ' ',
		{
		    xtype: 'textfield',
		    width: 200,
		    emptyText: 'Name, VMID, Type',
		    enableKeyEvents: true,
		    listeners: {
			buffer: 500,
			keyup: function(field) {
			    let searchValue = field.getValue().toLowerCase();
			    me.store.clearFilter(true);
			    me.store.filterBy(function(record) {
				let data = record.data;
				for (const property in ['name', 'id', 'type']) {
				    if (data[property] === null) {
					continue;
				    }
				    let v = data[property].toString();
				    if (v !== undefined) {
					v = v.toLowerCase();
					if (v.includes(searchValue)) {
					    return true;
					}
				    }
				}
				return false;
			    });
			},
		    },
		},
	    ],
	    viewConfig: {
		stripeRows: true,
		trackOver: false,
            },
	});
	me.callParent();
    },
});

Ext.define('PVE.dc.BackupView', {
    extend: 'Ext.grid.GridPanel',

    alias: ['widget.pveDcBackupView'],

    onlineHelp: 'chapter_vzdump',

    allText: '-- ' + gettext('All') + ' --',

    initComponent: function() {
	let me = this;

	let store = new Ext.data.Store({
	    model: 'pve-cluster-backup',
	    proxy: {
		type: 'proxmox',
		url: "/api2/json/cluster/backup",
	    },
	});

	let not_backed_store = new Ext.data.Store({
	    sorters: 'vmid',
	    proxy: {
		type: 'proxmox',
		url: 'api2/json/cluster/backup-info/not-backed-up',
	    },
	});

	let noBackupJobWarning, noBackupJobInfoButton;
	let reload = function() {
	    store.load();
	    not_backed_store.load({
		callback: function(records, operation, success) {
		    noBackupJobWarning.setVisible(records.length > 0);
		    noBackupJobInfoButton.setVisible(records.length > 0);
		},
	    });
	};

	let sm = Ext.create('Ext.selection.RowModel', {});

	let run_editor = function() {
	    let rec = sm.getSelection()[0];
	    if (!rec) {
		return;
	    }

	    let win = Ext.create('PVE.dc.BackupEdit', {
		jobid: rec.data.id,
	    });
	    win.on('destroy', reload);
	    win.show();
	};

	let run_detail = function() {
	    let record = sm.getSelection()[0];
	    if (!record) {
		return;
	    }
	    Ext.create('Ext.window.Window', {
		modal: true,
		width: 800,
		height: 600,
		stateful: true,
		stateId: 'backup-detail-view',
		resizable: true,
		layout: 'fit',
		title: gettext('Backup Details'),
		items: [
		    {
			xtype: 'panel',
			region: 'center',
			layout: {
			    type: 'vbox',
			    align: 'stretch',
			},
			items: [
			    {
				xtype: 'pveBackupInfo',
				flex: 0,
				layout: 'fit',
				record: record.data,
			    },
			    {
				xtype: 'pveBackupDiskTree',
				title: gettext('Included disks'),
				flex: 1,
				jobid: record.data.id,
			    },
			],
		    },
		],
	    }).show();
	};

	let run_backup_now = function(job) {
	    job = Ext.clone(job);

	    let jobNode = job.node;
	    // Remove properties related to scheduling
	    delete job.enabled;
	    delete job.starttime;
	    delete job.dow;
	    delete job.id;
	    delete job.node;
	    job.all = job.all === true ? 1 : 0;

	    if (job['prune-backups']) {
		job['prune-backups'] = PVE.Parser.printPropertyString(job['prune-backups']);
	    }

	    let allNodes = PVE.data.ResourceStore.getNodes();
	    let nodes = allNodes.filter(node => node.status === 'online').map(node => node.node);
	    let errors = [];

	    if (jobNode !== undefined) {
		if (!nodes.includes(jobNode)) {
		    Ext.Msg.alert('Error', "Node '"+ jobNode +"' from backup job isn't online!");
		    return;
		}
		nodes = [jobNode];
	    } else {
		let unkownNodes = allNodes.filter(node => node.status !== 'online');
		if (unkownNodes.length > 0) {errors.push(unkownNodes.map(node => node.node + ": " + gettext("Node is offline")));}
	    }
	    let jobTotalCount = nodes.length, jobsStarted = 0;

	    Ext.Msg.show({
		title: gettext('Please wait...'),
		closable: false,
		progress: true,
		progressText: '0/' + jobTotalCount,
	    });

	    let postRequest = function() {
		jobsStarted++;
		Ext.Msg.updateProgress(jobsStarted / jobTotalCount, jobsStarted + '/' + jobTotalCount);

		if (jobsStarted === jobTotalCount) {
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
		failure: function(response, opts) {
		    errors.push(node + ': ' + response.htmlStatus);
		    postRequest();
		},
		success: postRequest,
	    }));
	};

	let run_show_not_backed = function() {
	    Ext.create('Ext.window.Window', {
		modal: true,
		width: 600,
		height: 500,
		resizable: true,
		layout: 'fit',
		title: gettext('Guests without backup job'),
		items: [
		    {
			xtype: 'panel',
			region: 'center',
			layout: {
			    type: 'vbox',
			    align: 'stretch',
			},
			items: [
			    {
				xtype: 'pveBackedGuests',
				flex: 1,
				layout: 'fit',
				store: not_backed_store,
			    },
			],
		    },
		],
	    }).show();
	};

	var edit_btn = new Proxmox.button.Button({
	    text: gettext('Edit'),
	    disabled: true,
	    selModel: sm,
	    handler: run_editor,
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
		    },
		});
	    },
	});

	var remove_btn = Ext.create('Proxmox.button.StdRemoveButton', {
	    selModel: sm,
	    baseurl: '/cluster/backup',
	    callback: function() {
		reload();
	    },
	});

	var detail_btn = new Proxmox.button.Button({
	    text: gettext('Job Detail'),
	    disabled: true,
	    tooltip: gettext('Show job details and which guests and volumes are affected by the backup job'),
	    selModel: sm,
	    handler: run_detail,
	});

	noBackupJobWarning = Ext.create('Ext.toolbar.TextItem', {
	    html: '<i class="fa fa-fw fa-exclamation-circle"></i>' + gettext('Some guests are not covered by any backup job.'),
	    hidden: true,
	});

	noBackupJobInfoButton = new Proxmox.button.Button({
	    text: gettext('Show'),
	    hidden: true,
	    handler: run_show_not_backed,
	});

	Proxmox.Utils.monStoreErrors(me, store);

	Ext.apply(me, {
	    store: store,
	    selModel: sm,
	    stateful: true,
	    stateId: 'grid-dc-backup',
	    viewConfig: {
		trackOver: false,
	    },
	    tbar: [
		{
		    text: gettext('Add'),
		    handler: function() {
			var win = Ext.create('PVE.dc.BackupEdit', {});
			win.on('destroy', reload);
			win.show();
		    },
		},
		'-',
		remove_btn,
		edit_btn,
		detail_btn,
		'-',
		run_btn,
		'->',
		noBackupJobWarning,
		noBackupJobInfoButton,
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
		    stopSelection: false,
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
		    },
		},
		{
		    header: gettext('Day of week'),
		    width: 200,
		    sortable: false,
		    dataIndex: 'dow',
		    renderer: PVE.Utils.render_backup_days_of_week,
		},
		{
		    header: gettext('Start Time'),
		    width: 60,
		    sortable: true,
		    dataIndex: 'starttime',
		},
		{
		    header: gettext('Storage'),
		    width: 100,
		    sortable: true,
		    dataIndex: 'storage',
		},
		{
		    header: gettext('Selection'),
		    flex: 1,
		    sortable: false,
		    dataIndex: 'vmid',
		    renderer: PVE.Utils.render_backup_selection,
		},
	    ],
	    listeners: {
		activate: reload,
		itemdblclick: run_editor,
	    },
	});

	me.callParent();
    },
}, function() {
    Ext.define('pve-cluster-backup', {
	extend: 'Ext.data.Model',
	fields: [
	    'id',
	    'compress',
	    'dow',
	    'exclude',
	    'mailto',
	    'mode',
	    'node',
	    'pool',
	    'starttime',
	    'storage',
	    'vmid',
	    { name: 'enabled', type: 'boolean' },
	    { name: 'all', type: 'boolean' },
	],
    });
});
