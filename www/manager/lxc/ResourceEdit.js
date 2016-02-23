var labelWidth = 120;

Ext.define('PVE.lxc.MemoryEdit', {
    extend: 'PVE.window.Edit',

    initComponent : function() {
	var me = this;

	Ext.apply(me, {
	    subject: gettext('Memory'),
	    items: Ext.create('PVE.lxc.MemoryInputPanel')
	});

	me.callParent();

	me.load();
    }
});


Ext.define('PVE.lxc.CPUEdit', {
    extend: 'PVE.window.Edit',

    initComponent : function() {
	var me = this;

	Ext.apply(me, {
	    subject: gettext('CPU'),
	    items: Ext.create('PVE.lxc.CPUInputPanel')
	});

	me.callParent();

	me.load();
    }
});

Ext.define('PVE.lxc.MountPointEdit', {
    extend: 'PVE.window.Edit',

    initComponent : function() {
	var me = this;

	var nodename = me.pveSelNode.data.node;
	if (!nodename) {
	    throw "no node name specified";
	}

	var unused = me.confid && me.confid.match(/^unused\d+$/);

	me.create = me.confid ? unused : true;

	var ipanel = Ext.create('PVE.lxc.MountPointInputPanel', {
	    confid: me.confid,
	    nodename: nodename,
	    unused: unused,
	    create: me.create,
	});

	var subject;
	if (unused) {
	    subject = gettext('Unused Mount Point');
	} else if (me.create) {
	    subject = gettext('Mount Point');
	} else {
	    subject = gettext('Mount Point') + ' (' + me.confid + ')';
	}

	Ext.apply(me, {
	    subject: subject,
	    items: ipanel,
	});

	me.callParent();

	me.load({
	    success: function(response, options) {
		ipanel.setVMConfig(response.result.data);
		if (me.confid) {
		    var value = response.result.data[me.confid];
		    var mp = PVE.Parser.parseLxcMountPoint(value);

		    if (!mp) {
			Ext.Msg.alert(gettext('Error'), gettext('Unable to parse mount point options'));
			me.close();
			return;
		    }

		    ipanel.setMountPoint(mp);
		    me.isValid(); // trigger validation
		}
	    }
	});
    }
});

Ext.define('PVE.lxc.CPUInputPanel', {
    extend: 'PVE.panel.InputPanel',
    alias: 'widget.pveLxcCPUInputPanel',

    insideWizard: false,

    initComponent : function() {
	var me = this;

	var items = [
	    {
		xtype: 'numberfield',
		name: 'cpulimit',
		minValue: 0,
		value: '1',
		step: 1,
		fieldLabel: gettext('CPU limit'),
		labelWidth: labelWidth,
		allowBlank: false
	    },
	    {
		xtype: 'numberfield',
		name: 'cpuunits',
		fieldLabel: gettext('CPU units'),
		value: 1024,
		minValue: 8,
		maxValue: 500000,
		labelWidth: labelWidth,
		allowBlank: false
	    }
	];

 	if (me.insideWizard) {
	    me.column1 = items;
	} else {
	    me.items = items;
	}
   
	me.callParent();
    }
});

Ext.define('PVE.lxc.MemoryInputPanel', {
    extend: 'PVE.panel.InputPanel',
    alias: 'widget.pveLxcMemoryInputPanel',

    insideWizard: false,

    initComponent : function() {
	var me = this;

	var items = [
	    {
		xtype: 'numberfield',
		name: 'memory',
		minValue: 32,
		maxValue: 512*1024,
		value: '512',
		step: 32,
		fieldLabel: gettext('Memory') + ' (MB)',
		labelWidth: labelWidth,
		allowBlank: false
	    },
	    {
		xtype: 'numberfield',
		name: 'swap',
		minValue: 0,
		maxValue: 128*1024,
		value: '512',
		step: 32,
		fieldLabel: gettext('Swap') + ' (MB)',
		labelWidth: labelWidth,
		allowBlank: false
	    }
	];

	if (me.insideWizard) {
	    me.column1 = items;
	} else {
	    me.items = items;
	}
 
	me.callParent();
    }
});

Ext.define('PVE.lxc.MountPointInputPanel', {
    extend: 'PVE.panel.InputPanel',
    alias: 'widget.pveLxcMountPointInputPanel',

    insideWizard: false,

    unused: false, // ADD usused disk imaged

    vmconfig: {}, // used to select usused disks

    onGetValues: function(values) {
	var me = this;

	var confid = me.confid || values.mpsel;

	if (me.unused) {
	    me.mpdata.file = me.vmconfig[values.unusedId];
	    confid = values.mpsel;
	} else if (me.create) {
	    me.mpdata.file = values.storage + ':' + values.disksize;
	}

	if (confid !== 'rootfs')
	    me.mpdata.mp = values.mp;

	if (values.ro)
	    me.mpdata.ro = 1;
	else
	    delete me.mpdata.ro;

	if (values.quota)
	    me.mpdata.quota = 1;
	else
	    delete me.mpdata.quota;

	if (values.acl === 'Default')
	    delete me.mpdata.acl;
	else
	    me.mpdata.acl = values.acl;

	var res = {};
	res[confid] = PVE.Parser.printLxcMountPoint(me.mpdata);
	return res;
    },

    setMountPoint: function(mp) {
	var me = this;

	me.mpdata = mp;
	if (!Ext.isDefined(me.mpdata['acl'])) {
	    me.mpdata['acl'] = 'Default';
	}

	if (mp.type === 'bind') {
	    me.quota.setDisabled(true);
	    me.quota.setValue(false);
	}

	me.setValues(mp);
    },

    setVMConfig: function(vmconfig) {
	var me = this;

	me.vmconfig = vmconfig;

	if (me.mpsel) {
	    for (var i = 0; i != 8; ++i) {
		var name = "mp" + i;
		if (!Ext.isDefined(vmconfig[name])) {
		    me.mpsel.setValue(name);
		    break;
		}
	    }
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

    setNodename: function(nodename) {
	var me = this;
	me.hdstoragesel.setNodename(nodename);
	me.hdfilesel.setStorage(undefined, nodename);
    },

    initComponent : function() {
	var me = this;

	var isroot = me.confid === 'rootfs';

	me.mpdata = {};

	me.column1 = [];

	if (!me.confid || me.unused) {
	    var names = [];
	    for (var i = 0; i != 8; ++i) {
		var name = 'mp' + i;
		names.push([name, name]);
	    }
	    me.mpsel = Ext.create('PVE.form.KVComboBox', {
		name: 'mpsel',
		fieldLabel: gettext('Mount Point'),
		matchFieldWidth: false,
		allowBlank: false,
		data: names,
		validator: function(value) {
		    if (!me.rendered)
			return;
		    if (Ext.isDefined(me.vmconfig[value]))
			return "Mount point is already in use.";
		    return true;
		},
		listeners: {
		    change: function(field, value) {
			field.validate();
		    }
		},
	    });
	    me.column1.push(me.mpsel);
	}

	// we always have this around, but only visible when creating a new mp
	// since this handles per-filesystem capabilities
	me.hdstoragesel = Ext.create('PVE.form.StorageSelector', {
	    name: 'storage',
	    nodename: me.nodename,
	    fieldLabel: gettext('Storage'),
	    storageContent: 'rootdir',
	    allowBlank: false,
	    autoSelect: true,
	    hidden: me.unused || !me.create,
	    listeners: {
		change: function(f, value) {
		    if (me.mpdata.type === 'bind') {
			me.quota.setDisabled(true);
			me.quota.setValue(false);
			return;
		    }
		    var rec = f.store.getById(value);
		    if (rec.data.type === 'zfs' ||
		        rec.data.type === 'zfspool') {
			me.quota.setDisabled(true);
			me.quota.setValue(false);
		    } else {
			me.quota.setDisabled(false);
		    }
		    if (me.unused || !me.create)
			return;
		    if (rec.data.type === 'iscsi') {
			me.hdfilesel.setStorage(value);
			me.hdfilesel.setDisabled(false);
			me.hdfilesel.setVisible(true);
			me.hdsizesel.setDisabled(true);
			me.hdsizesel.setVisible(false);
		    } else if (rec.data.type === 'lvm' ||
			       rec.data.type === 'lvmthin' ||
			       rec.data.type === 'rbd' ||
			       rec.data.type === 'sheepdog' ||
			       rec.data.type === 'zfs' ||
			       rec.data.type === 'zfspool') {
			me.hdfilesel.setDisabled(true);
			me.hdfilesel.setVisible(false);
			me.hdsizesel.setDisabled(false);
			me.hdsizesel.setVisible(true);
		    } else {
			me.hdfilesel.setDisabled(true);
			me.hdfilesel.setVisible(false);
			me.hdsizesel.setDisabled(false);
			me.hdsizesel.setVisible(true);
		    }
		},
	    },
	});
	me.column1.push(me.hdstoragesel);

	if (me.unused) {
	    me.unusedDisks = Ext.create('PVE.form.KVComboBox', {
		name: 'unusedId',
		fieldLabel: gettext('Disk image'),
		matchFieldWidth: false,
		listConfig: {
		    width: 350
		},
		data: [],
		allowBlank: false,
		listeners: {
		    change: function(f, value) {
			// make sure our buttons are enabled/disabled when switching
			// between images on different storages:
			var disk = me.vmconfig[value];
			var storage = disk.split(':')[0];
			me.hdstoragesel.setValue(storage);
		    },
		},
	    });
	    me.column1.push(me.unusedDisks);
	} else if (me.create) {
	    me.hdfilesel = Ext.create('PVE.form.FileSelector', {
		name: 'file',
		nodename: me.nodename,
		storageContent: 'images',
		fieldLabel: gettext('Disk image'),
		disabled: true,
		hidden: true,
		allowBlank: false
	    });
	    me.hdsizesel = Ext.createWidget('numberfield', {
		name: 'disksize',
		minValue: 0.1,
		maxValue: 128*1024,
		decimalPrecision: 3,
		value: '8',
		step: 1,
		fieldLabel: gettext('Disk size') + ' (GB)',
		allowBlank: false
	    });
	    me.column1.push(me.hdfilesel);
	    me.column1.push(me.hdsizesel);
	} else {
	    me.column1.push({
		xtype: 'textfield',
		disabled: true,
		submitValue: false,
		fieldLabel: gettext('Disk image'),
		name: 'file'
	    });
	}

	me.quota = Ext.createWidget('pvecheckbox', {
	    name: 'quota',
	    defaultValue: 0,
	    fieldLabel: gettext('Enable quota'),
	});

	me.column2 = [
	    {
		xtype: 'pvecheckbox',
		name: 'ro',
		defaultValue: 0,
		fieldLabel: gettext('Read-only'),
		hidden: me.insideWizard,
	    },
	    {
		xtype: 'pveKVComboBox',
		name: 'acl',
		fieldLabel: gettext('ACLs'),
		data: [['Default', 'Default'], ['1', 'On'], ['0', 'Off']],
		value: 'Default',
		allowBlank: true,
	    },
	    me.quota,
	];

	if (!isroot) {
	    me.column2.push({
		xtype: 'textfield',
		name: 'mp',
		value: '',
		emptyText: gettext('Path'),
		allowBlank: false,
		hidden: isroot,
		fieldLabel: gettext('/some/path'),
	    });
	};

	me.callParent();
    }
});
