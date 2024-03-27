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

	calculateAdditionalCDIdx: function() {
	    let me = this;

	    let maxIde = me.getMaxControllerId('ide');
	    let maxSata = me.getMaxControllerId('sata');
	    // only ide0 and ide2 can be used reliably for isos (e.g. for q35)
	    if (maxIde < 0) {
		return 'ide0';
	    }
	    if (maxIde < 2) {
		return 'ide2';
	    }
	    if (maxSata < PVE.Utils.diskControllerMaxIDs.sata - 1) {
		return `sata${maxSata+1}`;
	    }

	    return '';
	},

	// assume assigned sata disks indices are continuous, so without holes
	getMaxControllerId: function(controller) {
	    let me = this;
	    let view = me.getView();
	    if (!controller) {
		return -1;
	    }

	    let max = view[`max${controller}`];
	    if (max !== undefined) {
		return max;
	    }

	    max = -1;
	    for (const key of Object.keys(me.getView().vmConfig)) {
		if (!key.toLowerCase().startsWith(controller)) {
		    continue;
		}
		let idx = parseInt(key.slice(controller.length), 10);
		if (idx > max) {
		    max = idx;
		}
	    }
	    me.lookup('diskGrid').getStore().each(rec => {
		if (!rec.data.id.toLowerCase().startsWith(controller)) {
		    return;
		}
		let idx = parseInt(rec.data.id.slice(controller.length), 10);
		if (idx > max) {
		    max = idx;
		}
	    });
	    me.lookup('cdGrid').getStore().each(rec => {
		if (!rec.data.id.toLowerCase().startsWith(controller) || rec.data.hidden) {
		    return;
		}
		let idx = parseInt(rec.data.id.slice(controller.length), 10);
		if (idx > max) {
		    max = idx;
		}
	    });

	    view[`max${controller}`] = max;
	    return max;
	},

	mapDisk: function(value, metaData) {
	    let me = this;
	    let prepareForVirtIO = me.lookup('prepareForVirtIO');
	    if (prepareForVirtIO.isDisabled() || !prepareForVirtIO.getValue()) {
		return value;
	    }
	    if (!value.toLowerCase().startsWith('scsi')) {
		return value;
	    }
	    let offset = parseInt(value.slice(4), 10);
	    let newIdx = offset + me.getMaxControllerId('sata') + 1;
	    if (me.getViewModel().get('isWindows') && me.getView().additionalCdIdx?.startsWith('sata')) {
		// additionalCdIdx takes the highest sata port
		newIdx++;
	    }
	    if (newIdx >= PVE.Utils.diskControllerMaxIDs.sata) {
		let prefix = '';
		if (metaData !== undefined) {
		    // we're in the renderer so put a warning here
		    let warning = gettext('Too many disks, could not map to SATA.');
		    prefix = `<i data-qtip="${warning}" class="fa fa-exclamation-triangle warning"></i> `;
		}
		return `${prefix}${value}`;
	    }
	    return `sata${newIdx}`;
	},

	refreshGrids: function() {
	    this.lookup('diskGrid').reconfigure();
	    this.lookup('cdGrid').reconfigure();
	    this.lookup('netGrid').reconfigure();
	},

	onOSTypeChange: function(_cb, value) {
	    let me = this;
	    if (!value) {
		return;
	    }
	    let store = me.lookup('cdGrid').getStore();
	    let collection = store.getData().getSource() ?? store.getData();
	    let rec = collection.find('autogenerated', true);

	    let isWindows = (value ?? '').startsWith('w');
	    if (rec) {
		rec.set('hidden', !isWindows);
		rec.commit();
	    }
	    let prepareVirtio = me.lookup('prepareForVirtIO').getValue();
	    let defaultScsiHw = me.getView().vmConfig.scsihw ?? '__default__';
	    me.lookup('scsihw').setValue(prepareVirtio && isWindows ? 'virtio-scsi-single' : defaultScsiHw);

	    me.refreshGrids();
	},

	onPrepareVirtioChange: function(_cb, value) {
	    let me = this;

	    let scsihw = me.lookup('scsihw');
	    scsihw.suspendEvents();
	    scsihw.setValue(value ? 'virtio-scsi-single' : me.getView().vmConfig.scsihw);
	    scsihw.resumeEvents();

	    me.refreshGrids();
	},

	onScsiHwChange: function(_field, value) {
	    let me = this;
	    me.getView().vmConfig.scsihw = value;
	},

	onUniqueMACChange: function(_cb, value) {
	    let me = this;

	    me.getViewModel().set('uniqueMACAdresses', value);

	    me.lookup('netGrid').reconfigure();
	},

	renderMacAddress: function(value, metaData, record, rowIndex, colIndex, store, view) {
	    let me = this;
	    let vm = me.getViewModel();

	    return !vm.get('uniqueMACAdresses') && value ? value : 'auto';
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
	    'proxmoxcheckbox[reference=prepareForVirtIO]': {
		change: 'onPrepareVirtioChange',
	    },
	    'combobox[name=ostype]': {
		change: 'onOSTypeChange',
	    },
	    'pveScsiHwSelector': {
		change: 'onScsiHwChange',
	    },
	    'proxmoxcheckbox[name=uniqueMACs]': {
		change: 'onUniqueMACChange',
	    },
	},
    },

    viewModel: {
	data: {
	    coreCount: 1,
	    socketCount: 1,
	    liveImport: false,
	    os: 'l26',
	    maxCdDrives: false,
	    uniqueMACAdresses: false,
	    warnings: [],
	},

	formulas: {
	    totalCoreCount: get => get('socketCount') * get('coreCount'),
	    hideWarnings: get => get('warnings').length === 0,
	    warningsText: get => '<ul style="margin: 0; padding-left: 20px;">'
	        + get('warnings').map(w => `<li>${w}</li>`).join('') + '</ul>',
	    liveImportNote: get => !get('liveImport') ? ''
	        : gettext('Note: If anything goes wrong during the live-import, new data written by the VM may be lost.'),
	    isWindows: get => (get('os') ?? '').startsWith('w'),
	},
    },

    width: 700,
    bodyPadding: 0,

    items: [{
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
		    let vm = grid.getViewModel();

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

		    let parsedBoot = PVE.Parser.parsePropertyString(config.boot ?? '');
		    if (parsedBoot.order) {
			parsedBoot.order = parsedBoot.order.split(';');
		    }

		    grid.lookup('diskGrid').getStore().each((rec) => {
			if (!rec.data.enable) {
			    return;
			}
			let id = grid.getController().mapDisk(rec.data.id);
			if (id !== rec.data.id && parsedBoot?.order) {
			    let idx = parsedBoot.order.indexOf(rec.data.id);
			    if (idx !== -1) {
				parsedBoot.order[idx] = id;
			    }
			}
			let data = {
			    ...rec.data,
			};
			delete data.enable;
			delete data.id;
			delete data.size;
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

		    if (parsedBoot.order) {
			parsedBoot.order = parsedBoot.order.join(';');
		    }
		    config.boot = PVE.Parser.printPropertyString(parsedBoot);

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
			if (vm.get('uniqueMACAdresses')) {
			    data.macaddr = undefined;
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

		    config.scsihw = grid.lookup('scsihw').getValue();

		    if (grid.lookup('liveimport').getValue()) {
			config['live-restore'] = 1;
		    }

		    // remove __default__ values
		    for (const [key, value] of Object.entries(config)) {
			if (value === '__default__') {
			    delete config[key];
			}
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
			maxValue: 128,
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
			maxValue: 1024,
			allowBlank: true,
			bind: {
			    value: '{coreCount}',
			},
		    },
		    {
			xtype: 'pveMemoryField',
			fieldLabel: gettext('Memory') + ' (MiB)',
			name: 'memory',
			reference: 'memoryField',
			value: 512,
			allowBlank: true,
		    },
		    { xtype: 'displayfield' }, // spacer
		    { xtype: 'displayfield' }, // spacer
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
			fieldLabel: gettext('CPU Type'),
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
			bind: {
			    value: '{os}',
			},
			store: {
			    fields: ['desc', 'val'],
			    data: PVE.Utils.kvm_ostypes.Linux,
			},
		    },
		    { xtype: 'displayfield' }, // spacer
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
			boxLabelCls: 'pmx-hint black x-form-cb-label',
			bind: {
			    value: '{liveImport}',
			    boxLabel: '{liveImportNote}',
			},
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

		// the first inputpanel handles all values, so prevent value leakage here
		onGetValues: () => ({}),

		columnT: [
		    {
			xtype: 'displayfield',
			fieldLabel: gettext('Disks'),
			labelWidth: 200,
		    },
		    {
			xtype: 'grid',
			reference: 'diskGrid',
			minHeight: 60,
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
				renderer: 'mapDisk',
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
				text: gettext('Size'),
				dataIndex: 'size',
				renderer: (value) => {
				    if (Ext.isNumeric(value)) {
					return Proxmox.Utils.render_size(value);
				    }
				    return value ?? Proxmox.Utils.unknownText;
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
		],

		column1: [
		    {
			xtype: 'proxmoxcheckbox',
			boxLabel: gettext('Prepare for VirtIO-SCSI'),
			reference: 'prepareForVirtIO',
			name: 'prepareForVirtIO',
			submitValue: false,
			disabled: true,
			bind: {
			    disabled: '{!isWindows}',
			},
			autoEl: {
			    tag: 'div',
			    'data-qtip': gettext('Maps SCSI disks to SATA and changes the SCSI Controller. Useful for a quicker switch to VirtIO-SCSI attached disks'),
			},
		    },
		],

		column2: [
		    {
			xtype: 'pveScsiHwSelector',
			reference: 'scsihw',
			name: 'scsihw',
			value: '__default__',
			submitValue: false,
			fieldLabel: gettext('SCSI Controller'),
		    },
		],

		columnB: [
		    {
			xtype: 'displayfield',
			fieldLabel: gettext('CD/DVD Drives'),
			labelWidth: 200,
		    },
		    {
			xtype: 'grid',
			reference: 'cdGrid',
			minHeight: 60,
			maxHeight: 150,
			store: {
			    data: [],
			    sorters: [
				'id',
			    ],
			    filters: [
				function(rec) {
				    return !rec.data.hidden;
				},
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
			style: {
			    paddingTop: '10px',
			},
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
				renderer: 'renderMacAddress',
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
		    {
			xtype: 'proxmoxcheckbox',
			name: 'uniqueMACs',
			boxLabel: gettext('Unique MAC addresses'),
			uncheckedValue: false,
			value: false,
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
    }],

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
		'cdrom-image-ignored': gettext("CD-ROM images cannot get imported, if required you can reconfigure the '{0}' drive in the 'Advanced' tab."),
		'nvme-unsupported': gettext("NVMe disks are currently not supported, '{0}' will get attaced as SCSI"),
		'ovmf-with-lsi-unsupported': gettext("OVMF is built without LSI drivers, scsi hardware was set to '{1}'"),
		'serial-port-socket-only': gettext("Serial socket '{0}' will be mapped to a socket"),
		'guest-is-running': gettext('Virtual guest seems to be running on source host. Import might fail or have inconsistent state!'),
		'efi-state-lost': Ext.String.format(
		    gettext('EFI state cannot be imported, you may need to reconfigure the boot order (see {0})'),
		    '<a href="https://pve.proxmox.com/wiki/OVMF/UEFI_Boot_Entries">OVMF/UEFI Boot Entries</a>',
		),
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
		    let volid = Ext.htmlEncode('<none>');
		    let size = 'auto';
		    if (Ext.isObject(value)) {
			volid = value.volid;
			size = value.size;
		    }
		    disks.push({
			id,
			enable: true,
			size,
			'import-from': volid,
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
			hidden: false,
			id,
		    });
		    delete me.vmConfig[id];
		}

		me.lookup('diskGrid').getStore().setData(disks);
		me.lookup('netGrid').getStore().setData(nets);
		me.lookup('cdGrid').getStore().setData(cdroms);

		let additionalCdIdx = me.getController().calculateAdditionalCDIdx();
		if (additionalCdIdx === '') {
		    me.getViewModel().set('maxCdDrives', true);
		} else if (cdroms.length === 0) {
		    me.additionalCdIdx = additionalCdIdx;
		    me.lookup('cdGrid').getStore().add({
			enable: true,
			hidden: !(me.vmConfig.ostype ?? '').startsWith('w'),
			id: additionalCdIdx,
			autogenerated: true,
		    });
		}

		me.getViewModel().set('warnings', data.warnings.map(w => renderWarning(w)));

		let osinfo = PVE.Utils.get_kvm_osinfo(me.vmConfig.ostype ?? '');
		let prepareForVirtIO = (me.vmConfig.ostype ?? '').startsWith('w') && (me.vmConfig.bios ?? '').indexOf('ovmf') !== -1;

		me.setValues({
		    osbase: osinfo.base,
		    ...me.vmConfig,
		});


		me.lookup('prepareForVirtIO').setValue(prepareForVirtIO);
	    },
	});
    },
});
