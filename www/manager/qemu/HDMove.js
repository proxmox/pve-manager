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

        me.hdstoragesel = Ext.create('PVE.form.StorageSelector', {
                name: 'hdstorage',
                nodename: me.nodename,
                fieldLabel: gettext('Target Storage'),
                storageContent: 'images',
                autoSelect: me.insideWizard,
                allowBlank: true,
                disabled: false,
                hidden: false,
                listeners: {
                    change: function(f, value) {
                        var rec = f.store.getById(value);
			if (rec.data.type === 'iscsi') {
                            me.formatsel.setValue('raw');
                            me.formatsel.setDisabled(true);
                        } else if (rec.data.type === 'lvm' ||
                                   rec.data.type === 'rbd' ||
                                   rec.data.type === 'sheepdog' ||
                                   rec.data.type === 'zfs' ||
				   rec.data.type === 'zfspool'
                        ) {
                            me.formatsel.setValue('raw');
                            me.formatsel.setDisabled(true);
                        } else {
                            me.formatsel.setDisabled(false);
                        }

                    }
                }

	});

	me.formatsel = Ext.create('PVE.form.DiskFormatSelector', {
		name: 'diskformat',
		fieldLabel: gettext('Format'),
		value: 'raw',
                disabled: true,
                hidden: false,
		allowBlank: false
	});


   
	items.push(me.hdstoragesel);
	items.push(me.formatsel);

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


    }
});
