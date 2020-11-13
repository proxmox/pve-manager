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
                type: 'proxmox',
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

	Proxmox.Utils.monStoreErrors(me, store);

	Ext.apply(me, {
	    store: store,
	    selModel: sm,
	    tbar: [
		'->',
		gettext('Search'),
		{
		    xtype: 'textfield',
		    width: 200,
		    enableKeyEvents: true,
		    listeners: {
			buffer: 500,
			keyup: function(field) {
			    var value = field.getValue().toLowerCase();
			    store.clearFilter(true);
			    store.filterBy(function(rec) {
				return (rec.data['package'].toLowerCase().indexOf(value) !== -1)
				|| (rec.data.headline.toLowerCase().indexOf(value) !== -1);
			    });
			}
		    }
		}
	    ],
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
    width: 900,
    height: 600,
    initComponent : function() {
        var me = this;

	var grid = Ext.create('PVE.grid.TemplateSelector', {
	    border: false,
	    scrollable: true,
	    nodename: me.nodename
	});

	var sm = grid.getSelectionModel();

	var submitBtn = Ext.create('Proxmox.button.Button', {
	    text: gettext('Download'),
	    disabled: true,
	    selModel: sm,
	    handler: function(button, event, rec) {
		Proxmox.Utils.API2Request({
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

			Ext.create('Proxmox.window.TaskViewer', {
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

	let acceptedExtensions = {
	    iso: ".img, .iso",
	    vztmpl: ".tar.gz, .tar.xz",
	};

	let defaultContent = me.contents[0] || '';

	let fileField = Ext.create('Ext.form.field.File', {
	    name: 'filename',
	    buttonText: gettext('Select File...'),
	    allowBlank: false,
	    setAccept: function(content) {
		let acceptString = acceptedExtensions[content] || '';
		this.fileInputEl.set({
		    accept: acceptString,
		});
	    },
	    listeners: {
		afterrender: function(cmp) {
		    cmp.setAccept(defaultContent);
		},
	    },
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
		    value: defaultContent,
		    allowBlank: false,
		    listeners: {
			change: function(cmp, newValue, oldValue) {
			    fileField.setAccept(newValue);
			},
		    },
		},
		fileField,
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
		text += " (" + Proxmox.Utils.format_size(bytes) + ')';
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
			if (xhr.responseText !== "") {
			    var result = Ext.decode(xhr.responseText);
			    result.message = msg;
			    msg = Proxmox.Utils.extractRequestError(result, true);
			}
			Ext.Msg.alert(gettext('Error'), msg, function(btn) {
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

    viewConfig: {
	trackOver: false,
	loadMask: false
    },
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

	var content = me.content;
	if (!content) {
	    throw "no content type specified";
	}

	var baseurl = "/nodes/" + nodename + "/storage/" + storage + "/content";
	var store = Ext.create('Ext.data.Store',{
	    model: 'pve-storage-content',
	    proxy: {
                type: 'proxmox',
		url: '/api2/json' + baseurl,
		extraParams: {
		    content: content,
		},
	    },
	    sorters: {
		property: 'volid',
		order: 'DESC'
	    }
	});

	var sm = Ext.create('Ext.selection.RowModel', {});

	var reload = function() {
	    store.load();
	};

	Proxmox.Utils.monStoreErrors(me, store);

	var templateButton = Ext.create('Proxmox.button.Button',{
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
	if (content !== 'vztmpl') {
	    templateButton.setDisabled(true);
	}

	var uploadButton = Ext.create('Proxmox.button.Button', {
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
	if (content === 'iso' || content === 'vztmpl') {
	    uploadButton.contents = [content];
	} else {
	    uploadButton.setDisabled(true);
	}

	var imageRemoveButton;
	var removeButton = Ext.create('Proxmox.button.StdRemoveButton',{
	    selModel: sm,
	    delay: 5,
	    enableFn: function(rec) {
		if (rec && rec.data.content !== 'images' &&
			   rec.data.content !== 'rootdir') {
		    imageRemoveButton.setVisible(false);
		    removeButton.setVisible(true);
		    return true;
		}
		return false;
	    },
	    callback: function() {
		reload();
	    },
	    baseurl: baseurl + '/'
	});

	imageRemoveButton = Ext.create('Proxmox.button.Button',{
	    selModel: sm,
	    hidden: true,
	    text: gettext('Remove'),
	    enableFn: function(rec) {
		if (rec && (rec.data.content === 'images' ||
			    rec.data.content === 'rootdir')) {
		    removeButton.setVisible(false);
		    imageRemoveButton.setVisible(true);
		    return true;
		}
		return false;
	    },
	    handler: function(btn, event, rec) {
		var url = baseurl + '/' + rec.data.volid;
		var vmid = rec.data.vmid;

		var store = PVE.data.ResourceStore;

		if (vmid && store.findVMID(vmid)) {
		    var guest_node = store.guestNode(vmid);
		    var storage_path = 'storage/' + nodename + '/' + storage;

		    // allow to delete local backed images if a VMID exists on another node.
		    if (store.storageIsShared(storage_path) || guest_node == nodename) {
			var msg = Ext.String.format(
			    gettext("Cannot remove image, a guest with VMID '{0}' exists!"), vmid);
			msg += '<br />' + gettext("You can delete the image from the guest's hardware pane");

			Ext.Msg.show({
			    title: gettext('Cannot remove disk image.'),
			    icon: Ext.Msg.ERROR,
			    msg: msg
			});
			return;
		    }
		}
		var win = Ext.create('PVE.window.SafeDestroy', {
		    title: Ext.String.format(gettext("Destroy '{0}'"), rec.data.volid),
		    showProgress: true,
		    url: url,
		    item: { type: 'Image', id: vmid }
		}).show();
		win.on('destroy', function() {
		    reload();
		});
	    }
	});

	Ext.apply(me, {
	    store: store,
	    selModel: sm,
	    tbar: [
		{
		    xtype: 'proxmoxButton',
		    text: gettext('Restore'),
		    selModel: sm,
		    disabled: true,
		    enableFn: function(rec) {
			return rec && rec.data.content === 'backup';
		    },
		    handler: function(b, e, rec) {
			var vmtype;
			if (PVE.Utils.volume_is_qemu_backup(rec.data.volid, rec.data.format)) {
			    vmtype = 'qemu';
			} else if (PVE.Utils.volume_is_lxc_backup(rec.data.volid, rec.data.format)) {
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
		removeButton,
		imageRemoveButton,
		templateButton,
		uploadButton,
		{
		    xtype: 'proxmoxButton',
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
		    flex: 2,
		    sortable: true,
		    renderer: PVE.Utils.render_storage_content,
		    dataIndex: 'text'
		},
		{
		    header: gettext('Comment'),
		    flex: 1,
		    renderer: Ext.htmlEncode,
		    dataIndex: 'comment',
		},
		{
		    header: gettext('Date'),
		    width: 150,
		    dataIndex: 'vdate'
		},
		{
		    header: gettext('Format'),
		    width: 100,
		    dataIndex: 'format'
		},
		{
		    header: gettext('Size'),
		    width: 100,
		    renderer: Proxmox.Utils.format_size,
		    dataIndex: 'size'
		},
	    ],
	    listeners: {
		activate: reload
	    }
	});

	me.callParent();
    }
}, function() {

    Ext.define('pve-storage-content', {
	extend: 'Ext.data.Model',
	fields: [
	    'volid', 'content', 'format', 'size', 'used', 'vmid',
	    'channel', 'id', 'lun', 'comment', 'verification',
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
	    },
	    {
		name: 'vdate',
		convert: function(value, record) {
		    // check for volid, because if you click on a grouping header,
		    // it calls convert (but with an empty volid)
		    if (value || record.data.volid === null) {
			return value;
		    }
		    let t = record.data.content;
		    if (t === "backup") {
			let v = record.data.volid;
			let match = v.match(/(\d{4}_\d{2}_\d{2})-(\d{2}_\d{2}_\d{2})/);
			if (match) {
			    let date = match[1].replace(/_/g, '-');
			    let time = match[2].replace(/_/g, ':');
			    return date + " " + time;
			}
		    }
		    if (record.data.ctime) {
			let ctime = new Date(record.data.ctime * 1000);
			return Ext.Date.format(ctime,'Y-m-d H:i:s');
		    }
		    return '';
		}
	    },
	],
	idProperty: 'volid'
    });

});
