/* 'change' property is assigned a string and then a function */
Ext.define('PVE.qemu.HDInputPanel', {
    extend: 'Proxmox.panel.InputPanel',
    alias: 'widget.pveQemuHDInputPanel',
    onlineHelp: 'qm_hard_disk',

    insideWizard: false,

    unused: false, // ADD usused disk imaged

    vmconfig: {}, // used to select usused disks

    viewModel: {},

    controller: {

	xclass: 'Ext.app.ViewController',

	onControllerChange: function(field) {
	    var value = field.getValue();

	    var allowIOthread = value.match(/^(virtio|scsi)/);
	    this.lookup('iothread').setDisabled(!allowIOthread);
	    if (!allowIOthread) {
		this.lookup('iothread').setValue(false);
	    }

	    var virtio = value.match(/^virtio/);
	    this.lookup('ssd').setDisabled(virtio);
	    if (virtio) {
		this.lookup('ssd').setValue(false);
	    }

	    this.lookup('scsiController').setVisible(value.match(/^scsi/));
	},

	control: {
	    'field[name=controller]': {
		change: 'onControllerChange',
		afterrender: 'onControllerChange',
	    },
	    'field[name=iothread]' : {
		change: function(f, value) {
		    if (!this.getView().insideWizard) {
			return;
		    }
		    var vmScsiType = value ? 'virtio-scsi-single': 'virtio-scsi-pci';
		    this.lookupReference('scsiController').setValue(vmScsiType);
		},
	    },
	},

	init: function(view) {
	    var vm = this.getViewModel();
	    if (view.isCreate) {
		vm.set('isIncludedInBackup', true);
	    }
	},
    },

    onGetValues: function(values) {
	var me = this;

	var params = {};
	var confid = me.confid || (values.controller + values.deviceid);

	if (me.unused) {
	    me.drive.file = me.vmconfig[values.unusedId];
	    confid = values.controller + values.deviceid;
	} else if (me.isCreate) {
	    if (values.hdimage) {
		me.drive.file = values.hdimage;
	    } else {
		me.drive.file = values.hdstorage + ":" + values.disksize;
	    }
	    me.drive.format = values.diskformat;
	}

	PVE.Utils.propertyStringSet(me.drive, !values.backup, 'backup', '0');
	PVE.Utils.propertyStringSet(me.drive, values.noreplicate, 'replicate', 'no');
	PVE.Utils.propertyStringSet(me.drive, values.discard, 'discard', 'on');
	PVE.Utils.propertyStringSet(me.drive, values.ssd, 'ssd', 'on');
	PVE.Utils.propertyStringSet(me.drive, values.iothread, 'iothread', 'on');
	PVE.Utils.propertyStringSet(me.drive, values.cache, 'cache');

        var names = ['mbps_rd', 'mbps_wr', 'iops_rd', 'iops_wr'];
        Ext.Array.each(names, function(name) {
            var burst_name = name + '_max';
	    PVE.Utils.propertyStringSet(me.drive, values[name], name);
	    PVE.Utils.propertyStringSet(me.drive, values[burst_name], burst_name);
        });


	params[confid] = PVE.Parser.printQemuDrive(me.drive);

	return params;
    },

    setVMConfig: function(vmconfig) {
	var me = this;

	me.vmconfig = vmconfig;

	if (me.bussel) {
	    me.bussel.setVMConfig(vmconfig);
	    me.scsiController.setValue(vmconfig.scsihw);
	}
	if (me.unusedDisks) {
	    var disklist = [];
	    Ext.Object.each(vmconfig, function(key, value) {
		if (key.match(/^unused\d+$/)) {
		    disklist.push([key, value]);
		}
	    });
	    me.unusedDisks.store.loadData(disklist);
	    me.unusedDisks.setValue(me.confid);
	}
    },

    setDrive: function(drive) {
	var me = this;

	me.drive = drive;

	var values = {};
	var match = drive.file.match(/^([^:]+):/);
	if (match) {
	    values.hdstorage = match[1];
	}

	values.hdimage = drive.file;
	values.backup = PVE.Parser.parseBoolean(drive.backup, 1);
	values.noreplicate = !PVE.Parser.parseBoolean(drive.replicate, 1);
	values.diskformat = drive.format || 'raw';
	values.cache = drive.cache || '__default__';
	values.discard = (drive.discard === 'on');
	values.ssd = PVE.Parser.parseBoolean(drive.ssd);
	values.iothread = PVE.Parser.parseBoolean(drive.iothread);

	values.mbps_rd = drive.mbps_rd;
	values.mbps_wr = drive.mbps_wr;
	values.iops_rd = drive.iops_rd;
	values.iops_wr = drive.iops_wr;
	values.mbps_rd_max = drive.mbps_rd_max;
	values.mbps_wr_max = drive.mbps_wr_max;
	values.iops_rd_max = drive.iops_rd_max;
	values.iops_wr_max = drive.iops_wr_max;

	me.setValues(values);
    },

    setNodename: function(nodename) {
	var me = this;
	me.down('#hdstorage').setNodename(nodename);
	me.down('#hdimage').setStorage(undefined, nodename);
    },

    initComponent : function() {
	var me = this;

	var labelWidth = 140;

	me.drive = {};

	me.column1 = [];
	me.column2 = [];

	me.advancedColumn1 = [];
	me.advancedColumn2 = [];

	if (!me.confid || me.unused) {
	    me.bussel = Ext.create('PVE.form.ControllerSelector', {
		vmconfig: me.insideWizard ? {ide2: 'cdrom'} : {},
	    });
	    me.column1.push(me.bussel);

	    me.scsiController = Ext.create('Ext.form.field.Display', {
		fieldLabel: gettext('SCSI Controller'),
		reference: 'scsiController',
		bind: me.insideWizard ? {
		    value: '{current.scsihw}',
		} : undefined,
		renderer: PVE.Utils.render_scsihw,
		submitValue: false,
		hidden: true,
	    });
	    me.column1.push(me.scsiController);
	}

	if (me.unused) {
	    me.unusedDisks = Ext.create('Proxmox.form.KVComboBox', {
		name: 'unusedId',
		fieldLabel: gettext('Disk image'),
		matchFieldWidth: false,
		listConfig: {
		    width: 350,
		},
		data: [],
		allowBlank: false,
	    });
	    me.column1.push(me.unusedDisks);
	} else if (me.isCreate) {
	    me.column1.push({
		xtype: 'pveDiskStorageSelector',
		storageContent: 'images',
		name: 'disk',
		nodename: me.nodename,
		autoSelect: me.insideWizard,
	    });
	} else {
	    me.column1.push({
		xtype: 'textfield',
		disabled: true,
		submitValue: false,
		fieldLabel: gettext('Disk image'),
                name: 'hdimage',
	    });
	}

	me.column2.push(
	    {
		xtype: 'CacheTypeSelector',
		name: 'cache',
		value: '__default__',
		fieldLabel: gettext('Cache'),
	    },
	    {
		xtype: 'proxmoxcheckbox',
		fieldLabel: gettext('Discard'),
		reference: 'discard',
		name: 'discard',
	    },
	);

	me.advancedColumn1.push(
	    {
		xtype: 'proxmoxcheckbox',
		disabled: me.confid && me.confid.match(/^virtio/),
		fieldLabel: gettext('SSD emulation'),
		labelWidth: labelWidth,
		name: 'ssd',
		reference: 'ssd',
	    },
	    {
		xtype: 'proxmoxcheckbox',
		disabled: me.confid && !me.confid.match(/^(virtio|scsi)/),
		fieldLabel: 'IO thread',
		labelWidth: labelWidth,
		reference: 'iothread',
		name: 'iothread',
	    },
	    {
		xtype: 'numberfield',
		name: 'mbps_rd',
		minValue: 1,
		step: 1,
		fieldLabel: gettext('Read limit') + ' (MB/s)',
		labelWidth: labelWidth,
		emptyText: gettext('unlimited'),
	    },
	    {
		xtype: 'numberfield',
		name: 'mbps_wr',
		minValue: 1,
		step: 1,
		fieldLabel: gettext('Write limit') + ' (MB/s)',
		labelWidth: labelWidth,
		emptyText: gettext('unlimited'),
	    },
	    {
		xtype: 'proxmoxintegerfield',
		name: 'iops_rd',
		minValue: 10,
		step: 10,
		fieldLabel: gettext('Read limit') + ' (ops/s)',
		labelWidth: labelWidth,
		emptyText: gettext('unlimited'),
	    },
	    {
		xtype: 'proxmoxintegerfield',
		name: 'iops_wr',
		minValue: 10,
		step: 10,
		fieldLabel: gettext('Write limit') + ' (ops/s)',
		labelWidth: labelWidth,
		emptyText: gettext('unlimited'),
	    },
	);

	me.advancedColumn2.push(
	    {
		xtype: 'proxmoxcheckbox',
		fieldLabel: gettext('Backup'),
		autoEl: {
		    tag: 'div',
		    'data-qtip': gettext('Include volume in backup job'),
		},
		labelWidth: labelWidth,
		name: 'backup',
		bind: {
		    value: '{isIncludedInBackup}',
		},
	    },
	    {
		xtype: 'proxmoxcheckbox',
		fieldLabel: gettext('Skip replication'),
		labelWidth: labelWidth,
		name: 'noreplicate',
	    },
	    {
		xtype: 'numberfield',
		name: 'mbps_rd_max',
		minValue: 1,
		step: 1,
		fieldLabel: gettext('Read max burst') + ' (MB)',
		labelWidth: labelWidth,
		emptyText: gettext('default'),
	    },
	    {
		xtype: 'numberfield',
		name: 'mbps_wr_max',
		minValue: 1,
		step: 1,
		fieldLabel: gettext('Write max burst') + ' (MB)',
		labelWidth: labelWidth,
		emptyText: gettext('default'),
	    },
	    {
		xtype: 'proxmoxintegerfield',
		name: 'iops_rd_max',
		minValue: 10,
		step: 10,
		fieldLabel: gettext('Read max burst') + ' (ops)',
		labelWidth: labelWidth,
		emptyText: gettext('default'),
	    },
	    {
		xtype: 'proxmoxintegerfield',
		name: 'iops_wr_max',
		minValue: 10,
		step: 10,
		fieldLabel: gettext('Write max burst') + ' (ops)',
		labelWidth: labelWidth,
		emptyText: gettext('default'),
	    },
	);

	me.callParent();
    },
});

Ext.define('PVE.qemu.HDEdit', {
    extend: 'Proxmox.window.Edit',

    isAdd: true,

    backgroundDelay: 5,

    initComponent : function() {
	var me = this;

	var nodename = me.pveSelNode.data.node;
	if (!nodename) {
	    throw "no node name specified";
	}

	var unused = me.confid && me.confid.match(/^unused\d+$/);

	me.isCreate = me.confid ? unused : true;

	var ipanel = Ext.create('PVE.qemu.HDInputPanel', {
	    confid: me.confid,
	    nodename: nodename,
	    unused: unused,
	    isCreate: me.isCreate,
	});

	var subject;
	if (unused) {
	    me.subject = gettext('Unused Disk');
	} else if (me.isCreate) {
            me.subject = gettext('Hard Disk');
	} else {
           me.subject = gettext('Hard Disk') + ' (' + me.confid + ')';
	}

	me.items = [ ipanel ];

	me.callParent();
	/* 'data' is assigned an empty array in same file, and here we
	 * use it like an object
	 */
	me.load({
	    success: function(response, options) {
		ipanel.setVMConfig(response.result.data);
		if (me.confid) {
		    var value = response.result.data[me.confid];
		    var drive = PVE.Parser.parseQemuDrive(me.confid, value);
		    if (!drive) {
			Ext.Msg.alert(gettext('Error'), 'Unable to parse drive options');
			me.close();
			return;
		    }
		    ipanel.setDrive(drive);
		    me.isValid(); // trigger validation
		}
	    },
	});
    },
});
