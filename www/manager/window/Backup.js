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
	    fieldLabel: 'Storage',
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
		    fieldLabel: 'Mode',
		    value: 'snapshot',
		    name: 'mode'
		},
		{
		    xtype: 'pveCompressionSelector',
		    name: 'compress',
		    value: 'lzo',
		    fieldLabel: 'Compress'
		}
	    ]
	});

	var form = me.formPanel.getForm();

	var submitBtn = Ext.create('Ext.Button', {
	    text: 'Backup',
	    handler: function(){
		var storage = storagesel.getValue();
		var values = form.getValues();
		var params = {
			storage: storage,
			vmid: me.vmid,
			mode: values.mode
		};
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
			var upid = response.result.data;
			
			var win = Ext.create('PVE.window.TaskViewer', { 
			    upid: upid
			});
			win.show();
			me.close();
		    }
		});
	    }
	});

	var title = (me.vmtype === 'openvz') ? 
	    "Backup CT " + me.vmid :
	    "Backup VM " + me.vmid;

	Ext.apply(me, {
	    title: title,
	    width: 350,
	    modal: true,
	    layout: 'auto',
	    border: false,
	    items: [ me.formPanel ],
	    buttons: [ submitBtn ]
	});

	me.callParent();
    }
});
