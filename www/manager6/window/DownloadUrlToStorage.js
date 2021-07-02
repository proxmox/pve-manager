Ext.define('PVE.window.DownloadUrlToStorage', {
    extend: 'Proxmox.window.Edit',
    alias: 'widget.pveStorageDownloadUrl',
    mixins: ['Proxmox.Mixin.CBind'],

    isCreate: true,

    method: 'POST',

    showTaskViewer: true,

    title: gettext('Download from URL'),
    submitText: gettext('Download'),

    cbindData: function(initialConfig) {
	var me = this;
	return {
	    nodename: me.nodename,
	    storage: me.storage,
	    content: me.content,
	};
    },

    cbind: {
	url: '/nodes/{nodename}/storage/{storage}/download-url',
    },

    controller: {
	xclass: 'Ext.app.ViewController',

	urlChange: function(field) {
	    let me = this;
	    let view = me.getView();
	    field = view.down('[name=url]');
	    field.setValidation(gettext("Please check URL"));
	    field.validate();
	    view.setValues({
		size: gettext("unknown"),
		mimetype: gettext("unknown"),
	    });
	},

	urlCheck: function(field) {
	    let me = this;
	    let view = me.getView();
	    field = view.down('[name=url]');
	    view.setValues({
		size: gettext("unknown"),
		mimetype: gettext("unknown"),
	    });
	    Proxmox.Utils.API2Request({
		url: `/nodes/${view.nodename}/query-url-metadata`,
		method: 'GET',
		params: {
		    url: field.getValue(),
		    'verify-certificates': view.getValues()['verify-certificates'],
		},
		waitMsgTarget: view,
		failure: function(res, opt) {
		    field.setValidation(res.result.message);
		    field.validate();
		},
		success: function(res, opt) {
		    field.setValidation();
		    field.validate();

		    let data = res.result.data;
		    view.setValues({
			filename: data.filename || "",
			size: (data.size && Proxmox.Utils.format_size(data.size)) || gettext("unknown"),
			mimetype: data.mimetype || gettext("unknown"),
		    });
		},
	    });
	},

	hashChange: function(field) {
	    let checksum = Ext.getCmp('downloadUrlChecksum');
	    if (field.getValue() === '__default__') {
		checksum.setDisabled(true);
		checksum.setValue("");
		checksum.allowBlank = true;
	    } else {
		checksum.setDisabled(false);
		checksum.allowBlank = false;
	    }
	},
    },

    items: [
	{
	    xtype: 'inputpanel',
	    border: false,
	    columnT: [
		{
		    xtype: 'fieldcontainer',
		    layout: 'hbox',
		    fieldLabel: gettext('URL'),
		    items: [
			{
			    xtype: 'textfield',
			    name: 'url',
			    allowBlank: false,
			    flex: 1,
			    listeners: {
				change: 'urlChange',
			    },
			},
			{
			    xtype: 'button',
			    name: 'check',
			    text: gettext('Check'),
			    margin: '0 0 0 5',
			    listeners: {
				click: 'urlCheck',
			    },
			},
		    ],
		},
		{
		    xtype: 'textfield',
		    name: 'filename',
		    allowBlank: false,
		    fieldLabel: gettext('File name'),
		},
	    ],
	    column1: [
		{
		    xtype: 'displayfield',
		    name: 'size',
		    fieldLabel: gettext('File size'),
		    value: gettext('unknown'),
		},
	    ],
	    column2: [
		{
		    xtype: 'displayfield',
		    name: 'mimetype',
		    fieldLabel: gettext('MIME type'),
		    value: gettext('unknown'),
		},
	    ],
	    advancedColumn1: [
		{
		    xtype: 'pveHashAlgorithmSelector',
		    name: 'checksum-algorithm',
		    fieldLabel: gettext('Hash algorithm'),
		    allowBlank: true,
		    hasNoneOption: true,
		    value: '__default__',
		    listeners: {
			change: 'hashChange',
		    },
		},
		{
		    xtype: 'textfield',
		    name: 'checksum',
		    fieldLabel: gettext('Checksum'),
		    allowBlank: true,
		    disabled: true,
		    emptyText: gettext('none'),
		    id: 'downloadUrlChecksum',
		},
	    ],
	    advancedColumn2: [
		{
		    xtype: 'proxmoxcheckbox',
		    name: 'verify-certificates',
		    fieldLabel: gettext('Verify certificates'),
		    uncheckedValue: 0,
		    checked: true,
		    listeners: {
			change: 'urlChange',
		    },
		},
	    ],
	},
	{
	    xtype: 'hiddenfield',
	    name: 'content',
	    cbind: {
		value: '{content}',
	    },
	},
    ],

    initComponent: function() {
        var me = this;

	if (!me.nodename) {
	    throw "no node name specified";
	}
	if (!me.storage) {
	    throw "no storage ID specified";
	}

        me.callParent();
    },
});

