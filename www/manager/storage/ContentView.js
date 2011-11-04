Ext.define('PVE.storage.Upload', {
    extend: 'Ext.window.Window',
    alias: ['widget.pveStorageUpload'],

    resizable: false,

    modal: true,

    initComponent : function() {
        var me = this;

	var xhr;

	if (!me.nodename) {
	    throw "no node name specified";
	}

	if (!me.storage) { 
	    throw "no storage ID specified";
	}

	var baseurl = "/nodes/" + me.nodename + "/storage/" + me.storage + "/upload";

	var pbar = Ext.create('Ext.ProgressBar', {
            text: 'Ready',
	    hidden: true
 	});

	me.formPanel = Ext.create('Ext.form.Panel', {
	    method: 'POST',
	    waitMsgTarget: true,
	    bodyPadding: 10,
	    border: false,
	    width: 300,
	    fieldDefaults: {
		labelWidth: 100,
		anchor: '100%'
            },
	    items: [
		{
		    xtype: 'pveKVComboBox',
		    data: [
			['iso', 'ISO image'],
			['backup', 'VZDump backup file'],
			['vztmpl', 'OpenVZ template']
		    ],
		    fieldLabel: 'Content type',
		    name: 'content',
		    value: 'iso'
		},
		{
		    xtype: 'filefield',
		    name: 'filename',
		    filedLabel: 'File',
		    buttonText: 'Select File...',
		    allowBlank: false
		},
		pbar
	    ]
	});

	var form = me.formPanel.getForm();

	var doStandardSubmit = function() {
	    form.submit({
		url: "/api2/htmljs" + baseurl,
		waitMsg: 'Uploading file...',
		success: function(f, action) {
		    me.close();
		},
		failure: function(f, action) {
		    var msg = PVE.Utils.extractFormActionError(action);
                    Ext.Msg.alert('Failed', msg);
		}
	    });
	};

	var updateProgress = function(per, bytes) {
	    var text = (per * 100).toFixed(2) + '%';
	    if (bytes) {
		text += " (" + PVE.Utils.format_size(bytes) + ')';
	    }
	    pbar.updateProgress(per, text);
	};
 
	var abortBtn = Ext.create('Ext.Button', {
	    text: 'Abort',
	    disabled: true,
	    handler: function() {
		me.close();
	    }
	});

	var submitBtn = Ext.create('Ext.Button', {
	    text: 'Upload',
	    disabled: true,
	    handler: function(button) {
		try {
		    var fd = new FormData();
		} catch (err) {
		    doStandardSubmit();
		    return;
		}

		button.setDisabled(true);
		abortBtn.setDisabled(false);

		var field = form.findField('content');
		fd.append("content", field.getValue());
		field.setDisabled(true);

		var field = form.findField('filename');
		var file = field.fileInputEl.dom;
		fd.append("filename", file.files[0]);
		field.setDisabled(true);

		pbar.setVisible(true);
		updateProgress(0);

		xhr = new XMLHttpRequest();

		xhr.addEventListener("load", function(e) {   
		    if (xhr.status == 200) {
			me.close();
		    } else {  
			var msg = "Error " + xhr.status + ": " + Ext.htmlEncode(xhr.statusText);
			Ext.Msg.alert('Upload failed', msg, function(btn) {
			    me.close();
			});

		    }  
		}, false);

		xhr.addEventListener("error", function(e) {  
		    var msg = "Error " + e.target.status + " occurred while receiving the document.";  
		    Ext.Msg.alert('Upload failed', msg, function(btn) {
			me.close();
		    });
		});
 
		xhr.upload.addEventListener("progress", function(evt) {
		    if (evt.lengthComputable) {  
			var percentComplete = evt.loaded / evt.total;  
			updateProgress(percentComplete, evt.loaded);
		    } 
		}, false);

		xhr.open("POST", "/api2/json" + baseurl, true);
		xhr.send(fd);		
	    }
	});

	form.on('validitychange', function(f, valid) {
	    submitBtn.setDisabled(!valid);
	});

        Ext.applyIf(me, {
            title: 'Upload',
 	    items: me.formPanel,
	    buttons: [ abortBtn, submitBtn ],
	    listeners: {
		close: function() {
		    if (xhr) {
			xhr.abort();
		    }
		}
	    }
	});

        me.callParent();
    }
});

Ext.define('PVE.storage.ContentView', {
    extend: 'Ext.grid.GridPanel',

    alias: ['widget.pveStorageContentView'],

    initComponent : function() {
	var me = this;

	var nodename = me.pveSelNode.data.node;
	if (!nodename) {
	    throw "no node name specified";
	}

	var storage = me.pveSelNode.data.storage;
	if (!storage) { 
	    throw "no storage ID specified";
	}

	var baseurl = "/nodes/" + nodename + "/storage/" + storage + "/content";
	var store = new Ext.data.Store({
	    model: 'pve-storage-content',
	    groupField: 'content',
	    proxy: {
                type: 'pve',
		url: '/api2/json' + baseurl,
	    },
	    sorters: { 
		property: 'volid', 
		order: 'DESC' 
	    }
	});

	var sm = Ext.create('Ext.selection.RowModel', {});

	var groupingFeature = Ext.create('Ext.grid.feature.Grouping',{
            groupHeaderTpl: 'ContentType: {name} ({rows.length} Item{[values.rows.length > 1 ? "s" : ""]})'
	});

	var reload = function() {
	    store.load();
	};

 	Ext.apply(me, {
	    store: store,
	    selModel: sm,
	    stateful: false,
	    viewConfig: {
		trackOver: false
	    },
	    features: [ groupingFeature ],
	    tbar: [
		{
		    text: 'Restore'
		},
		{
		    xtype: 'pveButton',
		    text: 'Delete',
		    selModel: sm,
		    disabled: true,
		    confirmMsg: function(rec) {
			return 'Are you sure you want to delete volume "' + rec.data.volid + '"';
		    },
		    enableFn: function(rec) {
			return rec && rec.data.content !== 'images';
		    },
		    handler: function(b, e, rec) {
			PVE.Utils.API2Request({
			    url: baseurl + '/' + rec.data.volid,
			    method: 'DELETE',
			    waitMsgTarget: me,
			    callback: function() {
				reload();
			    },
			    failure: function (response, opts) {
				Ext.Msg.alert('Error', response.htmlStatus);
			    }
			});
		    }
		},
		{
		    text: 'Upload',
		    handler: function() {
			var win = Ext.create('PVE.storage.Upload', {
			    nodename: nodename,
			    storage: storage
			});
			win.show();
			win.on('destroy', reload);
		    }
		}
	    ],
	    columns: [
		{
		    header: 'Name',
		    flex: 1,
		    sortable: true,
		    renderer: PVE.Utils.render_storage_content,
		    dataIndex: 'volid'
		},
		{
		    header: 'Format',
		    width: 100,
		    dataIndex: 'format'
		},
		{
		    header: 'Size',
		    width: 100,
		    renderer: PVE.Utils.format_size,
		    dataIndex: 'size'
		}
	    ],
	    listeners: {
		show: reload
	    }
	});

	me.callParent();
    }
}, function() {

    Ext.define('pve-storage-content', {
	extend: 'Ext.data.Model',
	fields: [ 
	    'volid', 'content', 'format', 'size', 'used', 'vmid', 
	    'channel', 'id', 'lun'
	],
	idProperty: 'volid'
    });

});