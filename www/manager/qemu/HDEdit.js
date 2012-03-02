// fixme: howto avoid jslint type confusion?
/*jslint confusion: true */
Ext.define('PVE.qemu.HDInputPanel', {
    extend: 'PVE.panel.InputPanel',
    alias: 'widget.PVE.qemu.HDInputPanel',

    insideWizard: false,

    unused: false, // ADD usused disk imaged

    vmconfig: {}, // used to select usused disks

    onGetValues: function(values) {
	var me = this;

	var confid = me.confid || (values.controller + values.deviceid);
	
	if (me.unused) {
	    me.drive.file = me.vmconfig[values.unusedId];
	    confid = values.controller + values.deviceid;
	} else if (me.create) {
	    if (values.hdimage) {
		me.drive.file = values.hdimage;
	    } else {
		me.drive.file = values.hdstorage + ":" + values.disksize;
	    }
	    me.drive.format = values.diskformat;
	}
	
	if (values.cache) {
	    me.drive.cache = values.cache;
	} else {
	    delete me.drive.cache;
	}

	if (values.nobackup) {
	    me.drive.backup = 'no';
	} else {
	    delete me.drive.backup;
	}

	var params = {};
		
	params[confid] = PVE.Parser.printQemuDrive(me.drive);
	
	return params;	
    },

    setVMConfig: function(vmconfig) {
	var me = this;

	me.vmconfig = vmconfig;

	if (me.bussel) {
	    me.bussel.setVMConfig(vmconfig, true);
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
	values.nobackup = (drive.backup === 'no');
	values.diskformat = drive.format || 'raw';
	values.cache = drive.cache || '';

	me.setValues(values);
    },

    setNodename: function(nodename) {
	var me = this;
	me.hdstoragesel.setNodename(nodename);
	me.hdfilesel.setStorage(undefined, nodename);
    },

    initComponent : function() {
	var me = this;

	me.drive = {};

	me.column1 = [];
	me.column2 = [];

	if (!me.confid || me.unused) {
	    me.bussel = Ext.createWidget('PVE.form.ControllerSelector', {
		// boot from scsi does not work in kvm 1.0
		noScsi: me.insideWizard ? true : false, 
		vmconfig: me.insideWizard ? {ide2: 'cdrom'} : {}
	    });
	    me.column1.push(me.bussel);
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
	} else if (me.create) {
	    me.hdfilesel = Ext.create('PVE.form.FileSelector', {
		name: 'hdimage',
		nodename: me.nodename,
		storageContent: 'images',
		fieldLabel: gettext('Disk image'),
		disabled: true,
		hidden: true,
		allowBlank: false
	    });

	    me.hdsizesel = Ext.createWidget('numberfield', {
		name: 'disksize',
		minValue: 1,
		maxValue: 128*1024,
		value: '32',
		fieldLabel: gettext('Disk size') + ' (GB)',
		allowBlank: false
	    });

	    me.hdstoragesel = Ext.create('PVE.form.StorageSelector', {
		name: 'hdstorage',
		nodename: me.nodename,
		fieldLabel: gettext('Storage'),
		storageContent: 'images',
		autoSelect: me.insideWizard,
		allowBlank: false,
		listeners: {
		    change: function(f, value) {
			var rec = f.store.getById(value);
			if (rec.data.type === 'iscsi') {
			    me.hdfilesel.setStorage(value);
			    me.hdfilesel.setDisabled(false);
			    me.hdfilesel.setVisible(true);
			    me.hdsizesel.setDisabled(true);
			    me.hdsizesel.setVisible(false);
			} else {
			    me.hdfilesel.setDisabled(true);
			    me.hdfilesel.setVisible(false);
			    me.hdsizesel.setDisabled(false);
			    me.hdsizesel.setVisible(true);
			}			
		    }
		}
	    });
	    me.column1.push(me.hdstoragesel);
	    me.column1.push(me.hdfilesel);
	    me.column1.push(me.hdsizesel);
	} else {
	    me.column1.push({
		xtype: 'displayfield',
 		fieldLabel: gettext('Disk image'),
 		labelWidth: 50,
                name: 'hdimage'
	    });
	}

	if (me.create && !me.unused) {
	    me.column2.push({
		xtype: 'PVE.form.DiskFormatSelector',
		name: 'diskformat',
		fieldLabel: gettext('Format'),
		value: 'raw',
		allowBlank: false
	    });
	}

	me.column2.push({
	    xtype: 'CacheTypeSelector',
	    name: 'cache',
	    value: '',
	    fieldLabel: 'Cache'
	});

	if (!me.insideWizard) {
	    me.column2.push({
		xtype: 'pvecheckbox',
		fieldLabel: gettext('No backup'),
		name: 'nobackup'
	    });
	}

	me.callParent();
    }
});

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

	me.create = me.confid ? unused : true;

	var ipanel = Ext.create('PVE.qemu.HDInputPanel', {
	    confid: me.confid,
	    nodename: nodename,
	    unused: unused,
	    create: me.create
	});

	var subject;
	if (unused) {
	    me.subject = gettext('Unused Disk');
	} else if (me.create) {
            me.subject = gettext('Hard Disk');
	} else {
           me.subject = gettext('Hard Disk') + ' (' + me.confid + ')';
	}

	me.items = [ ipanel ];

	me.callParent();
	
	me.load({
	    success: function(response, options) {
		ipanel.setVMConfig(response.result.data);
		if (me.confid) {
		    var value = response.result.data[me.confid];
		    var drive = PVE.Parser.parseQemuDrive(me.confid, value);
		    if (!drive) {
			Ext.Msg.alert('Error', 'Unable to parse drive options');
			me.close();
			return;
		    }
		    ipanel.setDrive(drive);
		    me.isValid(); // trigger validation
		}
	    }
	});
    }
});
