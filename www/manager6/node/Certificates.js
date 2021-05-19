Ext.define('PVE.node.CertificateView', {
    extend: 'Ext.container.Container',
    xtype: 'pveCertificatesView',

    onlineHelp: 'sysadmin_certificate_management',

    mixins: ['Proxmox.Mixin.CBind'],

    items: [
	{
	    xtype: 'pveCertView',
	    border: 0,
	    cbind: {
		nodename: '{nodename}',
	    },
	},
	{
	    xtype: 'pveACMEView',
	    border: 0,
	    cbind: {
		nodename: '{nodename}',
	    },
	},
    ],

});

Ext.define('PVE.node.CertificateViewer', {
    extend: 'Proxmox.window.Edit',

    title: gettext('Certificate'),

    fieldDefaults: {
	labelWidth: 120,
    },
    width: 800,
    resizable: true,

    items: [
	{
	    xtype: 'displayfield',
	    fieldLabel: gettext('Name'),
	    name: 'filename',
	},
	{
	    xtype: 'displayfield',
	    fieldLabel: gettext('Fingerprint'),
	    name: 'fingerprint',
	},
	{
	    xtype: 'displayfield',
	    fieldLabel: gettext('Issuer'),
	    name: 'issuer',
	},
	{
	    xtype: 'displayfield',
	    fieldLabel: gettext('Subject'),
	    name: 'subject',
	},
	{
	    xtype: 'displayfield',
	    fieldLabel: gettext('Public Key Type'),
	    name: 'public-key-type',
	},
	{
	    xtype: 'displayfield',
	    fieldLabel: gettext('Public Key Size'),
	    name: 'public-key-bits',
	},
	{
	    xtype: 'displayfield',
	    fieldLabel: gettext('Valid Since'),
	    renderer: Proxmox.Utils.render_timestamp,
	    name: 'notbefore',
	},
	{
	    xtype: 'displayfield',
	    fieldLabel: gettext('Expires'),
	    renderer: Proxmox.Utils.render_timestamp,
	    name: 'notafter',
	},
	{
	    xtype: 'displayfield',
	    fieldLabel: gettext('Subject Alternative Names'),
	    name: 'san',
	    renderer: PVE.Utils.render_san,
	},
	{
	    xtype: 'textarea',
	    editable: false,
	    grow: true,
	    growMax: 200,
	    fieldLabel: gettext('Certificate'),
	    name: 'pem',
	},
    ],

    initComponent: function() {
	var me = this;

	if (!me.cert) {
	    throw "no cert given";
	}

	if (!me.nodename) {
	    throw "no nodename given";
	}

	me.url = '/nodes/' + me.nodename + '/certificates/info';
	me.callParent();

	// hide OK/Reset button, because we just want to show data
	me.down('toolbar[dock=bottom]').setVisible(false);

	me.load({
	    success: function(response) {
		if (Ext.isArray(response.result.data)) {
		    Ext.Array.each(response.result.data, function(item) {
			if (item.filename === me.cert) {
			    me.setValues(item);
			    return false;
			}
		    });
		}
	    },
	});
    },
});

Ext.define('PVE.node.CertUpload', {
    extend: 'Proxmox.window.Edit',
    xtype: 'pveCertUpload',

    title: gettext('Upload Custom Certificate'),
    resizable: false,
    isCreate: true,
    submitText: gettext('Upload'),
    method: 'POST',
    width: 600,

    apiCallDone: function(success, response, options) {
	if (!success) {
	    return;
	}

	var txt = gettext('pveproxy will be restarted with new certificates, please reload the GUI!');
	Ext.getBody().mask(txt, ['pve-static-mask']);
	// reload after 10 seconds automatically
	Ext.defer(function() {
	    window.location.reload(true);
	}, 10000);
    },

    items: [
	{
	    fieldLabel: gettext('Private Key (Optional)'),
	    labelAlign: 'top',
	    emptyText: gettext('No change'),
	    name: 'key',
	    xtype: 'textarea',
	},
	{
	    xtype: 'filebutton',
	    text: gettext('From File'),
	    listeners: {
		change: function(btn, e, value) {
		    var me = this.up('form');
		    e = e.event;
		    Ext.Array.each(e.target.files, function(file) {
			PVE.Utils.loadSSHKeyFromFile(file, function(res) {
			    me.down('field[name=key]').setValue(res);
			});
		    });
		    btn.reset();
		},
	    },
	},
	{
	    xtype: 'box',
	    autoEl: 'hr',
	},
	{
	    fieldLabel: gettext('Certificate Chain'),
	    labelAlign: 'top',
	    allowBlank: false,
	    name: 'certificates',
	    xtype: 'textarea',
	},
	{
	    xtype: 'filebutton',
	    text: gettext('From File'),
	    listeners: {
		change: function(btn, e, value) {
		    var me = this.up('form');
		    e = e.event;
		    Ext.Array.each(e.target.files, function(file) {
			PVE.Utils.loadSSHKeyFromFile(file, function(res) {
			    me.down('field[name=certificates]').setValue(res);
			});
		    });
		    btn.reset();
		},
	    },
	},
	{
	    xtype: 'hidden',
	    name: 'restart',
	    value: '1',
	},
	{
	    xtype: 'hidden',
	    name: 'force',
	    value: '1',
	},
    ],

    initComponent: function() {
	var me = this;

	if (!me.nodename) {
	    throw "no nodename given";
	}

	me.url = '/nodes/' + me.nodename + '/certificates/custom';

	me.callParent();
    },
});

Ext.define('pve-certificate', {
    extend: 'Ext.data.Model',

    fields: ['filename', 'fingerprint', 'issuer', 'notafter', 'notbefore', 'subject', 'san', 'public-key-bits', 'public-key-type'],
    idProperty: 'filename',
});

Ext.define('PVE.node.Certificates', {
    extend: 'Ext.grid.Panel',
    xtype: 'pveCertView',

    tbar: [
	{
	    xtype: 'button',
	    text: gettext('Upload Custom Certificate'),
	    handler: function() {
		var me = this.up('grid');
		var win = Ext.create('PVE.node.CertUpload', {
		    nodename: me.nodename,
		});
		win.show();
		win.on('destroy', me.reload, me);
	    },
	},
	{
	    xtype: 'proxmoxStdRemoveButton',
	    itemId: 'deletebtn',
	    text: gettext('Delete Custom Certificate'),
	    dangerous: true,
	    selModel: false,
	    getUrl: function(rec) {
		let view = this.up('grid');
		return `/nodes/${view.nodename}/certificates/custom?restart=1`;
	    },
	    confirmMsg: gettext('Delete custom certificate and switch to generated one?'),
	    callback: function(options, success, response) {
		if (success) {
		    let txt = gettext('API server will be restarted to use new certificates, please reload web-interface!');
		    Ext.getBody().mask(txt, ['pve-static-mask']);
		    // reload after 10 seconds automatically
		    Ext.defer(() => window.location.reload(true), 10000);
		}
	    },
	},
	'-',
	{
	    xtype: 'proxmoxButton',
	    itemId: 'viewbtn',
	    disabled: true,
	    text: gettext('View Certificate'),
	    handler: function() {
		var me = this.up('grid');
		me.view_certificate();
	    },
	},
    ],

    columns: [
	{
	    header: gettext('File'),
	    width: 150,
	    dataIndex: 'filename',
	},
	{
	    header: gettext('Issuer'),
	    flex: 1,
	    dataIndex: 'issuer',
	},
	{
	    header: gettext('Subject'),
	    flex: 1,
	    dataIndex: 'subject',
	},
	{
	    header: gettext('Public Key Alogrithm'),
	    flex: 1,
	    dataIndex: 'public-key-type',
	    hidden: true,
	},
	{
	    header: gettext('Public Key Size'),
	    flex: 1,
	    dataIndex: 'public-key-bits',
	    hidden: true,
	},
	{
	    header: gettext('Valid Since'),
	    width: 150,
	    dataIndex: 'notbefore',
	    renderer: Proxmox.Utils.render_timestamp,
	},
	{
	    header: gettext('Expires'),
	    width: 150,
	    dataIndex: 'notafter',
	    renderer: Proxmox.Utils.render_timestamp,
	},
	{
	    header: gettext('Subject Alternative Names'),
	    flex: 1,
	    dataIndex: 'san',
	    renderer: PVE.Utils.render_san,
	},
	{
	    header: gettext('Fingerprint'),
	    dataIndex: 'fingerprint',
	    hidden: true,
	},
	{
	    header: gettext('PEM'),
	    dataIndex: 'pem',
	    hidden: true,
	},
    ],

    reload: function() {
	var me = this;
	me.rstore.load();
    },

    set_button_status: function() {
	var me = this;
	var rec = me.rstore.getById('pveproxy-ssl.pem');

	me.down('#deletebtn').setDisabled(!rec);
    },

    view_certificate: function() {
	var me = this;
	var selection = me.getSelection();
	if (!selection || selection.length < 1) {
	    return;
	}
	var win = Ext.create('PVE.node.CertificateViewer', {
	    cert: selection[0].data.filename,
	    nodename: me.nodename,
	});
	win.show();
    },

    listeners: {
	itemdblclick: 'view_certificate',
    },

    initComponent: function() {
	var me = this;

	if (!me.nodename) {
	    throw "no nodename given";
	}

	me.rstore = Ext.create('Proxmox.data.UpdateStore', {
	    storeid: 'certs-' + me.nodename,
	    model: 'pve-certificate',
	    proxy: {
		type: 'proxmox',
		    url: '/api2/json/nodes/' + me.nodename + '/certificates/info',
	    },
	});

	me.store = {
	    type: 'diff',
	    rstore: me.rstore,
	};

	me.callParent();

	me.mon(me.rstore, 'load', me.set_button_status, me);
	me.rstore.startUpdate();
	me.on('destroy', me.rstore.stopUpdate, me.rstore);
    },
});
