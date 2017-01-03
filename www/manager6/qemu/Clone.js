Ext.define('PVE.window.Clone', {
    extend: 'Ext.window.Window',

    resizable: false,

    isTemplate: false,

    onlineHelp: 'qm_copy_and_clone',

    create_clone: function(values) {
	var me = this;

        var params = { newid: values.newvmid };

        if (values.snapname && values.snapname !== 'current') {
            params.snapname = values.snapname;
        }

	if (values.pool) {
	    params.pool = values.pool;
	}

	if (values.name) {
	    params.name = values.name;
	}

	if (values.target) {
	    params.target = values.target;
	}

	if (values.clonemode === 'copy') {
	    params.full = 1;
	    if (values.storage) {
		params.storage = values.storage;
		if (values.diskformat) {
		    params.format = values.diskformat;
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

    updateVisibility: function() {
	var me = this;

	var clonemode = me.kv1.getValue();
	var storage = me.hdstoragesel.getValue();
	var rec = me.hdstoragesel.store.getById(storage);

	me.hdstoragesel.setDisabled(clonemode === 'clone');

	if (!rec || clonemode === 'clone') {
            me.formatsel.setDisabled(true);
	    return;
	}

	if (rec.data.type === 'lvm' ||
	    rec.data.type === 'lvmthin' ||
            rec.data.type === 'rbd' ||
            rec.data.type === 'iscsi' ||
            rec.data.type === 'sheepdog' ||
	    rec.data.type === 'zfs' ||
	    rec.data.type === 'zfspool'
           ) {
            me.formatsel.setValue('raw');
            me.formatsel.setDisabled(true);
        } else {
            me.formatsel.setDisabled(false);
        }
    },

    verifyFeature: function() {
	var me = this;
		    
	var snapname = me.snapshotSel.getValue();
	var clonemode = me.kv1.getValue();

	var params = { feature: clonemode };
	if (snapname !== 'current') {
	    params.snapname = snapname;
	}

	PVE.Utils.API2Request({
	    waitMsgTarget: me,
	    url: '/nodes/' + me.nodename + '/qemu/' + me.vmid + '/feature',
	    params: params,
	    method: 'GET',
	    failure: function(response, opts) {
		me.submitBtn.setDisabled(false);
		Ext.Msg.alert('Error', response.htmlStatus);
	    },
	    success: function(response, options) {
                var res = response.result.data;
		me.submitBtn.setDisabled(res.hasFeature !== 1);

		me.targetSel.allowedNodes = res.nodes;
		me.targetSel.validate();
	    }
	});
    },

    initComponent : function() {
	var me = this;

	if (!me.nodename) {
	    throw "no node name specified";
	}

	if (!me.vmid) {
	    throw "no VM ID specified";
	}

	if (!me.snapname) {
	    me.snapname = 'current';
	}

	var col1 = [];
	var col2 = [];

	me.targetSel = Ext.create('PVE.form.NodeSelector', {
	    name: 'target',
	    fieldLabel: gettext('Target node'),
	    selectCurNode: true,
	    allowBlank: false,
	    onlineValidator: true
	});

	col1.push(me.targetSel);

	var modelist = [['copy', gettext('Full Clone')]];
	if (me.isTemplate) {
	    modelist.push(['clone', gettext('Linked Clone')]);
	}

        me.kv1 = Ext.create('PVE.form.KVComboBox', {
            fieldLabel: gettext('Mode'),
            name: 'clonemode',
            allowBlank: false,
	    value: me.isTemplate ? 'clone' : 'copy',
            comboItems: modelist
        });

        me.mon(me.kv1, 'change', function(t, value) {
	    me.updateVisibility();
	    me.verifyFeature();
        });

	col2.push(me.kv1);

	me.snapshotSel = Ext.create('PVE.form.SnapshotSelector', {
	    name: 'snapname',
	    fieldLabel: gettext('Snapshot'),
            nodename: me.nodename,
            vmid: me.vmid,
	    hidden: me.isTemplate ? true : false,
            disabled: false,
	    allowBlank: false,
	    value : me.snapname,
	    listeners: {
		change: function(f, value) {
		    me.verifyFeature();
		}
	    }
	});

	col2.push(me.snapshotSel);

	col1.push(
	    {
                xtype: 'pveGuestIDSelector',
                name: 'newvmid',
                guestType: 'qemu',
                value: '',
                loadNextGuestVMID: true,
                validateExists: false
            },
	    {
		xtype: 'textfield',
		name: 'name',
		allowBlank: true,
		fieldLabel: gettext('Name')
	    }
	);

        me.hdstoragesel = Ext.create('PVE.form.StorageSelector', {
                name: 'storage',
                nodename: me.nodename,
                fieldLabel: gettext('Target Storage'),
                storageContent: 'images',
                autoSelect: me.insideWizard,
                allowBlank: true,
                disabled: me.isTemplate ? true : false, // because default mode is clone for templates
                hidden: false,
                listeners: {
                    change: function(f, value) {
			me.updateVisibility();
                    }
                }

	});

	me.targetSel.on('change', function(f, value) {
	    me.hdstoragesel.setTargetNode(value);
	});

	me.formatsel = Ext.create('PVE.form.DiskFormatSelector', {
	    name: 'diskformat',
	    fieldLabel: gettext('Format'),
	    value: 'raw',
            disabled: true,
            hidden: false,
	    allowBlank: false
	});

	col2.push({
	    xtype: 'pvePoolSelector',
	    fieldLabel: gettext('Resource Pool'),
	    name: 'pool',
	    value: '',
	    allowBlank: true
	});

	col2.push(me.hdstoragesel);
	col2.push(me.formatsel);

	me.formPanel = Ext.create('Ext.form.Panel', {
	    bodyPadding: 10,
	    border: false,
	    layout: 'column',
	    defaultType: 'container',
	    columns: 2,
	    fieldDefaults: {
		labelWidth: 100,
		anchor: '100%'
	    },
	    items: [
		{
		    columnWidth: 0.5,
		    padding: '0 10 0 0',
		    layout: 'anchor',
		    items: col1
		},
		{
		    columnWidth: 0.5,
		    padding: '0 0 0 10',
		    layout: 'anchor',
		    items: col2
		}
	    ]
	});

	var form = me.formPanel.getForm();

	var titletext = me.isTemplate ? "Template" : "VM";
	me.title = "Clone " + titletext + " " + me.vmid;
	
	me.submitBtn = Ext.create('Ext.Button', {
	    text: gettext('Clone'),
	    disabled: true,
	    handler: function() {
		if (form.isValid()) {
		    var values = form.getValues();
		    me.create_clone(values);
		}
	    }
	});

	var helpButton = Ext.create('PVE.button.Help', {
	    listenToGlobalEvent: false,
	    hidden: false,
	    onlineHelp: me.onlineHelp});

	Ext.apply(me, {
	    modal: true,
	    width: 600,
	    height: 250,
	    border: false,
	    layout: 'fit',
	    buttons: [ helpButton, '->', me.submitBtn ],
	    items: [ me.formPanel ]
	});

	me.callParent();

	me.verifyFeature();
    }
});
