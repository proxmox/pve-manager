/*global QRCode*/
Ext.define('Proxmox.form.PBSEncryptionCheckbox', {
    extend: 'Ext.form.field.Checkbox',
    xtype: 'pbsEncryptionCheckbox',

    inputValue: true,

    viewModel: {
	data: {
	    value: null,
	    originalValue: null,
	},
	formulas: {
	    blabel: (get) => {
		let v = get('value');
		let original = get('originalValue');
		if (!get('isCreate') && original) {
		    if (!v) {
			return gettext('Warning: Existing encryption key will be deleted!');
		    }
		    return gettext('Active');
		} else {
		    return gettext('Auto-generate a client encryption key, saved privately on cluster filesystem');
		}
	    },
	},
    },

    bind: {
	value: '{value}',
	boxLabel: '{blabel}',
    },
    resetOriginalValue: function() {
	let me = this;
	let vm = me.getViewModel();
	vm.set('originalValue', me.value);

	me.callParent(arguments);
    },

    getSubmitData: function() {
	let me = this;
	let val = me.getSubmitValue();
	if (!me.isCreate) {
	    if (val === null) {
	       return { 'delete': 'encryption-key' };
	    } else if (val && !!val !== !!me.originalValue) {
	       return { 'encryption-key': 'autogen' };
	    }
	} else if (val) {
	   return { 'encryption-key': 'autogen' };
	}
	return null;
    },

    initComponent: function() {
	let me = this;
	me.callParent();

	let vm = me.getViewModel();
	vm.set('isCreate', me.isCreate);
    },
});

Ext.define('PVE.Storage.PBSKeyShow', {
    extend: 'Ext.window.Window',
    alias: ['widget.pveKeyShow'],
    mixins: ['Proxmox.Mixin.CBind'],

    width: 600,
    modal: true,
    resizable: false,
    title: gettext('Important: Save your Encryption Key'),

    // avoid that esc closes this by mistake, force user to more manual action
    onEsc: Ext.emptyFn,
    closable: false,

    items: [
	{
	    xtype: 'form',
	    layout: {
		type: 'vbox',
		align: 'stretch',
	    },
	    bodyPadding: 10,
	    border: false,
	    defaults: {
		anchor: '100%',
		border: false,
		padding: '10 0 0 0',
            },
	    items: [
		{
		    xtype: 'textfield',
		    fieldLabel: gettext('Key'),
		    labelWidth: 30,
		    inputId: 'encryption-key-value',
		    cbind: {
			value: '{key}',
		    },
		    editable: false,
		},
		{
		    xtype: 'component',
		    html: gettext('Keep your master key safe, but easily accessible for disaster recovery.')
		        + '<br>' + gettext('We recommend the following safe-keeping strategy:'),
		},
		{
		    xtyp: 'container',
		    layout: 'hbox',
		    items: [
			{
			    xtype: 'component',
			    html: '1. ' + gettext('Save the key in your password manager.'),
			    flex: 1,
			},
			{
			    xtype: 'button',
			    text: gettext('Copy Key'),
			    iconCls: 'fa fa-clipboard x-btn-icon-el-default-toolbar-small',
			    cls: 'x-btn-default-toolbar-small proxmox-inline-button',
			    width: 110,
			    handler: function(b) {
				document.getElementById('encryption-key-value').select();
				document.execCommand("copy");
			    },
			},
		    ],
		},
		{
		    xtype: 'container',
		    layout: 'hbox',
		    items: [
			{
			    xtype: 'component',
			    html: '2. ' + gettext('Download the key to a USB (pen) drive, placed in secure vault.'),
			    flex: 1,
			},
			{
			    xtype: 'button',
			    text: gettext('Download'),
			    iconCls: 'fa fa-download x-btn-icon-el-default-toolbar-small',
			    cls: 'x-btn-default-toolbar-small proxmox-inline-button',
			    width: 110,
			    handler: function(b) {
				let win = this.up('window');

				let pveID = PVE.ClusterName || window.location.hostname;
				let name = `pve-${pveID}-storage-${win.sid}.enc`;

				let hiddenElement = document.createElement('a');
				hiddenElement.href = 'data:attachment/text,' + encodeURI(win.key);
				hiddenElement.target = '_blank';
				hiddenElement.download = name;
				hiddenElement.click();
			    },
			},
		    ],
		},
		{
		    xtype: 'container',
		    layout: 'hbox',
		    items: [
			{
			    xtype: 'component',
			    html: '3. ' + gettext('Print as paperkey, laminated and placed in secure vault.'),
			    flex: 1,
			},
			{
			    xtype: 'button',
			    text: gettext('Print Key'),
			    iconCls: 'fa fa-print x-btn-icon-el-default-toolbar-small',
			    cls: 'x-btn-default-toolbar-small proxmox-inline-button',
			    width: 110,
			    handler: function(b) {
				let win = this.up('window');
				win.paperkey(win.key);
			    },
			},
		    ],
		},
	    ],
	},
	{
	    xtype: 'component',
	    border: false,
	    padding: '10 10 10 10',
	    userCls: 'pmx-hint',
	    html: gettext('Please save the encryption key - loosing it will render any backup created with it unuseable'),
	},
    ],
    buttons: [
	{
	    text: gettext('Close'),
	    handler: function(b) {
		let win = this.up('window');
		win.close();
	    },
	},
    ],
    paperkey: function(key) {
	let me = this;

	const qrwidth = 500;
	let qrdiv = document.createElement('div');
	let qrcode = new QRCode(qrdiv, {
	    width: qrwidth,
	    height: qrwidth,
	    correctLevel: QRCode.CorrectLevel.H,
	});
	qrcode.makeCode(key);

	let printFrame = document.createElement("iframe");
	Object.assign(printFrame.style, {
	    position: "fixed",
	    right: "0",
	    bottom: "0",
	    width: "0",
	    height: "0",
	    border: "0",
	});
	const prettifiedKey = JSON.stringify(JSON.parse(key), null, 2);
	const keyQrBase64 = qrdiv.children[0].toDataURL("image/png");
	const html = `<html><head><script>
	    window.addEventListener('DOMContentLoaded', (ev) => window.print());
	</script><style>@media print and (max-height: 150mm) {
	  h4, p { margin: 0; font-size: 1em; }
	}</style></head><body style="padding: 5px;">
	<h4>Encryption Key - Storage '${me.sid}'</h4>
<p style="font-size: 1.2em; font-family: monospace; white-space: pre-wrap;">
-----BEGIN PROXMOX BACKUP KEY-----
${prettifiedKey}
-----END PROXMOX BACKUP KEY-----</p>
	<center><img style="width: 100%; max-width: ${qrwidth}px;" src="${keyQrBase64}"></center>
	</body></html>`;

	printFrame.src = "data:text/html;base64," + btoa(html);
	document.body.appendChild(printFrame);
    },
});

Ext.define('PVE.storage.PBSInputPanel', {
    extend: 'PVE.panel.StorageBase',

    //onlineHelp: 'storage_pbs',

    apiCallDone: function(success, response, options) {
	let res = response.result.data;
	if (!(res && res.config && res.config['encryption-key'])) {
	    return;
	}
	let key = res.config['encryption-key'];
	Ext.create('PVE.Storage.PBSKeyShow', {
	    autoShow: true,
	    sid: res.storage,
	    key: key,
	});
    },

    initComponent: function() {
	var me = this;

	me.column1 = [
	    {
		xtype: me.isCreate ? 'textfield' : 'displayfield',
		name: 'server',
		value: '',
		vtype: 'DnsOrIp',
		fieldLabel: gettext('Server'),
		allowBlank: false,
	    },
	    {
		xtype: me.isCreate ? 'textfield' : 'displayfield',
		name: 'username',
		value: '',
		emptyText: gettext('Example') + ': admin@pbs',
		fieldLabel: gettext('Username'),
		regex: /\S+@\w+/,
		regexText: gettext('Example') + ': admin@pbs',
		allowBlank: false,
	    },
	    {
		xtype: me.isCreate ? 'textfield' : 'displayfield',
		inputType: 'password',
		name: 'password',
		value: me.isCreate ? '' : '********',
		emptyText: me.isCreate ? gettext('None') : '',
		fieldLabel: gettext('Password'),
		allowBlank: false,
	    },
	    {
		xtype: me.isCreate ? 'textfield' : 'displayfield',
		name: 'datastore',
		value: '',
		fieldLabel: 'Datastore',
		allowBlank: false,
	    },
	];

	me.column2 = [
	    {
		xtype: 'displayfield',
		name: 'content',
		value: 'backup',
		submitValue: true,
		fieldLabel: gettext('Content'),
	    },
	];

	me.columnB = [
	    {
		xtype: 'proxmoxtextfield',
		name: 'fingerprint',
		value: me.isCreate ? null : undefined,
		fieldLabel: gettext('Fingerprint'),
		emptyText: gettext('Server certificate SHA-256 fingerprint, required for self-signed certificates'),
		regex: /[A-Fa-f0-9]{2}(:[A-Fa-f0-9]{2}){31}/,
		regexText: gettext('Example') + ': AB:CD:EF:...',
		allowBlank: true,
	    },
	    {
		// FIXME: allow uploading their own, maybe export for root@pam?
		xtype: 'pbsEncryptionCheckbox',
		name: 'encryption-key',
		isCreate: me.isCreate,
		fieldLabel: gettext('Encryption Key'),
	    },
	];

	me.callParent();
    },
});
