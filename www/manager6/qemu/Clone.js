Ext.define('PVE.window.Clone', {
    extend: 'Ext.window.Window',

    resizable: false,

    isTemplate: false,

    onlineHelp: 'qm_copy_and_clone',

    controller: {
	xclass: 'Ext.app.ViewController',
	control: {
	    'panel[reference=cloneform]': {
		validitychange: 'disableSubmit'
	    }
	},
	disableSubmit: function(form) {
	    this.lookupReference('submitBtn').setDisabled(!form.isValid());
	}
    },

    statics: {
	// display a snapshot selector only if needed
	wrap: function(nodename, vmid, isTemplate) {
	    PVE.Utils.API2Request({
		url: '/nodes/' + nodename + '/qemu/' + vmid +'/snapshot',
		failure: function(response, opts) {
		    Ext.Msg.alert('Error', response.htmlStatus);
		},
		success: function(response, opts) {
		    var snapshotList = response.result.data;
		    var hasSnapshots = snapshotList.length === 1 &&
			snapshotList[0].name === 'current' ? false : true;

		    Ext.create('PVE.window.Clone', {
			nodename: nodename,
			vmid: vmid,
			isTemplate: isTemplate,
			hasSnapshots: hasSnapshots
		    }).show();
		}
	    });
	}
    },

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
	    if (values.hdstorage) {
		params.storage = values.hdstorage;
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

    // disable the Storage selector when clone mode is linked clone
    updateVisibility: function() {
	var me = this;
	var clonemode = me.lookupReference('clonemodesel').getValue();
	var disksel = me.lookup('diskselector');
	disksel.setDisabled(clonemode === 'clone');
    },

    // add to the list of valid nodes each node where
    // all the VM disks are available
    verifyFeature: function() {
	var me = this;

	var snapname = me.lookupReference('snapshotsel').getValue();
	var clonemode = me.lookupReference('clonemodesel').getValue();

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
		me.lookupReference('submitBtn').setDisabled(true);
		Ext.Msg.alert('Error', response.htmlStatus);
	    },
	    success: function(response, options) {
		var res = response.result.data;

		me.lookupReference('targetsel').allowedNodes = res.nodes;
		me.lookupReference('targetsel').validate();
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

	var titletext = me.isTemplate ? "Template" : "VM";
	me.title = "Clone " + titletext + " " + me.vmid;

	var col1 = [];
	var col2 = [];

	col1.push({
	    xtype: 'pveNodeSelector',
	    name: 'target',
	    reference: 'targetsel',
	    fieldLabel: gettext('Target node'),
	    selectCurNode: true,
	    allowBlank: false,
	    onlineValidator: true,
	    listeners: {
		change: function(f, value) {
		    me.lookupReference('hdstorage').setTargetNode(value);
		}
	    }
	});

	var modelist = [['copy', gettext('Full Clone')]];
	if (me.isTemplate) {
	    modelist.push(['clone', gettext('Linked Clone')]);
	}

	col1.push({
	    xtype: 'pveGuestIDSelector',
	    name: 'newvmid',
	    guestType: 'qemu',
	    value: '',
	    loadNextFreeID: true,
	    validateExists: false
	},
	{
	    xtype: 'textfield',
	    name: 'name',
	    allowBlank: true,
	    fieldLabel: gettext('Name')
	},
	{
	    xtype: 'pvePoolSelector',
	    fieldLabel: gettext('Resource Pool'),
	    name: 'pool',
	    value: '',
	    allowBlank: true
	}
	);

	col2.push({
	    xtype: 'pveKVComboBox',
	    fieldLabel: gettext('Mode'),
	    name: 'clonemode',
	    reference: 'clonemodesel',
	    allowBlank: false,
	    hidden: !me.isTemplate,
	    value: me.isTemplate ? 'clone' : 'copy',
		    comboItems: modelist,
		    listeners: {
			change: function(t, value) {
			    me.updateVisibility();
			    me.verifyFeature();
			}
		    }
	},
	{
	    xtype: 'PVE.form.SnapshotSelector',
	    name: 'snapname',
	    reference: 'snapshotsel',
	    fieldLabel: gettext('Snapshot'),
	    nodename: me.nodename,
	    vmid: me.vmid,
	    hidden: me.isTemplate || !me.hasSnapshots ? true : false,
	    disabled: false,
	    allowBlank: false,
	    value : me.snapname,
	    listeners: {
		change: function(f, value) {
		    me.verifyFeature();
		}
	    }
	},
	{
	    xtype: 'pveDiskStorageSelector',
	    reference: 'diskselector',
	    nodename: me.nodename,
	    autoSelect: false,
	    hideSize: true,
	    hideSelection: true,
	    storageLabel: gettext('Target Storage'),
	    allowBlank: true,
	    storageContent: 'images',
	    emptyText: gettext('Same as source'),
	    disabled: me.isTemplate ? true : false // because default mode is clone for templates
	});

	var formPanel = Ext.create('Ext.form.Panel', {
	    bodyPadding: 10,
	    reference: 'cloneform',
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

	Ext.apply(me, {
	    modal: true,
	    width: 600,
	    height: 250,
	    border: false,
	    layout: 'fit',
	    buttons: [ {
		xtype: 'pveHelpButton',
		listenToGlobalEvent: false,
		hidden: false,
		onlineHelp: me.onlineHelp
	    },
	    '->',
	    {
		reference: 'submitBtn',
		text: gettext('Clone'),
		disabled: true,
		handler: function() {
		    var cloneForm = me.lookupReference('cloneform');
		    if (cloneForm.isValid()) {
			me.create_clone(cloneForm.getValues());
		    }
		}
	    } ],
	    items: [ formPanel ]
	});

	me.callParent();

	me.verifyFeature();
    }
});
