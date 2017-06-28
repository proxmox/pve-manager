Ext.define('PVE.window.Backup', {
    extend: 'Ext.window.Window',

    resizable: false,

    initComponent : function() {
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

	var storagesel = Ext.create('PVE.form.StorageSelector', {
	    nodename: me.nodename,
	    name: 'storage',
	    value: me.storage,
	    fieldLabel: gettext('Storage'),
	    storageContent: 'backup',
	    allowBlank: false
	});

	me.formPanel = Ext.create('Ext.form.Panel', {
	    bodyPadding: 10,
	    border: false,
	    fieldDefaults: {
		labelWidth: 100,
		anchor: '100%'
	    },
	    items: [
		storagesel,
		{
		    xtype: 'pveBackupModeSelector',
		    fieldLabel: gettext('Mode'),
		    value: 'snapshot',
		    name: 'mode'
		},
		{
		    xtype: 'pveCompressionSelector',
		    name: 'compress',
		    value: 'lzo',
		    fieldLabel: gettext('Compression')
		},
		{
		    xtype: 'textfield',
		    fieldLabel: gettext('Send email to'),
		    name: 'mailto',
		    emptyText: PVE.Utils.noneText
		}
	    ]
	});

	var form = me.formPanel.getForm();

	var submitBtn = Ext.create('Ext.Button', {
	    text: gettext('Backup'),
	    handler: function(){
		var storage = storagesel.getValue();
		var values = form.getValues();
		var params = {
		    storage: storage,
		    vmid: me.vmid,
		    mode: values.mode,
		    remove: 0
		};

		if ( values.mailto ) {
		    params.mailto = values.mailto;
		}

		if (values.compress) {
		    params.compress = values.compress;
		}

		PVE.Utils.API2Request({
		    url: '/nodes/' + me.nodename + '/vzdump',
		    params: params,
		    method: 'POST',
		    failure: function (response, opts) {
			Ext.Msg.alert('Error',response.htmlStatus);
		    },
		    success: function(response, options) {
			// close later so we reload the grid
			// after the task has completed
			me.hide();

			var upid = response.result.data;
			
			var win = Ext.create('PVE.window.TaskViewer', { 
			    upid: upid,
			    listeners: {
				close: function() {
				    me.close();
				}
			    }
			});
			win.show();
		    }
		});
	    }
	});

	var helpBtn = Ext.create('PVE.button.Help', {
	    onlineHelp: 'chapter_vzdump',
	    listenToGlobalEvent: false,
	    hidden: false
	});

	var title = gettext('Backup') + " " + 
	    ((me.vmtype === 'lxc') ? "CT" : "VM") +
	    " " + me.vmid;

	Ext.apply(me, {
	    title: title,
	    width: 350,
	    modal: true,
	    layout: 'auto',
	    border: false,
	    items: [ me.formPanel ],
	    buttons: [ helpBtn, '->', submitBtn ]
	});

	me.callParent();
    }
});
