/*jslint confusion: true */
/* 'change' property is assigned a string and then a function */
Ext.define('PVE.qemu.HDInputPanel', {
    extend: 'PVE.panel.InputPanel',
    alias: 'widget.pveQemuHDInputPanel',
    onlineHelp: 'qm_hard_disk',

    insideWizard: false,

    unused: false, // ADD usused disk imaged

    vmconfig: {}, // used to select usused disks

    controller: {

	xclass: 'Ext.app.ViewController',

	onControllerChange: function(field) {
	    var value = field.getValue();

	    var allowIOthread = value.match(/^(virtio|scsi)/);
	    this.lookup('iothread').setDisabled(!allowIOthread);
	    if (!allowIOthread) {
		this.lookup('iothread').setValue(false);
	    }

	    var scsi = value.match(/^scsi/);
	    this.lookup('discard').setDisabled(!scsi);
	    if (!scsi) {
		this.lookup('discard').setValue(false);
	    }
	    this.lookup('scsiController').setVisible(scsi);
	},

	control: {
	    'field[name=controller]': {
		change: 'onControllerChange',
		afterrender: 'onControllerChange'
	    },
	    'field[name=iothread]' : {
		change: function(f, value) {
		    if (!this.getView().insideWizard) {
			return;
		    }
		    var vmScsiType = value ? 'virtio-scsi-single': 'virtio-scsi-pci';
		    this.lookupReference('scsiController').setValue(vmScsiType);
		}
	    }
	}
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

	if (values.nobackup) {
	    me.drive.backup = 'no';
	} else {
	    delete me.drive.backup;
	}

	if (values.noreplicate) {
	    me.drive.replicate = 'no';
	} else {
	    delete me.drive.replicate;
	}

	if (values.discard) {
	    me.drive.discard = 'on';
	} else {
	    delete me.drive.discard;
	}

	if (values.iothread) {
	    me.drive.iothread = 'on';
	} else {
	    delete me.drive.iothread;
	}

	if (values.cache) {
	    me.drive.cache = values.cache;
	} else {
	    delete me.drive.cache;
	}

	if (values.scsihw) {
	    params.scsihw = values.scsihw;
	}

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
	values.nobackup = !PVE.Parser.parseBoolean(drive.backup, 1);
	values.noreplicate = !PVE.Parser.parseBoolean(drive.replicate, 1);
	values.diskformat = drive.format || 'raw';
	values.cache = drive.cache || '__default__';
	values.discard = (drive.discard === 'on');
	values.iothread = PVE.Parser.parseBoolean(drive.iothread);

	me.setValues(values);
    },

    setNodename: function(nodename) {
	var me = this;
	me.down('#hdstorage').setNodename(nodename);
	me.down('#hdimage').setStorage(undefined, nodename);
    },

    initComponent : function() {
	var me = this;

	me.drive = {};

	me.column1 = [];
	me.column2 = [];

	if (!me.confid || me.unused) {
	    me.bussel = Ext.create('PVE.form.ControllerSelector', {
		vmconfig: me.insideWizard ? {ide2: 'cdrom'} : {}
	    });
	    me.column1.push(me.bussel);

	    me.scsiController = Ext.create('Ext.form.field.Display', {
		name: 'scsihw',
		fieldLabel: gettext('SCSI Controller'),
		reference: 'scsiController',
		renderer: PVE.Utils.render_scsihw,
		// do not change a VM wide option after creation
		submitValue: me.insideWizard,
		hidden: true
	    });
	    me.column1.push(me.scsiController);
	}

	if (me.unused) {
	    me.unusedDisks = Ext.create('PVE.form.KVComboBox', {
		name: 'unusedId',
		fieldLabel: gettext('Disk image'),
		matchFieldWidth: false,
		listConfig: {
		    width: 350
		},
		data: [],
		allowBlank: false
	    });
	    me.column1.push(me.unusedDisks);
	} else if (me.isCreate) {
	    me.column1.push({
		xtype: 'pveDiskStorageSelector',
		storageContent: 'images',
		name: 'disk',
		nodename: me.nodename,
		autoSelect: me.insideWizard
	    });
	} else {
	    me.column1.push({
		xtype: 'textfield',
		disabled: true,
		submitValue: false,
		fieldLabel: gettext('Disk image'),
                name: 'hdimage'
	    });
	}

	me.column2.push({
	    xtype: 'CacheTypeSelector',
	    name: 'cache',
	    value: '__default__',
	    fieldLabel: gettext('Cache')
	},
	{
	    xtype: 'pvecheckbox',
	    fieldLabel: gettext('No backup'),
	    name: 'nobackup'
	},
	{
	    xtype: 'pvecheckbox',
	    hidden: me.insideWizard,
	    fieldLabel: gettext('Skip replication'),
	    name: 'noreplicate'
	},
	{
	    xtype: 'pvecheckbox',
	    fieldLabel: gettext('Discard'),
	    disabled: me.confid && !me.confid.match(/^scsi/),
	    reference: 'discard',
	    name: 'discard'
	},
	{
	    xtype: 'pvecheckbox',
	    disabled: me.confid && !me.confid.match(/^(virtio|scsi)/),
	    fieldLabel: 'IO thread',
	    reference: 'iothread',
	    name: 'iothread'
	});

	me.callParent();
    }
});
/*jslint confusion: false */

Ext.define('PVE.qemu.HDEdit', {
    extend: 'PVE.window.Edit',

    isAdd: true,

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
	    isCreate: me.isCreate
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
	/*jslint confusion: true*/
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
	    }
	});
	/*jslint confusion: false*/
    }
});
