Ext.define('PVE.window.Clone', {
    extend: 'Ext.window.Window',

    resizable: false,


    create_clone: function(snapname, name, newvmid, clonemode, storage, format, diskarray) {
	var me = this;

        var params = { name: name, newid: newvmid };

        if (snapname && snapname !== 'current') {
            params.snapname = snapname;
        }

	if (clonemode === 'copy') {
	    params.full = 1;
	    if (storage) {
		params.storage = storage;
		if (format) {
		    params.format = format;
		}
	    }
	}


	PVE.Utils.API2Request({
	    params: params,
	    url: '/nodes/' + me.nodename + '/qemu/' + me.vmid + '/clone',
	    waitMsgTarget: me,
	    method: 'POST',
	    failure: function(response, opts) {
		Ext.Msg.alert('Error', response.htmlStatus);
	    },
	    success: function(response, options) {
		me.close();
	    }
	});

    },

    compute_sel1: function(clonefeature, istemplate, snapname) {
        var me = this;
        var list = [];
        list.push(['copy', 'Copy Clone']);

	if((clonefeature && istemplate === 1 && snapname === 'current') || (clonefeature && !istemplate && snapname !== 'current')){
	    list.push(['clone', 'Linked Clone']);
	}
        me.kv1.store.loadData(list);

	if((clonefeature && istemplate === 1 && snapname === 'current') || (clonefeature && !istemplate && snapname !== 'current')){
	    me.kv1.setValue('clone');
	}else{
	    me.kv1.setValue('copy');
	}
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

	me.snapshotsel = Ext.create('PVE.form.SnapshotSelector', {
		name: 'snapname',
		fieldLabel: 'Snapshot',
                nodename: me.nodename,
                vmid: me.vmid,
                disabled: false,
                hidden: me.istemplate ? true : false,
		allowBlank: false,
		value : me.snapname,
		listeners: {
		    change: function(f, value) {

			var clonefeature;
			var snapname = value;
			//check if linked clone feature is available
			    var params = { feature: 'clone' };
			    if (value !== 'current') {
				params.snapname = snapname;
			    }

			    PVE.Utils.API2Request({
				waitMsgTarget: me,
				url: '/nodes/' + me.nodename + '/qemu/' + me.vmid + '/feature',
				params: params,
				method: 'GET',
				success: function(response, options) {
				    var res = response.result.data;

				    if (res === 1) {
					clonefeature = 1;
				    }
				    me.compute_sel1(clonefeature, me.istemplate, snapname);
				}
			    });
		    }
		}
	});

	var items = [];

	items.push(me.snapshotsel);

	items.push(
	    {
                xtype: 'pveVMIDSelector',
                name: 'newvmid',
                value: '',
                loadNextFreeVMID: true,
                validateExists: false
            },
	    {
		xtype: 'textfield',
		name: 'name',
		allowBlank: false,
		fieldLabel: 'Name'
	    }
	);

        me.hdstoragesel = Ext.create('PVE.form.StorageSelector', {
                name: 'hdstorage',
                nodename: me.nodename,
                fieldLabel: 'Target Storage',
                storageContent: 'images',
                autoSelect: me.insideWizard,
                allowBlank: true,
                disabled: true,
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
                                   rec.data.type === 'nexenta'
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

        me.kv1 = Ext.create('PVE.form.KVComboBox', {
            fieldLabel: 'Clone Mode',
            name: 'clonemode',
            allowBlank: false,
            data: []
        });

        me.mon(me.kv1, 'change', function(t, value) {
	    if (value === 'copy') {
		me.hdstoragesel.setDisabled(false);
	    }else{
		me.hdstoragesel.setDisabled(true);
		me.formatsel.setDisabled(true);
	    }
        });


	items.push(me.kv1);
	items.push(me.hdstoragesel);
	items.push(me.formatsel);

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

	var titletext = me.istemplate ? "Template" : "VM";
	me.title = "Clone " + titletext + " " + me.vmid;
	submitBtn = Ext.create('Ext.Button', {
	    text: gettext('Clone'),
	    handler: function() {
		if (form.isValid()) {
		    var values = form.getValues();
		    me.create_clone(values.snapname, values.name, values.newvmid, values.clonemode, values.hdstorage, values.diskformat, diskarray);
		}
	    }
	});


	Ext.apply(me, {
	    modal: true,
	    width: 350,
	    height: 250,
	    border: false,
	    layout: 'fit',
	    buttons: [ submitBtn ],
	    items: [ me.formPanel ]
	});


	me.callParent();

	if (!me.snapname) {
	    return;
	}

	me.compute_sel1(me.clonefeature, me.istemplate, me.snapname);

        var url;

        if (me.snapsname) {
	    url = '/nodes/' + me.nodename + '/qemu/' + me.vmid + "/snapshot/" + me.snapname + '/config';
        } else {
	    url = '/nodes/' + me.nodename + '/qemu/' + me.vmid + '/config';
        }


	PVE.Utils.API2Request({
	    url: url,
	    waitMsgTarget: me,
	    method: 'GET',
	    failure: function(response, opts) {
		Ext.Msg.alert('Error', response.htmlStatus);
		me.close();
	    },
	    success: function(response, options) {
		var data = response.result.data;
		Ext.Object.each(data, function(key, value) {

		    var drive = PVE.Parser.parseQemuDrive(key, value);
		    if (drive) {
			var match = drive.file.match(/^([^:]+):/);
			if (match) {
			diskarray.push(key);
			}
		    }
		});
	    }
	});
    }
});
