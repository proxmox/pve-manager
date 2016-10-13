Ext.define('PVE.qemu.EFIDiskInputPanel', {
    extend: 'PVE.panel.InputPanel',
    alias: 'widget.pveEFIDiskInputPanel',

    insideWizard: false,

    unused: false, // ADD usused disk imaged

    vmconfig: {}, // used to select usused disks

    controller: {

	xclass: 'Ext.app.ViewController',

	control: {
	    'field[name=hdstorage]': {
		change: function(f, value) {
		    if (!value) { // initial store loading fires an unwanted 'change'
			return;
		    }
		    var me = this.getView();
		    var rec = f.store.getById(value);

		    var rawArray = ['iscsi', 'lvm', 'lvmthin', 'drbd', 'rbd', 'sheepdog', 'zfs', 'zfspool'];

		    me.hdfilesel.setDisabled(true);
		    me.hdfilesel.setVisible(false);
		    me.formatsel.setValue('qcow2');
		    me.formatsel.setDisabled(false);

		    // if rec.data.type exists in the array
		    if (rawArray.indexOf(rec.data.type) !== -1) {
			me.formatsel.setValue('raw');
			me.formatsel.setDisabled(true);
		    }

		    if (rec.data.type === 'iscsi') {
			me.hdfilesel.setStorage(value);
			me.hdfilesel.setDisabled(false);
			me.hdfilesel.setVisible(true);
		    }
		}
	    }
	}
    },

    onGetValues: function(values) {
	var me = this;

	var confid = 'efidisk0';

	if (values.hdimage) {
	    me.drive.file = values.hdimage;
	} else {
	    // we use 1 here, because for efi the size gets overridden from the backend
	    me.drive.file = values.hdstorage + ":1";
	}

	me.drive.format = values.diskformat;
	var params = {};
	params[confid] = PVE.Parser.printQemuDrive(me.drive);
	return params;
    },

    setNodename: function(nodename) {
	var me = this;
	me.hdstoragesel.setNodename(nodename);
	me.hdfilesel.setStorage(undefined, nodename);
    },

    initComponent : function() {
	var me = this;

	me.drive = {};

	me.items= [];

	me.formatsel = Ext.create('PVE.form.DiskFormatSelector', {
	    name: 'diskformat',
	    fieldLabel: gettext('Format'),
	    value: 'qcow2',
	    allowBlank: false
	});

	me.hdfilesel = Ext.create('PVE.form.FileSelector', {
	    name: 'hdimage',
	    nodename: me.nodename,
	    storageContent: 'images',
	    fieldLabel: gettext('Disk image'),
	    disabled: true,
	    hidden: true,
	    allowBlank: false
	});

	me.hdstoragesel = Ext.create('PVE.form.StorageSelector', {
	    name: 'hdstorage',
	    nodename: me.nodename,
	    fieldLabel: gettext('Storage'),
	    storageContent: 'images',
	    autoSelect: me.insideWizard,
	    allowBlank: false
	});
	me.items.push(me.hdstoragesel);
	me.items.push(me.hdfilesel);
	me.items.push(me.formatsel);

	me.callParent();
    }
});

Ext.define('PVE.qemu.EFIDiskEdit', {
    extend: 'PVE.window.Edit',

    isAdd: true,
    subject: gettext('EFI Disk'),

    initComponent : function() {
	var me = this;

	var nodename = me.pveSelNode.data.node;
	if (!nodename) {
	    throw "no node name specified";
	}

	/*jslint confusion: true */
	/* because create is a method above..., really jslint? */
	me.items = [{
	    xtype: 'pveEFIDiskInputPanel',
	    onlineHelp: 'qm_bios_and_uefi',
	    confid: me.confid,
	    nodename: nodename,
	    create: true
	}];
	/* jslint confusion: false */

	me.callParent();
    }
});
