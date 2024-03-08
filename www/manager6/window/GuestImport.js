Ext.define('PVE.window.GuestImport', {
    extend: 'Proxmox.window.Edit', // fixme: Proxmox.window.Edit?
    alias: 'widget.pveGuestImportWindow',

    title: gettext('Import Guest'),

    submitUrl: function() {
	let me = this;
	return `/nodes/${me.nodename}/qemu`;
    },

    isAdd: true,
    isCreate: true,
    submitText: gettext('Import'),
    showTaskViewer: true,
    method: 'POST',

    loadUrl: function(_url, { storage, nodename, volumeName }) {
	let args = Ext.Object.toQueryString({ volume: volumeName });
	return `/nodes/${nodename}/storage/${storage}/import-metadata?${args}`;
    },

    controller: {
	xclass: 'Ext.app.ViewController',

	setNodename: function(_column, widget) {
	    let me = this;
	    let view = me.getView();
	    widget.setNodename(view.nodename);
	},

	setIsos: function(ignoredVolumes) {
	    let me = this;
	    let isos = Object.entries(ignoredVolumes).map(([id, value]) => `${id}: ${value.replace(/^.*\//, '')}`);
	    if (!isos) {
		return;
	    }
	    let warning = gettext('The following cd images were detected, but will not be carried over:');
	    warning += '<br>' + isos.join('<br>');
	    let warnings = me.getViewModel().get('warnings');
	    warnings.push(warning);
	    me.getViewModel().set('warnings', warnings);
	},

	storageChange: function(storageSelector, value) {
	    let me = this;

	    let grid = me.lookup('diskGrid');
	    let rec = storageSelector.getWidgetRecord();
	    let validFormats = storageSelector.store.getById(value).data.format;
	    grid.query('pveDiskFormatSelector').some((selector) => {
		if (selector.getWidgetRecord().data.id !== rec.data.id) {
		    return false;
		}

		if (validFormats?.[0]?.qcow2) {
		    selector.setDisabled(false);
		    selector.setValue('qcow2');
		} else {
		    selector.setValue('raw');
		    selector.setDisabled(true);
		}

		return true;
	    });
	},

	control: {
	    'grid field': {
		// update records from widgetcolumns
		change: function(widget, value) {
		    let rec = widget.getWidgetRecord();
		    rec.set(widget.name, value);
		    rec.commit();
		},
	    },
	    'pveStorageSelector': {
		change: 'storageChange',
	    },
	},
    },

    viewModel: {
	data: {
	    coreCount: 1,
	    socketCount: 1,
	    warnings: [],
	},

	formulas: {
	    totalCoreCount: get => get('socketCount') * get('coreCount'),
	    hideWarnings: get => get('warnings').length === 0,
	    warningsText: get => get('warnings').join('<br><br>'),
	},
    },

    items: [
	{
	    xtype: 'inputpanel',
	    onGetValues: function(values) {
		let me = this;
		let grid = me.up('pveGuestImportWindow');

		let config = Ext.apply(grid.vmConfig, values);

		if (config.scsi0) {
		    config.scsi0 = config.scsi0.replace('local:0,', 'local:0,format=qcow2,');
		}

		grid.lookup('diskGrid').getStore().each((rec) => {
		    if (!rec.data.enable) {
			return;
		    }
		    let id = rec.data.id;
		    delete rec.data.enable;
		    delete rec.data.id;
		    rec.data.file += ':0'; // for our special api format
		    if (id === 'efidisk0') {
			delete rec.data['import-from'];
		    }
		    config[id] = PVE.Parser.printQemuDrive(rec.data);
		});

		grid.lookup('netGrid').getStore().each((rec) => {
		    if (!rec.data.enable) {
			return;
		    }
		    let id = rec.data.id;
		    delete rec.data.enable;
		    delete rec.data.id;
		    config[id] = PVE.Parser.printQemuNetwork(rec.data);
		});

		if (grid.lookup('liveimport').getValue()) {
		    config['live-restore'] = 1;
		}

		return config;
	    },

	    column1: [
		{
		    xtype: 'pveGuestIDSelector',
		    name: 'vmid',
		    fieldLabel: 'VM',
		    guestType: 'qemu',
		    loadNextFreeID: true,
		},
		{
		    xtype: 'proxmoxintegerfield',
		    fieldLabel: gettext('Sockets'),
		    name: 'sockets',
		    reference: 'socketsField',
		    value: 1,
		    minValue: 1,
		    maxValue: 4,
		    allowBlank: true,
		    bind: {
			value: '{socketCount}',
		    },
		},
		{
		    xtype: 'proxmoxintegerfield',
		    fieldLabel: gettext('Cores'),
		    name: 'cores',
		    reference: 'coresField',
		    value: 1,
		    minValue: 1,
		    maxValue: 128,
		    allowBlank: true,
		    bind: {
			value: '{coreCount}',
		    },
		},
		{
		    xtype: 'pveMemoryField',
		    fieldLabel: gettext('Memory'),
		    name: 'memory',
		    reference: 'memoryField',
		    value: 512,
		    allowBlank: true,
		},
	    ],

	    column2: [
		{
		    xtype: 'textfield',
		    fieldLabel: gettext('Name'),
		    name: 'name',
		    vtype: 'DnsName',
		    reference: 'nameField',
		    allowBlank: true,
		},
		{
		    xtype: 'CPUModelSelector',
		    name: 'cpu',
		    reference: 'cputype',
		    value: 'x86-64-v2-AES',
		    fieldLabel: gettext('Type'),
		},
		{
		    xtype: 'displayfield',
		    fieldLabel: gettext('Total cores'),
		    name: 'totalcores',
		    isFormField: false,
		    bind: {
			value: '{totalCoreCount}',
		    },
		},
	    ],
	    columnB: [
		{
		    xtype: 'displayfield',
		    fieldLabel: gettext('Disks'),
		    labelWidth: 200,
		},
		{
		    xtype: 'grid',
		    reference: 'diskGrid',
		    maxHeight: 150,
		    store: { data: [] },
		    columns: [
			{
			    xtype: 'checkcolumn',
			    header: gettext('Use'),
			    width: 50,
			    dataIndex: 'enable',
			    listeners: {
				checkchange: function(_column, _rowIndex, _checked, record) {
				    record.commit();
				},
			    },
			},
			{
			    text: gettext('Disk'),
			    dataIndex: 'id',
			},
			{
			    text: gettext('Source'),
			    dataIndex: 'import-from',
			    flex: 1,
			    renderer: function(value) {
				return value.replace(/^.*\//, '');
			    },
			},
			{
			    text: gettext('Storage'),
			    dataIndex: 'file',
			    xtype: 'widgetcolumn',
			    width: 150,
			    widget: {
				xtype: 'pveStorageSelector',
				isFormField: false,
				name: 'file',
				storageContent: 'images',
			    },
			    onWidgetAttach: 'setNodename',
			},
			{
			    text: gettext('Format'),
			    dataIndex: 'format',
			    xtype: 'widgetcolumn',
			    width: 150,
			    widget: {
				xtype: 'pveDiskFormatSelector',
				name: 'format',
				isFormField: false,
				matchFieldWidth: false,
			    },
			},
		    ],
		},
		{
		    xtype: 'displayfield',
		    fieldLabel: gettext('Network Interfaces'),
		    labelWidth: 200,
		},
		{
		    xtype: 'grid',
		    maxHeight: 150,
		    reference: 'netGrid',
		    store: { data: [] },
		    columns: [
			{
			    xtype: 'checkcolumn',
			    header: gettext('Use'),
			    width: 50,
			    dataIndex: 'enable',
			    listeners: {
				checkchange: function(_column, _rowIndex, _checked, record) {
				    record.commit();
				},
			    },
			},
			{
			    text: gettext('ID'),
			    dataIndex: 'id',
			},
			{
			    text: gettext('MAC address'),
			    flex: 1,
			    dataIndex: 'macaddr',
			},
			{
			    text: gettext('Model'),
			    flex: 1,
			    dataIndex: 'model',
			},
			{
			    text: gettext('Bridge'),
			    dataIndex: 'bridge',
			    xtype: 'widgetcolumn',
			    widget: {
				xtype: 'PVE.form.BridgeSelector',
				name: 'bridge',
				isFormField: false,
				allowBlank: false,
			    },
			    onWidgetAttach: 'setNodename',
			},
		    ],
		},
		{
		    xtype: 'displayfield',
		    fieldLabel: gettext('Warnings'),
		    labelWidth: 200,
		    hidden: true,
		    bind: {
			hidden: '{hideWarnings}',
		    },
		},
		{
		    xtype: 'displayfield',
		    reference: 'warningText',
		    userCls: 'pmx-hint',
		    hidden: true,
		    bind: {
			hidden: '{hideWarnings}',
			value: '{warningsText}',
		    },
		},
	    ],
	},
    ],

    initComponent: function() {
	let me = this;

	if (!me.volumeName) {
	    throw "no volumeName given";
	}

	if (!me.storage) {
	    throw "no storage given";
	}

	if (!me.nodename) {
	    throw "no nodename given";
	}

	me.callParent();

	me.query('toolbar')?.[0]?.insert(0, {
	    xtype: 'proxmoxcheckbox',
	    reference: 'liveimport',
	    boxLabelAlign: 'before',
	    boxLabel: gettext('Live Import'),
	});

	me.setTitle(Ext.String.format(gettext('Import Guest - {0}'), `${me.storage}:${me.volumeName}`));

	me.load({
	    success: function(response) {
		let data = response.result.data;
		me.vmConfig = data['create-args'];

		let disks = [];
		for (const [id, value] of Object.entries(data.disks ?? {})) {
		    disks.push({
			id,
			enable: true,
			'import-from': id === 'efidisk0' ? Ext.htmlEncode('<none>') : value,
			format: 'raw',
		    });
		}

		let nets = [];
		for (const [id, parsed] of Object.entries(data.net ?? {})) {
		    parsed.id = id;
		    parsed.enable = true;
		    nets.push(parsed);
		}
		me.lookup('diskGrid').getStore().setData(disks);
		me.lookup('netGrid').getStore().setData(nets);

		me.getViewModel().set('warnings', data.warnings.map(warning => warning.message));
		me.getController().setIsos(data['ignored-volumes']);

		me.setValues(me.vmConfig);
	    },
	});
    },
});