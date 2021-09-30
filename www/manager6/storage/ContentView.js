Ext.define('PVE.storage.Upload', {
    extend: 'Ext.window.Window',
    alias: 'widget.pveStorageUpload',

    resizable: false,

    modal: true,

    initComponent: function() {
        var me = this;

	if (!me.nodename) {
	    throw "no node name specified";
	}
	if (!me.storage) {
	    throw "no storage ID specified";
	}

	let baseurl = `/nodes/${me.nodename}/storage/${me.storage}/upload`;

	let pbar = Ext.create('Ext.ProgressBar', {
            text: 'Ready',
	    hidden: true,
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
		anchor: '100%',
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
		pbar,
	    ],
	});

	let form = me.formPanel.getForm();

	let doStandardSubmit = function() {
	    form.submit({
		url: "/api2/htmljs" + baseurl,
		waitMsg: gettext('Uploading file...'),
		success: function(f, action) {
		    me.close();
		},
		failure: function(f, action) {
		    var msg = PVE.Utils.extractFormActionError(action);
                    Ext.Msg.alert(gettext('Error'), msg);
		},
	    });
	};

	let updateProgress = function(per, bytes) {
	    var text = (per * 100).toFixed(2) + '%';
	    if (bytes) {
		text += " (" + Proxmox.Utils.format_size(bytes) + ')';
	    }
	    pbar.updateProgress(per, text);
	};

	let abortBtn = Ext.create('Ext.Button', {
	    text: gettext('Abort'),
	    disabled: true,
	    handler: function() {
		me.close();
	    },
	});

	let submitBtn = Ext.create('Ext.Button', {
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

		let xhr = new XMLHttpRequest();
		me.xhr = xhr;

		xhr.addEventListener("load", function(e) {
		    if (xhr.status === 200) {
			me.close();
			return;
		    }
		    let err = Ext.htmlEncode(xhr.statusText);
		    let msg = `${gettext('Error')} ${xhr.status.toString()}: ${err}`;
		    if (xhr.responseText !== "") {
			let result = Ext.decode(xhr.responseText);
			result.message = msg;
			msg = Proxmox.Utils.extractRequestError(result, true);
		    }
		    Ext.Msg.alert(gettext('Error'), msg, btn => me.close());
		}, false);

		xhr.addEventListener("error", function(e) {
		    let err = e.target.status.toString();
		    let msg = `Error '${err}' occurred while receiving the document.`;
		    Ext.Msg.alert(gettext('Error'), msg, btn => me.close());
		});

		xhr.upload.addEventListener("progress", function(evt) {
		    if (evt.lengthComputable) {
			let percentComplete = evt.loaded / evt.total;
			updateProgress(percentComplete, evt.loaded);
		    }
		}, false);

		xhr.open("POST", `/api2/json${baseurl}`, true);
		xhr.send(fd);
	    },
	});

	form.on('validitychange', (f, valid) => submitBtn.setDisabled(!valid));

	Ext.apply(me, {
	    title: gettext('Upload'),
	    items: me.formPanel,
	    buttons: [abortBtn, submitBtn],
	    listeners: {
		close: function() {
		    if (me.xhr) {
			me.xhr.abort();
			delete me.xhr;
		    }
		},
	    },
	});

        me.callParent();
    },
});

Ext.define('PVE.storage.ContentView', {
    extend: 'Ext.grid.GridPanel',

    alias: 'widget.pveStorageContentView',

    viewConfig: {
	trackOver: false,
	loadMask: false,
    },
    initComponent: function() {
	var me = this;

	if (!me.nodename) {
	    me.nodename = me.pveSelNode.data.node;
	    if (!me.nodename) {
		throw "no node name specified";
	    }
	}
	const nodename = me.nodename;

	if (!me.storage) {
	    me.storage = me.pveSelNode.data.storage;
	    if (!me.storage) {
		throw "no storage ID specified";
	    }
	}
	const storage = me.storage;

	var content = me.content;
	if (!content) {
	    throw "no content type specified";
	}

	const baseurl = `/nodes/${nodename}/storage/${storage}/content`;
	let store = me.store = Ext.create('Ext.data.Store', {
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
		order: 'DESC',
	    },
	});

	if (!me.sm) {
	    me.sm = Ext.create('Ext.selection.RowModel', {});
	}
	let sm = me.sm;

	let reload = () => store.load();

	Proxmox.Utils.monStoreErrors(me, store);

	if (!me.tbar) {
	    me.tbar = [];
	}
	if (me.useUploadButton) {
	    me.tbar.unshift(
		{
		    xtype: 'button',
		    text: gettext('Upload'),
		    disabled: !me.enableUploadButton,
		    handler: function() {
			Ext.create('PVE.storage.Upload', {
			    nodename: nodename,
			    storage: storage,
			    contents: [content],
			    autoShow: true,
			    taskDone: () => reload(),
			});
		    },
		},
		{
		    xtype: 'button',
		    text: gettext('Download from URL'),
		    disabled: !me.enableDownloadUrlButton,
		    handler: function() {
			Ext.create('PVE.window.DownloadUrlToStorage', {
			    nodename: nodename,
			    storage: storage,
			    content: content,
			    autoShow: true,
			    taskDone: () => reload(),
			});
		    },
		},
		'-',
	    );
	}
	if (!me.useCustomRemoveButton) {
	    me.tbar.push({
		xtype: 'proxmoxStdRemoveButton',
		selModel: sm,
		delay: 5,
		callback: () => reload(),
		baseurl: baseurl + '/',
	    });
	}
	me.tbar.push(
	    '->',
	    gettext('Search') + ':',
	    ' ',
	    {
		xtype: 'textfield',
		width: 200,
		enableKeyEvents: true,
		emptyText: gettext('Name, Format'),
		listeners: {
		    keyup: {
			buffer: 500,
			fn: function(field) {
			    store.clearFilter(true);
			    store.filter([
				{
				    property: 'text',
				    value: field.getValue(),
				    anyMatch: true,
				    caseSensitive: false,
				},
			    ]);
			},
		    },
		    change: function(field, newValue, oldValue) {
			if (newValue !== this.originalValue) {
			    this.triggers.clear.setVisible(true);
			}
		    },
		},
		triggers: {
		    clear: {
			cls: 'pmx-clear-trigger',
			weight: -1,
			hidden: true,
			handler: function() {
			    this.triggers.clear.setVisible(false);
			    this.setValue(this.originalValue);
			    store.clearFilter();
			},
		    },
		},
	    },
	);

	let availableColumns = {
	    'name': {
		header: gettext('Name'),
		flex: 2,
		sortable: true,
		renderer: PVE.Utils.render_storage_content,
		dataIndex: 'text',
	    },
	    'notes': {
		header: gettext('Notes'),
		flex: 1,
		renderer: Ext.htmlEncode,
		dataIndex: 'notes',
	    },
	    'protected': {
		header: gettext('Protected'),
		width: 100,
		renderer: Proxmox.Utils.format_boolean,
		dataIndex: 'protected',
	    },
	    'date': {
		header: gettext('Date'),
		width: 150,
		dataIndex: 'vdate',
	    },
	    'format': {
		header: gettext('Format'),
		width: 100,
		dataIndex: 'format',
	    },
	    'size': {
		header: gettext('Size'),
		width: 100,
		renderer: Proxmox.Utils.format_size,
		dataIndex: 'size',
	    },
	};

	let showColumns = me.showColumns || ['name', 'date', 'format', 'size'];

	Object.keys(availableColumns).forEach(function(key) {
	    if (!showColumns.includes(key)) {
		delete availableColumns[key];
	    }
	});

	if (me.extraColumns && typeof me.extraColumns === 'object') {
	    Object.assign(availableColumns, me.extraColumns);
	}
	const columns = Object.values(availableColumns);

	Ext.apply(me, {
	    store: store,
	    selModel: sm,
	    tbar: me.tbar,
	    columns: columns,
	    listeners: {
		activate: reload,
	    },
	});

	me.callParent();
    },
}, function() {
    Ext.define('pve-storage-content', {
	extend: 'Ext.data.Model',
	fields: [
	    'volid', 'content', 'format', 'size', 'used', 'vmid',
	    'channel', 'id', 'lun', 'notes', 'verification',
	    {
		name: 'text',
		convert: function(value, record) {
		    // check for volid, because if you click on a grouping header,
		    // it calls convert (but with an empty volid)
		    if (value || record.data.volid === null) {
			return value;
		    }
		    return PVE.Utils.render_storage_content(value, {}, record);
		},
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
			return Ext.Date.format(ctime, 'Y-m-d H:i:s');
		    }
		    return '';
		},
	    },
	],
	idProperty: 'volid',
    });
});
