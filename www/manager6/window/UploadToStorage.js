Ext.define('PVE.window.UploadToStorage', {
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
