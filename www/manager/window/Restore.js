Ext.define('PVE.window.Restore', {
    extend: 'Ext.window.Window', // fixme: PVE.window.Edit?

    resizable: false,

    initComponent : function() {
	var me = this;

	if (!me.nodename) {
	    throw "no node name specified";
	}

	if (!me.volid) {
	    throw "no volume ID specified";
	}

	if (!me.vmtype) {
	    throw "no vmtype specified";
	}

	var storagesel = Ext.create('PVE.form.StorageSelector', {
	    nodename: me.nodename,
	    name: 'storage',
	    value: '',
	    fieldLabel: 'Storage',
	    storageContent: (me.vmtype === 'openvz') ? 'rootdir' : 'images',
	    allowBlank: true
	});

	me.formPanel = Ext.create('Ext.form.Panel', {
	    bodyPadding: 10,
	    border: false,
	    fieldDefaults: {
		labelWidth: 60,
		anchor: '100%'
	    },
	    items: [
		{
		    xtype: 'displayfield',
		    value: me.volidText || me.volid,
		    fieldLabel: 'Source'
		},
		storagesel,
		{
		    xtype: me.vmid ? 'displayfield' : 'pveVMIDSelector',
		    name: 'vmid',
		    fieldLabel: 'VM ID',
		    value: me.vmid || PVE.data.ResourceStore.findNextVMID(),
		    validateExists: false
		}
	    ]
	});

	var form = me.formPanel.getForm();

	var doRestore = function(url, params) {
	    PVE.Utils.API2Request({
		url: url,
		params: params,
		method: 'POST',
		failure: function (response, opts) {
		    Ext.Msg.alert('Error', response.htmlStatus);
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
	};

	var submitBtn = Ext.create('Ext.Button', {
	    text: 'Restore',
	    handler: function(){
		var storage = storagesel.getValue();
		var values = form.getValues();

		var params = {
		    storage: storage,
		    vmid: me.vmid || values.vmid,
		    force: me.vmid ? 1 : 0
		};

		var url;
		if (me.vmtype === 'openvz') {
		    url = '/nodes/' + me.nodename + '/openvz';
		    params.ostemplate = me.volid;
		    params.restore = 1;
		} else if (me.vmtype === 'qemu') {
		    url = '/nodes/' + me.nodename + '/qemu';
		    params.archive = me.volid;
		} else {
		    throw 'unknown VM type';
		}

		if (me.vmid) {
		    var msg = 'Are you sure you want to restore this VM"? ' +
			'This will permanently erase current VM data.';
		    Ext.Msg.confirm('Confirmation', msg, function(btn) {
			if (btn !== 'yes') {
			    return;
			}
			doRestore(url, params);
		    });
		} else {
		    doRestore(url, params);
		}
	    }
	});

	form.on('validitychange', function(f, valid) {
	    submitBtn.setDisabled(!valid);
	});

	var title = (me.vmtype === 'openvz') ? "Restore CT" : "Restore VM";

	Ext.apply(me, {
	    title: title,
	    width: 450,
	    modal: true,
	    layout: 'auto',
	    border: false,
	    items: [ me.formPanel ],
	    buttons: [ submitBtn ]
	});

	me.callParent();
    }
});
