Ext.define('PVE.lxc.MountPointInputPanel', {
    extend: 'PVE.panel.InputPanel',
    alias: 'widget.pveLxcMountPointInputPanel',

    insideWizard: false,

    onlineHelp: 'pct_container_storage',

    unused: false, // add unused disk imaged

    unprivileged: false,

    vmconfig: {}, // used to select unused disks

    onGetValues: function(values) {
	var me = this;

	var confid = me.confid || values.mpsel;

	if (me.unused) {
	    me.mpdata.file = me.vmconfig[values.unusedId];
	    confid = values.mpsel;
	} else if (me.isCreate) {
	    me.mpdata.file = values.hdstorage + ':' + values.disksize;
	}

	if (confid !== 'rootfs') {
	    me.mpdata.mp = values.mp;
	}

	if (values.ro) {
	    me.mpdata.ro = 1;
	} else {
	    delete me.mpdata.ro;
	}

	if (values.quota) {
	    me.mpdata.quota = 1;
	} else {
	    delete me.mpdata.quota;
	}

	if (values.acl === 'Default') {
	    delete me.mpdata.acl;
	} else {
	    me.mpdata.acl = values.acl;
	}

	if (values.backup) {
	    me.mpdata.backup = 1;
	} else {
	    delete me.mpdata.backup;
	}

	if (values.noreplicate) {
	    me.mpdata.replicate = '0';
	}
	delete me.mpdata.noreplicate;

	var res = {};
	res[confid] = PVE.Parser.printLxcMountPoint(me.mpdata);
	return res;
    },

    setMountPoint: function(mp) {
	var me = this;

	// the fields name is 'hdstorage',
	// but the api expects/has 'storage'
	mp.hdstorage = mp.storage;
	delete mp.hdstorage;

	me.mpdata = mp;
	if (!Ext.isDefined(me.mpdata.acl)) {
	    me.mpdata.acl = 'Default';
	}

	if (mp.type === 'bind') {
	    me.quota.setDisabled(true);
	    me.quota.setValue(false);
	    me.acl.setDisabled(true);
	    me.acl.setValue('Default');
	    me.down('#hdstorage').setDisabled(true);
	    if (me.confid !== 'rootfs') {
		me.backup.setDisabled(true);
	    }
	}

	if (mp.replicate) { // check box reverses the config option
	    mp.noreplicate = !PVE.Parser.parseBoolean(mp.replicate, 1);
	    delete mp.replicate;
	}

	me.setValues(mp);
    },

    setVMConfig: function(vmconfig) {
	var me = this;

	me.vmconfig = vmconfig;

	if (me.mpsel) {
	    var i;
	    for (i = 0; i != 8; ++i) {
		var name = "mp" + i.toString();
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
	me.down('#hdstorage').setNodename(nodename);
	me.down('#hdimage').setStorage(undefined, nodename);
    },

    initComponent : function() {
	var me = this;

	var isroot = me.confid === 'rootfs';

	me.mpdata = {};

	me.column1 = [];

	if (!me.confid || me.unused) {
	    var names = [];
	    var i;
	    for (i = 0; i != 8; ++i) {
		var name = 'mp' + i.toString();
		names.push([name, name]);
	    }
	    me.mpsel = Ext.create('PVE.form.KVComboBox', {
		name: 'mpsel',
		fieldLabel: gettext('Mount Point'),
		matchFieldWidth: false,
		allowBlank: false,
		comboItems: names,
		validator: function(value) {
		    if (!me.rendered) {
			return;
		    }
		    if (Ext.isDefined(me.vmconfig[value])) {
			return "Mount point is already in use.";
		    }
		    /*jslint confusion: true*/
		    /* returns a string above */
		    return true;
		},
		listeners: {
		    change: function(field, value) {
			field.validate();
		    }
		}
	    });
	    me.column1.push(me.mpsel);
	}

	me.column1.push({
	    xtype: 'pveDiskStorageSelector',
	    nodename: me.nodename,
	    storageContent: 'rootdir',
	    autoSelect: true,
	    hidden: me.unused || !me.isCreate
	});

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
			me.down('#hdstorage').setValue(storage);
		    }
		}
	    });
	    me.column1.push(me.unusedDisks);
	} else if (!me.isCreate) {
	    me.column1.push({
		xtype: 'textfield',
		disabled: true,
		submitValue: false,
		fieldLabel: gettext('Disk image'),
		name: 'file'
	    });
	}

	me.acl = Ext.createWidget('pveKVComboBox', {
	    name: 'acl',
	    fieldLabel: 'ACLs',
	    comboItems: [['Default', 'Default'], ['1', 'On'], ['0', 'Off']],
	    value: 'Default',
	    allowBlank: true
	});

	me.quota = Ext.createWidget('pvecheckbox', {
	    name: 'quota',
	    defaultValue: 0,
	    disabled: me.unprivileged,
	    fieldLabel: gettext('Enable quota')
	});

	me.column2 = [
	    me.acl,
	    me.quota
	];

	if (!isroot) {
	    me.column2.splice(1, 0, {
		xtype: 'pvecheckbox',
		name: 'ro',
		defaultValue: 0,
		fieldLabel: gettext('Read-only'),
		hidden: me.insideWizard
	    });

	    me.backup = Ext.createWidget('pvecheckbox',{
		xtype: 'pvecheckbox',
		name: 'backup',
		fieldLabel: gettext('Backup')
	    });
	    if (me.mpdata.type !== 'bind') {
		me.column2.push(me.backup);
	    }
	    me.column2.push({
		xtype: 'pvecheckbox',
		name: 'noreplicate',
		fieldLabel: gettext('Skip replication')
	    });
	    me.column2.push({
		xtype: 'textfield',
		name: 'mp',
		value: '',
		emptyText:  gettext('/some/path'),
		allowBlank: false,
		hidden: isroot,
		fieldLabel: gettext('Path')
	    });
	}

	me.callParent();

	if (me.unused || me.isCreate) {
	    me.mon(me.down('#hdstorage'), 'change', function(field, newValue) {
		if (!newValue) {
		    return;
		}
		var rec = field.store.getById(newValue);
		if (!rec) {
		    return;
		}
		if (rec.data.type === 'zfs' || rec.data.type === 'zfspool') {
		    me.quota.setDisabled(true);
		    me.quota.setValue(false);
		} else {
		    me.quota.setDisabled(me.unprivileged);
		}
	    });
	}
    }
});

Ext.define('PVE.lxc.MountPointEdit', {
    extend: 'PVE.window.Edit',

    unprivileged: false,

    initComponent : function() {
	var me = this;

	var nodename = me.pveSelNode.data.node;
	if (!nodename) {
	    throw "no node name specified";
	}

	var unused = me.confid && me.confid.match(/^unused\d+$/);

	me.isCreate = me.confid ? unused : true;

	var ipanel = Ext.create('PVE.lxc.MountPointInputPanel', {
	    confid: me.confid,
	    nodename: nodename,
	    unused: unused,
	    unprivileged: me.unprivileged,
	    isCreate: me.isCreate
	});

	var subject;
	if (unused) {
	    subject = gettext('Unused Disk');
	} else if (me.isCreate) {
	    subject = gettext('Mount Point');
	} else {
	    subject = gettext('Mount Point') + ' (' + me.confid + ')';
	}

	Ext.apply(me, {
	    subject: subject,
	    items: ipanel
	});

	me.callParent();

	me.load({
	    success: function(response, options) {
		ipanel.setVMConfig(response.result.data);
		if (me.confid) {
		    /*jslint confusion: true*/
		    /*data is defined as array above*/
		    var value = response.result.data[me.confid];
		    /*jslint confusion: false*/
		    var mp = PVE.Parser.parseLxcMountPoint(value);

		    if (!mp) {
			Ext.Msg.alert(gettext('Error'), 'Unable to parse mount point options');
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
