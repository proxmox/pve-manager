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

	diskStorageChange: function(storageSelector, value) {
	    let me = this;

	    let grid = me.lookup('diskGrid');
	    let rec = storageSelector.getWidgetRecord();
	    let validFormats = storageSelector.store.getById(value)?.data.format;
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

	isoStorageChange: function(storageSelector, value) {
	    let me = this;

	    let grid = me.lookup('cdGrid');
	    let rec = storageSelector.getWidgetRecord();
	    grid.query('pveFileSelector').some((selector) => {
		if (selector.getWidgetRecord().data.id !== rec.data.id) {
		    return false;
		}

		selector.setStorage(value);
		if (!value) {
		    selector.setValue('');
		}

		return true;
	    });
	},

	onOSBaseChange: function(_field, value) {
	    let me = this;
	    let ostype = me.lookup('ostype');
	    let store = ostype.getStore();
	    store.setData(PVE.Utils.kvm_ostypes[value]);
	    let old_val = ostype.getValue();
	    if (old_val && store.find('val', old_val) !== -1) {
		ostype.setValue(old_val);
	    } else {
		ostype.setValue(store.getAt(0));
	    }
	},

	calculateConfig: function() {
	    let me = this;
	    let inputPanel = me.lookup('mainInputPanel');
	    let summaryGrid = me.lookup('summaryGrid');
	    let values = inputPanel.getValues();
	    summaryGrid.getStore().setData(Object.entries(values).map(([key, value]) => ({ key, value })));
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
	    'grid[reference=diskGrid] pveStorageSelector': {
		change: 'diskStorageChange',
	    },
	    'grid[reference=cdGrid] pveStorageSelector': {
		change: 'isoStorageChange',
	    },
	    'field[name=osbase]': {
		change: 'onOSBaseChange',
	    },
	    'panel[reference=summaryTab]': {
		activate: 'calculateConfig',
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
	    warningsText: get => '<ul style="margin: 0; padding-left: 20px;">'
	        + get('warnings').map(w => `<li>${w}</li>`).join('') + '</ul>',
	},
    },

    width: 700,
    bodyPadding: 0,

    items: [
	{
	    xtype: 'tabpanel',
	    defaults: {
		bodyPadding: 10,
	    },
	    items: [
		{
		    title: gettext('General'),
		    xtype: 'inputpanel',
		    reference: 'mainInputPanel',
		    onGetValues: function(values) {
			let me = this;
			let grid = me.up('pveGuestImportWindow');

			// from pveDiskStorageSelector
			let defaultStorage = values.hdstorage;
			let defaultFormat = values.diskformat;
			delete values.hdstorage;
			delete values.diskformat;

			let defaultBridge = values.defaultBridge;
			delete values.defaultBridge;

			let config = Ext.apply(grid.vmConfig, values);

			if (config.scsi0) {
			    config.scsi0 = config.scsi0.replace('local:0,', 'local:0,format=qcow2,');
			}

			grid.lookup('diskGrid').getStore().each((rec) => {
			    if (!rec.data.enable) {
				return;
			    }
			    let id = rec.data.id;
			    let data = {
				...rec.data,
			    };
			    delete data.enable;
			    delete data.id;
			    if (!data.file) {
				data.file = defaultStorage;
				data.format = defaultFormat;
			    }
			    data.file += ':0'; // for our special api format
			    if (id === 'efidisk0') {
				delete data['import-from'];
			    }
			    config[id] = PVE.Parser.printQemuDrive(data);
			});

			grid.lookup('netGrid').getStore().each((rec) => {
			    if (!rec.data.enable) {
				return;
			    }
			    let id = rec.data.id;
			    let data = {
				...rec.data,
			    };
			    delete data.enable;
			    delete data.id;
			    if (!data.bridge) {
				data.bridge = defaultBridge;
			    }
			    config[id] = PVE.Parser.printQemuNetwork(data);
			});

			grid.lookup('cdGrid').getStore().each((rec) => {
			    if (!rec.data.enable) {
				return;
			    }
			    let id = rec.data.id;
			    let cd = {
				media: 'cdrom',
				file: rec.data.file ? rec.data.file : 'none',
			    };
			    config[id] = PVE.Parser.printPropertyString(cd);
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
			{
			    //spacer
			    xtype: 'displayfield',
			},
			{
			    xtype: 'pveDiskStorageSelector',
			    reference: 'defaultStorage',
			    storageLabel: gettext('Default Storage'),
			    storageContent: 'images',
			    autoSelect: true,
			    hideSize: true,
			    name: 'defaultStorage',
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
			{
			    xtype: 'combobox',
			    submitValue: false,
			    name: 'osbase',
			    fieldLabel: gettext('OS Type'),
			    editable: false,
			    queryMode: 'local',
			    value: 'Linux',
			    store: Object.keys(PVE.Utils.kvm_ostypes),
			},
			{
			    xtype: 'combobox',
			    name: 'ostype',
			    reference: 'ostype',
			    fieldLabel: gettext('Version'),
			    value: 'l26',
			    allowBlank: false,
			    editable: false,
			    queryMode: 'local',
			    valueField: 'val',
			    displayField: 'desc',
			    store: {
				fields: ['desc', 'val'],
				data: PVE.Utils.kvm_ostypes.Linux,
			    },
			},
			{
			    xtype: 'PVE.form.BridgeSelector',
			    reference: 'defaultBridge',
			    name: 'defaultBridge',
			    allowBlank: false,
			    fieldLabel: gettext('Default Bridge'),
			},
		    ],

		    columnB: [
			{
			    xtype: 'proxmoxcheckbox',
			    fieldLabel: gettext('Live Import'),
			    reference: 'liveimport',
			    isFormField: false,
			    boxLabel: gettext('Experimental'),
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
		{
		    title: gettext('Advanced'),
		    xtype: 'inputpanel',
		    items: [
			{
			    xtype: 'displayfield',
			    fieldLabel: gettext('Disks'),
			    labelWidth: 200,
			},
			{
			    xtype: 'grid',
			    reference: 'diskGrid',
			    minHeight: 58,
			    maxHeight: 150,
			    store: {
				data: [],
				sorters: [
				    'id',
				],
			    },
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
					autoSelect: false,
					allowBlank: true,
					emptyText: gettext('From Default'),
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
					disabled: true,
					isFormField: false,
					matchFieldWidth: false,
				    },
				},
			    ],
			},
			{
			    xtype: 'displayfield',
			    fieldLabel: gettext('CD/DVD Drives'),
			    labelWidth: 200,
			},
			{
			    xtype: 'grid',
			    reference: 'cdGrid',
			    minHeight: 58,
			    maxHeight: 150,
			    store: {
				data: [],
				sorters: [
				    'id',
				],
			    },
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
				    text: gettext('Slot'),
				    dataIndex: 'id',
				    sorted: true,
				},
				{
				    text: gettext('Storage'),
				    xtype: 'widgetcolumn',
				    width: 150,
				    widget: {
					xtype: 'pveStorageSelector',
					isFormField: false,
					autoSelect: false,
					allowBlank: true,
					emptyText: Proxmox.Utils.noneText,
					storageContent: 'iso',
				    },
				    onWidgetAttach: 'setNodename',
				},
				{
				    text: gettext('ISO'),
				    dataIndex: 'file',
				    xtype: 'widgetcolumn',
				    flex: 1,
				    widget: {
					xtype: 'pveFileSelector',
					name: 'file',
					isFormField: false,
					allowBlank: true,
					emptyText: Proxmox.Utils.noneText,
					storageContent: 'iso',
				    },
				    onWidgetAttach: 'setNodename',
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
			    minHeight: 58,
			    maxHeight: 150,
			    reference: 'netGrid',
			    store: {
				data: [],
				sorters: [
				    'id',
				],
			    },
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
				    renderer: value => value ?? 'auto',
				},
				{
				    text: gettext('Model'),
				    flex: 1,
				    dataIndex: 'model',
				    xtype: 'widgetcolumn',
				    widget: {
					xtype: 'pveNetworkCardSelector',
					name: 'model',
					isFormField: false,
					allowBlank: false,
				    },
				},
				{
				    text: gettext('Bridge'),
				    dataIndex: 'bridge',
				    xtype: 'widgetcolumn',
				    flex: 1,
				    widget: {
					xtype: 'PVE.form.BridgeSelector',
					name: 'bridge',
					isFormField: false,
					autoSelect: false,
					allowBlank: true,
					emptyText: gettext('From Default'),
				    },
				    onWidgetAttach: 'setNodename',
				},
			    ],
			},
		    ],
		},
		{
		    title: gettext('Resulting Config'),
		    reference: 'summaryTab',
		    items: [
			{
			    xtype: 'grid',
			    reference: 'summaryGrid',
			    maxHeight: 400,
			    scrollable: true,
			    store: {
				model: 'KeyValue',
				sorters: [{
				    property: 'key',
				    direction: 'ASC',
				}],
			    },
			    columns: [
				{ header: 'Key', width: 150, dataIndex: 'key' },
				{ header: 'Value', flex: 1, dataIndex: 'value' },
			    ],
			},
		    ],
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

	me.setTitle(Ext.String.format(gettext('Import Guest - {0}'), `${me.storage}:${me.volumeName}`));

	me.lookup('defaultStorage').setNodename(me.nodename);
	me.lookup('defaultBridge').setNodename(me.nodename);

	let renderWarning = w => {
	    const warningsCatalogue = {
		'cdrom-image-ignored': gettext("CD-ROM images cannot get imported, please reconfigure the '{0}' drive after the import"),
		'nvme-unsupported': gettext("NVMe disks are currently not supported, '{0}' will get attaced as SCSI"),
		'ovmf-with-lsi-unsupported': gettext("OVMF is built without LSI drivers, scsi hardware was set to '{1}'"),
		'serial-port-socket-only': gettext("Serial socket '{0}' will be mapped to a socket"),
	    };
            let message = warningsCatalogue[w.type];
	    if (!w.type || !message) {
		return w.message ?? w.type ?? gettext('Unknown warning');
	    }
	    return Ext.String.format(message, w.key ?? 'unknown', w.value ?? 'unknown');
	};

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

		let cdroms = [];
		for (const [id, value] of Object.entries(me.vmConfig)) {
		    if (!Ext.isString(value) || !value.match(/media=cdrom/)) {
			continue;
		    }
		    cdroms.push({
			enable: true,
			id,
		    });
		    delete me.vmConfig[id];
		}
		me.lookup('diskGrid').getStore().setData(disks);
		me.lookup('netGrid').getStore().setData(nets);
		me.lookup('cdGrid').getStore().setData(cdroms);

		me.getViewModel().set('warnings', data.warnings.map(w => renderWarning(w)));

		let osinfo = PVE.Utils.get_kvm_osinfo(me.vmConfig.ostype ?? '');

		me.setValues({
		    osbase: osinfo.base,
		    ...me.vmConfig,
		});
	    },
	});
    },
});
