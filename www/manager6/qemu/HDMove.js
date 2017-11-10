Ext.define('PVE.window.HDMove', {
    extend: 'Ext.window.Window',

    resizable: false,


    move_disk: function(disk, storage, format, delete_disk) {
	var me = this;

        var params =  { disk: disk, storage: storage };

        if (format) {
            params.format = format;
        }
	
	if (delete_disk) {
	    params['delete'] = 1;
	}

	PVE.Utils.API2Request({
	    params: params,
	    url: '/nodes/' + me.nodename + '/qemu/' + me.vmid + '/move_disk',
	    waitMsgTarget: me,
	    method: 'POST',
	    failure: function(response, opts) {
		Ext.Msg.alert('Error', response.htmlStatus);
	    },
	    success: function(response, options) {
		var upid = response.result.data;
		var win = Ext.create('PVE.window.TaskViewer', { upid: upid });
		win.show();
		me.close();
	    }
	});

    },

    initComponent : function() {
	var me = this;

	var diskarray = [];

	if (!me.nodename) {
	    throw "no node name specified";
	}

	if (!me.vmid) {
	    throw "no VM ID specified";
	}

        var items = [
            {
                xtype: 'displayfield',
                name: 'disk',
                value: me.disk,
                fieldLabel: gettext('Disk'),
                vtype: 'StorageId',
                allowBlank: false
            }
        ];

	items.push({
	    xtype: 'pveDiskStorageSelector',
	    storageLabel: gettext('Target Storage'),
	    nodename: me.nodename,
	    storageContent: 'images',
	    hideSize: true
	});

	items.push({
	    xtype: 'pvecheckbox',
	    fieldLabel: gettext('Delete source'),
	    name: 'deleteDisk',
	    uncheckedValue: 0,
	    checked: false
	});

	me.formPanel = Ext.create('Ext.form.Panel', {
	    bodyPadding: 10,
	    border: false,
	    fieldDefaults: {
		labelWidth: 100,
		anchor: '100%'
	    },
	    items: items
	});

	var form = me.formPanel.getForm();

	var submitBtn;

	me.title =  gettext("Move disk");
	submitBtn = Ext.create('Ext.Button', {
	    text: gettext('Move disk'),
	    handler: function() {
		if (form.isValid()) {
		    var values = form.getValues();
		    me.move_disk(me.disk, values.hdstorage, values.diskformat,
				 values.deleteDisk);
		}
	    }
	});

	Ext.apply(me, {
	    modal: true,
	    width: 350,
	    border: false,
	    layout: 'fit',
	    buttons: [ submitBtn ],
	    items: [ me.formPanel ]
	});


	me.callParent();

	me.mon(me.formPanel, 'validitychange', function(fp, isValid) {
	    submitBtn.setDisabled(!isValid);
	});

	me.formPanel.isValid();
    }
});
