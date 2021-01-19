Ext.define('PVE.window.HDMove', {
    extend: 'Ext.window.Window',

    resizable: false,


    move_disk: function(disk, storage, format, delete_disk) {
	var me = this;
	var qemu = (me.type === 'qemu');
	var params = {};
	params.storage = storage;
	params[qemu ? 'disk':'volume'] = disk;

	if (format && qemu) {
	    params.format = format;
	}

	if (delete_disk) {
	    params['delete'] = 1;
	}

	var url = '/nodes/' + me.nodename + '/' + me.type + '/' + me.vmid + '/';
	url += qemu ? 'move_disk' : 'move_volume';

	Proxmox.Utils.API2Request({
	    params: params,
	    url: url,
	    waitMsgTarget: me,
	    method: 'POST',
	    failure: function(response, opts) {
		Ext.Msg.alert('Error', response.htmlStatus);
	    },
	    success: function(response, options) {
		var upid = response.result.data;
		var win = Ext.create('Proxmox.window.TaskViewer', {
		    upid: upid,
		});
		win.show();
		win.on('destroy', function() { me.close(); });
	    },
	});
    },

    initComponent: function() {
	var me = this;

	var diskarray = [];

	if (!me.nodename) {
	    throw "no node name specified";
	}

	if (!me.vmid) {
	    throw "no VM ID specified";
	}

	if (!me.type) {
	    me.type = 'qemu';
	}

	var qemu = (me.type === 'qemu');

        var items = [
            {
                xtype: 'displayfield',
                name: qemu ? 'disk' : 'volume',
                value: me.disk,
                fieldLabel: qemu ? gettext('Disk') : gettext('Mount Point'),
                vtype: 'StorageId',
                allowBlank: false,
            },
        ];

	items.push({
	    xtype: 'pveDiskStorageSelector',
	    storageLabel: gettext('Target Storage'),
	    nodename: me.nodename,
	    storageContent: qemu ? 'images' : 'rootdir',
	    hideSize: true,
	});

	items.push({
	    xtype: 'proxmoxcheckbox',
	    fieldLabel: gettext('Delete source'),
	    name: 'deleteDisk',
	    uncheckedValue: 0,
	    checked: false,
	});

	me.formPanel = Ext.create('Ext.form.Panel', {
	    bodyPadding: 10,
	    border: false,
	    fieldDefaults: {
		labelWidth: 100,
		anchor: '100%',
	    },
	    items: items,
	});

	var form = me.formPanel.getForm();

	var submitBtn;

	me.title = qemu ? gettext("Move disk") : gettext('Move Volume');
	submitBtn = Ext.create('Ext.Button', {
	    text: me.title,
	    handler: function() {
		if (form.isValid()) {
		    var values = form.getValues();
		    me.move_disk(me.disk, values.hdstorage, values.diskformat,
				 values.deleteDisk);
		}
	    },
	});

	Ext.apply(me, {
	    modal: true,
	    width: 350,
	    border: false,
	    layout: 'fit',
	    buttons: [submitBtn],
	    items: [me.formPanel],
	});


	me.callParent();

	me.mon(me.formPanel, 'validitychange', function(fp, isValid) {
	    submitBtn.setDisabled(!isValid);
	});

	me.formPanel.isValid();
    },
});
