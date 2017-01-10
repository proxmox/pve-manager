Ext.define('PVE.grid.TemplateSelector', {
    extend: 'Ext.grid.GridPanel',

    alias: 'widget.pveTemplateSelector',

    stateful: true,
    stateId: 'grid-template-selector',
    viewConfig: {
	trackOver: false
    },
    initComponent : function() {
	var me = this;

	if (!me.nodename) {
	    throw "no node name specified";
	}

	var baseurl = "/nodes/" + me.nodename + "/aplinfo";
	var store = new Ext.data.Store({
	    model: 'pve-aplinfo',
	    groupField: 'section',
	    proxy: {
                type: 'pve',
		url: '/api2/json' + baseurl
	    }
	});

	var sm = Ext.create('Ext.selection.RowModel', {});

	var groupingFeature = Ext.create('Ext.grid.feature.Grouping',{
            groupHeaderTpl: '{[ "Section: " + values.name ]} ({rows.length} Item{[values.rows.length > 1 ? "s" : ""]})'
	});

	var reload = function() {
	    store.load();
	};

	PVE.Utils.monStoreErrors(me, store);

	Ext.apply(me, {
	    store: store,
	    selModel: sm,
	    features: [ groupingFeature ],
	    columns: [
		{
		    header: gettext('Type'),
		    width: 80,
		    dataIndex: 'type'
		},
		{
		    header: gettext('Package'),
		    flex: 1,
		    dataIndex: 'package'
		},
		{
		    header: gettext('Version'),
		    width: 80,
		    dataIndex: 'version'
		},
		{
		    header: gettext('Description'),
		    flex: 1.5,
		    renderer: Ext.String.htmlEncode,
		    dataIndex: 'headline'
		}
	    ],
	    listeners: {
		afterRender: reload
	    }
	});

	me.callParent();
    }

}, function() {

    Ext.define('pve-aplinfo', {
	extend: 'Ext.data.Model',
	fields: [
	    'template', 'type', 'package', 'version', 'headline', 'infopage',
	    'description', 'os', 'section'
	],
	idProperty: 'template'
    });

});

Ext.define('PVE.storage.TemplateDownload', {
    extend: 'Ext.window.Window',
    alias: 'widget.pveTemplateDownload',

    modal: true,
    title: gettext('Templates'),
    layout: 'fit',
    width: 600,
    height: 400,
    initComponent : function() {
	/*jslint confusion: true */
        var me = this;

	var grid = Ext.create('PVE.grid.TemplateSelector', {
	    border: false,
	    scrollable: true,
	    nodename: me.nodename
	});

	var sm = grid.getSelectionModel();

	var submitBtn = Ext.create('PVE.button.Button', {
	    text: gettext('Download'),
	    disabled: true,
	    selModel: sm,
	    handler: function(button, event, rec) {
		PVE.Utils.API2Request({
		    url: '/nodes/' + me.nodename + '/aplinfo',
		    params: {
			storage: me.storage,
			template: rec.data.template
		    },
		    method: 'POST',
		    failure: function (response, opts) {
			Ext.Msg.alert(gettext('Error'), response.htmlStatus);
		    },
		    success: function(response, options) {
			var upid = response.result.data;

			Ext.create('PVE.window.TaskViewer', {
			    upid: upid,
			    listeners: {
				destroy: me.reloadGrid
			    }
			}).show();

			me.close();
		    }
		});
	    }
	});

        Ext.apply(me, {
	    items: grid,
	    buttons: [ submitBtn ]
	});

	me.callParent();
    }
});

Ext.define('PVE.storage.Upload', {
    extend: 'Ext.window.Window',
    alias: 'widget.pveStorageUpload',

    resizable: false,

    modal: true,

    initComponent : function() {
	/*jslint confusion: true */
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
		    xtype: 'pveContentTypeSelector',
		    cts: me.contents,
		    fieldLabel: gettext('Content'),
		    name: 'content',
		    value: me.contents[0] || '',
		    allowBlank: false
		},
		{
		    xtype: 'filefield',
		    name: 'filename',
		    buttonText: gettext('Select File...'),
		    allowBlank: false
		},
		pbar
	    ]
	});

	var form = me.formPanel.getForm();

	var doStandardSubmit = function() {
	    form.submit({
		url: "/api2/htmljs" + baseurl,
		waitMsg: gettext('Uploading file...'),
		success: function(f, action) {
		    me.close();
		},
		failure: function(f, action) {
		    var msg = PVE.Utils.extractFormActionError(action);
                    Ext.Msg.alert(gettext('Error'), msg);
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
	    text: gettext('Abort'),
	    disabled: true,
	    handler: function() {
		me.close();
	    }
	});

	var submitBtn = Ext.create('Ext.Button', {
	    text: gettext('Upload'),
	    disabled: true,
	    handler: function(button) {
		var fd;
		try {
		    fd = new FormData();
		} catch (err) {
		    doStandardSubmit();
		    return;
		}

		button.setDisabled(true);
		abortBtn.setDisabled(false);

		var field = form.findField('content');
		fd.append("content", field.getValue());
		field.setDisabled(true);

		field = form.findField('filename');
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
			var msg = gettext('Error') + " " + xhr.status.toString() + ": " + Ext.htmlEncode(xhr.statusText);
			var result = Ext.decode(xhr.responseText);
			result.message = msg;
			var htmlStatus = PVE.Utils.extractRequestError(result, true);
			Ext.Msg.alert(gettext('Error'), htmlStatus, function(btn) {
			    me.close();
			});

		    }
		}, false);

		xhr.addEventListener("error", function(e) {
		    var msg = "Error " + e.target.status.toString() + " occurred while receiving the document.";
		    Ext.Msg.alert(gettext('Error'), msg, function(btn) {
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

        Ext.apply(me, {
            title: gettext('Upload'),
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

    alias: 'widget.pveStorageContentView',

    stateful: true,
    stateId: 'grid-storage-content',
    viewConfig: {
	trackOver: false,
	loadMask: false
    },
    features: [
	{
	    ftype: 'grouping',
	    groupHeaderTpl: '{name} ({rows.length} Item{[values.rows.length > 1 ? "s" : ""]})'
	}
    ],
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
	var store = Ext.create('Ext.data.Store',{
	    model: 'pve-storage-content',
	    groupField: 'content',
	    proxy: {
                type: 'pve',
		url: '/api2/json' + baseurl
	    },
	    sorters: {
		property: 'volid',
		order: 'DESC'
	    }
	});

	var sm = Ext.create('Ext.selection.RowModel', {});

	var reload = function() {
	    store.load();
	    me.statusStore.load();
	};

	PVE.Utils.monStoreErrors(me, store);

	var templateButton = Ext.create('PVE.button.Button',{
	    itemId: 'tmpl-btn',
	    text: gettext('Templates'),
	    handler: function() {
		var win = Ext.create('PVE.storage.TemplateDownload', {
		    nodename: nodename,
		    storage: storage,
		    reloadGrid: reload
		});
		win.show();
	    }
	});

	var uploadButton = Ext.create('PVE.button.Button', {
	    contents : ['iso','vztmpl'],
	    text: gettext('Upload'),
	    handler: function() {
		var me = this;
		var win = Ext.create('PVE.storage.Upload', {
		    nodename: nodename,
		    storage: storage,
		    contents: me.contents
		});
		win.show();
		win.on('destroy', reload);
	    }
	});

	me.statusStore = Ext.create('PVE.data.ObjectStore', {
	    url: '/api2/json/nodes/' + nodename + '/storage/' + storage + '/status'
	});

	Ext.apply(me, {
	    store: store,
	    selModel: sm,
	    tbar: [
		{
		    xtype: 'pveButton',
		    text: gettext('Restore'),
		    selModel: sm,
		    disabled: true,
		    enableFn: function(rec) {
			return rec && rec.data.content === 'backup';
		    },
		    handler: function(b, e, rec) {
			var vmtype;
			if (rec.data.volid.match(/vzdump-qemu-/)) {
			    vmtype = 'qemu';
			} else if (rec.data.volid.match(/vzdump-openvz-/) || rec.data.volid.match(/vzdump-lxc-/)) {
			    vmtype = 'lxc';
			} else {
			    return;
			}

			var win = Ext.create('PVE.window.Restore', {
			    nodename: nodename,
			    volid: rec.data.volid,
			    volidText: PVE.Utils.render_storage_content(rec.data.volid, {}, rec),
			    vmtype: vmtype
			});
			win.show();
			win.on('destroy', reload);
		    }
		},
		{
		    xtype: 'pveButton',
		    text: gettext('Remove'),
		    selModel: sm,
		    disabled: true,
		    confirmMsg: function(rec) {
			return Ext.String.format(gettext('Are you sure you want to remove entry {0}'),
						 "'" + rec.data.volid + "'");
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
				Ext.Msg.alert(gettext('Error'), response.htmlStatus);
			    }
			});
		    }
		},
		templateButton,
		uploadButton,
		{
		    xtype: 'pveButton',
		    text: gettext('Show Configuration'),
		    disabled: true,
		    selModel: sm,
		    enableFn: function(rec) {
			return rec && rec.data.content === 'backup';
		    },
		    handler: function(b,e,rec) {
			var win = Ext.create('PVE.window.BackupConfig', {
			    volume: rec.data.volid,
			    pveSelNode: me.pveSelNode
			});

			win.show();
		    }
		},
		'->',
		gettext('Search') + ':', ' ',
		{
		    xtype: 'textfield',
		    width: 200,
		    enableKeyEvents: true,
		    listeners: {
			buffer: 500,
			keyup: function(field) {
			    store.clearFilter(true);
			    store.filter([
				{
				    property: 'text',
				    value: field.getValue(),
				    anyMatch: true,
				    caseSensitive: false
				}
			    ]);
			}
		    }
		}
	    ],
	    columns: [
		{
		    header: gettext('Name'),
		    flex: 1,
		    sortable: true,
		    renderer: PVE.Utils.render_storage_content,
		    dataIndex: 'text'
		},
		{
		    header: gettext('Format'),
		    width: 100,
		    dataIndex: 'format'
		},
		{
		    header: gettext('Type'),
		    width: 100,
		    dataIndex: 'content',
		    renderer: PVE.Utils.format_content_types
		},
		{
		    header: gettext('Size'),
		    width: 100,
		    renderer: PVE.Utils.format_size,
		    dataIndex: 'size'
		}
	    ],
	    listeners: {
		activate: reload
	    }
	});

	me.callParent();

	// disable the buttons/restrict the upload window
	// if templates or uploads are not allowed
	me.mon(me.statusStore, 'load', function(s,records,succes) {
	    var availcontent = [];
	    Ext.Array.each(records, function(item){
		if (item.id === 'content') {
		    availcontent = item.data.value.split(',');
		}
	    });
	    var templ = false;
	    var upload = false;
	    var cts = [];

	    Ext.Array.each(availcontent, function(content) {
		if (content === 'vztmpl') {
		    templ = true;
		    cts.push('vztmpl');
		} else if (content === 'iso') {
		    upload = true;
		    cts.push('iso');
		}
	    });

	    if (templ !== upload) {
		uploadButton.contents = cts;
	    }

	    templateButton.setDisabled(!templ);
	    uploadButton.setDisabled(!upload && !templ);
	});
    }
}, function() {

    Ext.define('pve-storage-content', {
	extend: 'Ext.data.Model',
	fields: [
	    'volid', 'content', 'format', 'size', 'used', 'vmid',
	    'channel', 'id', 'lun',
	    {
		name: 'text',
		convert: function(value, record) {
		    // check for volid, because if you click on a grouping header,
		    // it calls convert (but with an empty volid)
		    if (value || record.data.volid === null) {
			return value;
		    }
		    return PVE.Utils.render_storage_content(value, {}, record);
		}
	    }
	],
	idProperty: 'volid'
    });

});
