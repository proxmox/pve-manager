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
		    let sel = selected.map(record => record.data.vmid);
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
	    clusterView: true,
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
		direction: 'ASC',
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
		    storagesel.setNodename(value);
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
		xtype: 'pveCalendarEvent',
		fieldLabel: gettext('Schedule'),
		allowBlank: false,
		name: 'schedule',
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
		fieldLabel: gettext('Email'),
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
	    columnB: [
		{
		    xtype: 'proxmoxtextfield',
		    name: 'comment',
		    fieldLabel: gettext('Job Comment'),
		    deleteEmpty: !me.isCreate,
		    autoEl: {
			tag: 'div',
			'data-qtip': gettext('Description of the job'),
		    },
		},
		vmgrid,
	    ],
	    advancedColumn1: [
		{
		    xtype: 'proxmoxcheckbox',
		    fieldLabel: gettext('Repeat missed'),
		    name: 'repeat-missed',
		    uncheckedValue: 0,
		    defaultValue: 0,
		    deleteDefaultValue: !me.isCreate,
		},
	    ],
	    onGetValues: function(values) {
		if (!values.node) {
		    if (!me.isCreate) {
			Proxmox.Utils.assemble_field_data(values, { 'delete': 'node' });
		    }
		    delete values.node;
		}

		if (!values.id && me.isCreate) {
		    values.id = 'backup-' + Ext.data.identifier.Uuid.Global.generate().slice(0, 13);
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
		selPool.setDisabled(false);
		selPool.allowBlank = false;
		selectPoolMembers(selPool.value);
	    } else {
		selPool.setVisible(false);
		selPool.setDisabled(true);
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
			{
			    xtype: 'inputpanel',
			    title: gettext('Note Template'),
			    region: 'center',
			    layout: {
				type: 'vbox',
				align: 'stretch',
			    },
			    onGetValues: function(values) {
				if (values['notes-template']) {
				    values['notes-template'] = PVE.Utils.escapeNotesTemplate(
					values['notes-template']);
				}
				return values;
			    },
			    items: [
				{
				    xtype: 'textarea',
				    name: 'notes-template',
				    fieldLabel: gettext('Backup Notes'),
                                    height: 100,
				    maxLength: 512,
				    deleteEmpty: !me.isCreate,
				    value: me.isCreate ? '{{guestname}}' : undefined,
				},
				{
				    xtype: 'box',
				    style: {
					margin: '8px 0px',
					'line-height': '1.5em',
				    },
				    html: gettext('The notes are added to each backup created by this job.')
				      + '<br>'
				      + Ext.String.format(
					gettext('Possible template variables are: {0}'),
					PVE.Utils.notesTemplateVars.map(v => `<code>{{${v}}}</code>`).join(', '),
				    ),
				},
			    ],
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

		    data.dow = (data.dow || '').split(',');

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

		    if (data['notes-template']) {
			data['notes-template'] = PVE.Utils.unEscapeNotesTemplate(
			    data['notes-template']);
		    }

		    me.setValues(data);
		},
	    });
	}

	reload();
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
		height: Ext.getBody().getViewSize().height > 1000 ? 800 : 600, // factor out as common infra?
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
	    delete job.schedule;
	    delete job.type;
	    delete job.node;
	    delete job.comment;
	    delete job['next-run'];
	    delete job['repeat-missed'];
	    job.all = job.all === true ? 1 : 0;

	    ['performance', 'prune-backups'].forEach(key => {
		if (job[key]) {
		    job[key] = PVE.Parser.printPropertyString(job[key]);
		}
	    });

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
		'-',
		{
		    xtype: 'proxmoxButton',
		    selModel: null,
		    text: gettext('Schedule Simulator'),
		    handler: () => {
			let record = sm.getSelection()[0];
			let schedule;
			if (record) {
			    schedule = record.data.schedule;
			}
			Ext.create('PVE.window.ScheduleSimulator', {
			    schedule,
			}).show();
		    },
		},
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
		    header: gettext('ID'),
		    dataIndex: 'id',
		    hidden: true,
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
		    header: gettext('Schedule'),
		    width: 150,
		    dataIndex: 'schedule',
		},
		{
		    text: gettext('Next Run'),
		    dataIndex: 'next-run',
		    width: 150,
		    renderer: PVE.Utils.render_next_event,
		},
		{
		    header: gettext('Storage'),
		    width: 100,
		    sortable: true,
		    dataIndex: 'storage',
		},
		{
		    header: gettext('Comment'),
		    dataIndex: 'comment',
		    renderer: Ext.htmlEncode,
		    sorter: (a, b) => (a.data.comment || '').localeCompare(b.data.comment || ''),
		    flex: 1,
		},
		{
		    header: gettext('Retention'),
		    dataIndex: 'prune-backups',
		    renderer: v => v ? PVE.Parser.printPropertyString(v) : gettext('Fallback from storage config'),
		    flex: 2,
		},
		{
		    header: gettext('Selection'),
		    flex: 4,
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
	    'prune-backups',
	    'starttime',
	    'storage',
	    'vmid',
	    { name: 'enabled', type: 'boolean' },
	    { name: 'all', type: 'boolean' },
	],
    });
});
