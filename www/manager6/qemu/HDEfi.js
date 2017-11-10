Ext.define('PVE.qemu.EFIDiskInputPanel', {
    extend: 'PVE.panel.InputPanel',
    alias: 'widget.pveEFIDiskInputPanel',

    insideWizard: false,

    unused: false, // ADD usused disk imaged

    vmconfig: {}, // used to select usused disks

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
	me.down('#hdstorage').setNodename(nodename);
	me.down('#hdimage').setStorage(undefined, nodename);
    },

    initComponent : function() {
	var me = this;

	me.drive = {};

	me.items= [];

	me.items.push({
	    xtype: 'pveDiskStorageSelector',
	    name: 'efidisk0',
	    storageContent: 'images',
	    nodename: me.nodename,
	    hideSize: true
	});
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

	me.items = [{
	    xtype: 'pveEFIDiskInputPanel',
	    onlineHelp: 'qm_bios_and_uefi',
	    confid: me.confid,
	    nodename: nodename,
	    isCreate: true
	}];

	me.callParent();
    }
});
