Ext.define('PVE.window.Backup', {
    extend: 'Ext.window.Window',

    resizable: false,

    initComponent: function() {
	var me = this;

	if (!me.nodename) {
	    throw "no node name specified";
	}

	if (!me.vmid) {
	    throw "no VM ID specified";
	}

	if (!me.vmtype) {
	    throw "no VM type specified";
	}

	let compressionSelector = Ext.create('PVE.form.CompressionSelector', {
	    name: 'compress',
	    value: 'zstd',
	    fieldLabel: gettext('Compression'),
	});

	let modeSelector = Ext.create('PVE.form.BackupModeSelector', {
	    fieldLabel: gettext('Mode'),
	    value: 'snapshot',
	    name: 'mode',
	});

	let mailtoField = Ext.create('Ext.form.field.Text', {
	    fieldLabel: gettext('Send email to'),
	    name: 'mailto',
	    emptyText: Proxmox.Utils.noneText,
	});

	let initialDefaults = false;

	var storagesel = Ext.create('PVE.form.StorageSelector', {
	    nodename: me.nodename,
	    name: 'storage',
	    fieldLabel: gettext('Storage'),
	    storageContent: 'backup',
	    allowBlank: false,
	    listeners: {
		change: function(f, v) {
		    if (!initialDefaults) {
			me.setLoading(false);
		    }

		    if (v === null || v === undefined || v === '') {
			return;
		    }

		    let store = f.getStore();
		    let rec = store.findRecord('storage', v, 0, false, true, true);

		    if (rec && rec.data && rec.data.type === 'pbs') {
			compressionSelector.setValue('zstd');
			compressionSelector.setDisabled(true);
		    } else if (!compressionSelector.getEditable()) {
			compressionSelector.setDisabled(false);
		    }

		    Proxmox.Utils.API2Request({
			url: `/nodes/${me.nodename}/vzdump/defaults`,
			method: 'GET',
			params: {
			    storage: v,
			},
			waitMsgTarget: me,
			success: function(response, opts) {
			    const data = response.result.data;

			    if (!initialDefaults && data.mailto !== undefined) {
				mailtoField.setValue(data.mailto);
			    }
			    if (!initialDefaults && data.mode !== undefined) {
				modeSelector.setValue(data.mode);
			    }

			    initialDefaults = true;
			},
			failure: function(response, opts) {
			    initialDefaults = true;
			    Ext.Msg.alert(gettext('Error'), response.htmlStatus);
			},
		    });
		},
	    },
	});

	me.formPanel = Ext.create('Ext.form.Panel', {
	    bodyPadding: 10,
	    border: false,
	    fieldDefaults: {
		labelWidth: 100,
		anchor: '100%',
	    },
	    items: [
		storagesel,
		modeSelector,
		compressionSelector,
		mailtoField,
	    ],
	});

	var form = me.formPanel.getForm();

	var submitBtn = Ext.create('Ext.Button', {
	    text: gettext('Backup'),
	    handler: function() {
		var storage = storagesel.getValue();
		var values = form.getValues();
		var params = {
		    storage: storage,
		    vmid: me.vmid,
		    mode: values.mode,
		    remove: 0,
		};

		if (values.mailto) {
		    params.mailto = values.mailto;
		}

		if (values.compress) {
		    params.compress = values.compress;
		}

		Proxmox.Utils.API2Request({
		    url: '/nodes/' + me.nodename + '/vzdump',
		    params: params,
		    method: 'POST',
		    failure: function(response, opts) {
			Ext.Msg.alert('Error', response.htmlStatus);
		    },
		    success: function(response, options) {
			// close later so we reload the grid
			// after the task has completed
			me.hide();

			var upid = response.result.data;

			var win = Ext.create('Proxmox.window.TaskViewer', {
			    upid: upid,
			    listeners: {
				close: function() {
				    me.close();
				},
			    },
			});
			win.show();
		    },
		});
	    },
	});

	var helpBtn = Ext.create('Proxmox.button.Help', {
	    onlineHelp: 'chapter_vzdump',
	    listenToGlobalEvent: false,
	    hidden: false,
	});

	var title = gettext('Backup') + " " +
	    (me.vmtype === 'lxc' ? "CT" : "VM") +
	    " " + me.vmid;

	Ext.apply(me, {
	    title: title,
	    width: 350,
	    modal: true,
	    layout: 'auto',
	    border: false,
	    items: [me.formPanel],
	    buttons: [helpBtn, '->', submitBtn],
	    listeners: {
		afterrender: function() {
		    /// cleared within the storage selector's change listener
		    me.setLoading(gettext('Please wait...'));
		    storagesel.setValue(me.storage);
		},
	    },
	});

	me.callParent();
    },
});
