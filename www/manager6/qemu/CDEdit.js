Ext.define('PVE.qemu.CDInputPanel', {
    extend: 'PVE.panel.InputPanel',
    alias: 'widget.pveQemuCDInputPanel',

    insideWizard: false,

    onGetValues: function(values) {
	var me = this;

	var confid = me.confid || (values.controller + values.deviceid);
	
	me.drive.media = 'cdrom';
	if (values.mediaType === 'iso') {
	    me.drive.file = values.cdimage;
	} else if (values.mediaType === 'cdrom') {
	    me.drive.file = 'cdrom';
	} else {
	    me.drive.file = 'none';
	}

	var params = {};
		
	params[confid] = PVE.Parser.printQemuDrive(me.drive);
	
	return params;	
    },

    setVMConfig: function(vmconfig) {
	var me = this;

	if (me.bussel) {
	    me.bussel.setVMConfig(vmconfig, 'cdrom');
	}
    },

    setDrive: function(drive) {
	var me = this;

	var values = {};
	if (drive.file === 'cdrom') {
	    values.mediaType = 'cdrom';
	} else if (drive.file === 'none') {
	    values.mediaType = 'none';
	} else {
	    values.mediaType = 'iso';
	    var match = drive.file.match(/^([^:]+):/);
	    if (match) {
		values.cdstorage = match[1];
		values.cdimage = drive.file;
	    }
	}

	me.drive = drive;

	me.setValues(values);
    },

    setNodename: function(nodename) {
	var me = this;

	me.cdstoragesel.setNodename(nodename);
	me.cdfilesel.setStorage(undefined, nodename);
    },

    initComponent : function() {
	var me = this;

	me.drive = {};

	var items = [];

	if (!me.confid) {
	    me.bussel = Ext.create('PVE.form.ControllerSelector', {
		noVirtIO: true
	    });
	    items.push(me.bussel);
	}

	items.push({
	    xtype: 'radiofield',
	    name: 'mediaType',
	    inputValue: 'iso',
	    boxLabel: gettext('Use CD/DVD disc image file (iso)'),
	    checked: true,
	    listeners: {
		change: function(f, value) {
		    if (!me.rendered) {
			return;
		    }
		    me.down('field[name=cdstorage]').setDisabled(!value);
		    me.down('field[name=cdimage]').setDisabled(!value);
		    me.down('field[name=cdimage]').validate();
		}
	    }
	});

	me.cdfilesel = Ext.create('PVE.form.FileSelector', {
	    name: 'cdimage',
	    nodename: me.nodename,
	    storageContent: 'iso',
	    fieldLabel: gettext('ISO image'),
	    labelAlign: 'right',
	    allowBlank: false
	});
	
	me.cdstoragesel = Ext.create('PVE.form.StorageSelector', {
	    name: 'cdstorage',
	    nodename: me.nodename,
	    fieldLabel: gettext('Storage'),
	    labelAlign: 'right',
	    storageContent: 'iso',
	    allowBlank: false,
	    autoSelect: me.insideWizard,
	    listeners: {
		change: function(f, value) {
		    me.cdfilesel.setStorage(value);
		}
	    }
	});

	items.push(me.cdstoragesel);
	items.push(me.cdfilesel);

	items.push({
	    xtype: 'radiofield',
	    name: 'mediaType',
	    inputValue: 'cdrom',
	    boxLabel: gettext('Use physical CD/DVD Drive')
	});

	items.push({
	    xtype: 'radiofield',
	    name: 'mediaType',
	    inputValue: 'none',
	    boxLabel: gettext('Do not use any media')
	});

	me.items = items;

	me.callParent();
    }
});

Ext.define('PVE.qemu.CDEdit', {
    extend: 'PVE.window.Edit',

    initComponent : function() {
	var me = this;

	var nodename = me.pveSelNode.data.node;
	if (!nodename) { 
	    throw "no node name specified";	    
	}

	me.isCreate = me.confid ? false : true;

	var ipanel = Ext.create('PVE.qemu.CDInputPanel', {
	    confid: me.confid,
	    nodename: nodename
	});

	Ext.applyIf(me, {
	    subject: 'CD/DVD Drive',
	    items: [ ipanel ]
	});

	me.callParent();
	
	me.load({
	    success:  function(response, options) {
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
		}
	    }
	});
    }
});
