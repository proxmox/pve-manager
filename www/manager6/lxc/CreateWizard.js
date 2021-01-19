Ext.define('PVE.lxc.CreateWizard', {
    extend: 'PVE.window.Wizard',
    mixins: ['Proxmox.Mixin.CBind'],

    viewModel: {
	data: {
	    nodename: '',
	    storage: '',
	    unprivileged: true,
	},
    },

    cbindData: {
	nodename: undefined,
    },

    subject: gettext('LXC Container'),

    items: [
	{
	    xtype: 'inputpanel',
	    title: gettext('General'),
	    onlineHelp: 'pct_general',
	    column1: [
		{
		    xtype: 'pveNodeSelector',
		    name: 'nodename',
		    cbind: {
			selectCurNode: '{!nodename}',
			preferredValue: '{nodename}',
		    },
		    bind: {
			value: '{nodename}',
		    },
		    fieldLabel: gettext('Node'),
		    allowBlank: false,
		    onlineValidator: true,
		},
		{
		    xtype: 'pveGuestIDSelector',
		    name: 'vmid', // backend only knows vmid
		    guestType: 'lxc',
		    value: '',
		    loadNextFreeID: true,
		    validateExists: false,
		},
		{
		    xtype: 'proxmoxtextfield',
		    name: 'hostname',
		    vtype: 'DnsName',
		    value: '',
		    fieldLabel: gettext('Hostname'),
		    skipEmptyText: true,
		    allowBlank: true,
		},
		{
		    xtype: 'proxmoxcheckbox',
		    name: 'unprivileged',
		    value: true,
		    bind: {
			value: '{unprivileged}',
		    },
		    fieldLabel: gettext('Unprivileged container'),
		},
	    ],
	    column2: [
		{
		    xtype: 'pvePoolSelector',
		    fieldLabel: gettext('Resource Pool'),
		    name: 'pool',
		    value: '',
		    allowBlank: true,
		},
		{
		    xtype: 'textfield',
		    inputType: 'password',
		    name: 'password',
		    value: '',
		    fieldLabel: gettext('Password'),
		    allowBlank: false,
		    minLength: 5,
		    change: function(f, value) {
			if (f.rendered) {
			    f.up().down('field[name=confirmpw]').validate();
			}
		    },
		},
		{
		    xtype: 'textfield',
		    inputType: 'password',
		    name: 'confirmpw',
		    value: '',
		    fieldLabel: gettext('Confirm password'),
		    allowBlank: true,
		    submitValue: false,
		    validator: function(value) {
			var pw = this.up().down('field[name=password]').getValue();
			if (pw !== value) {
			    return "Passwords do not match!";
			}
			return true;
		    },
		},
		{
		    xtype: 'proxmoxtextfield',
		    name: 'ssh-public-keys',
		    value: '',
		    fieldLabel: gettext('SSH public key'),
		    allowBlank: true,
		    validator: function(value) {
			var pwfield = this.up().down('field[name=password]');
			if (value.length) {
			    var key = PVE.Parser.parseSSHKey(value);
			    if (!key) {
				return "Failed to recognize ssh key";
			    }
			    pwfield.allowBlank = true;
			} else {
			    pwfield.allowBlank = false;
			}
			pwfield.validate();
			return true;
		    },
		    afterRender: function() {
			if (!window.FileReader) {
			    // No FileReader support in this browser
			    return;
			}
			var cancel = function(ev) {
			    ev = ev.event;
			    if (ev.preventDefault) {
				ev.preventDefault();
			    }
			};
			var field = this;
			field.inputEl.on('dragover', cancel);
			field.inputEl.on('dragenter', cancel);
			field.inputEl.on('drop', function(ev) {
			    ev = ev.event;
			    if (ev.preventDefault) {
				ev.preventDefault();
			    }
			    let files = ev.dataTransfer.files;
			    PVE.Utils.loadSSHKeyFromFile(files[0], v => field.setValue(v));
			});
		    },
		},
		{
		    xtype: 'filebutton',
		    name: 'file',
		    hidden: !window.FileReader,
		    text: gettext('Load SSH Key File'),
		    listeners: {
			change: function(btn, e, value) {
			    e = e.event;
			    var field = this.up().down('proxmoxtextfield[name=ssh-public-keys]');
			    PVE.Utils.loadSSHKeyFromFile(e.target.files[0], function(v) {
				field.setValue(v);
			    });
			    btn.reset();
			},
		    },
		},
	    ],
	},
	{
	    xtype: 'inputpanel',
	    title: gettext('Template'),
	    onlineHelp: 'pct_container_images',
	    column1: [
		{
		    xtype: 'pveStorageSelector',
		    name: 'tmplstorage',
		    fieldLabel: gettext('Storage'),
		    storageContent: 'vztmpl',
		    autoSelect: true,
		    allowBlank: false,
		    bind: {
			value: '{storage}',
			nodename: '{nodename}',
		    },
		},
		{
		    xtype: 'pveFileSelector',
		    name: 'ostemplate',
		    storageContent: 'vztmpl',
		    fieldLabel: gettext('Template'),
		    bind: {
			storage: '{storage}',
			nodename: '{nodename}',
		    },
		    allowBlank: false,
		},
	    ],
	},
	{
	    xtype: 'pveLxcMountPointInputPanel',
	    title: gettext('Root Disk'),
	    insideWizard: true,
	    isCreate: true,
	    unused: false,
	    bind: {
		nodename: '{nodename}',
		unprivileged: '{unprivileged}',
	    },
	    confid: 'rootfs',
	},
	{
	    xtype: 'pveLxcCPUInputPanel',
	    title: gettext('CPU'),
	    insideWizard: true,
	},
	{
	    xtype: 'pveLxcMemoryInputPanel',
	    title: gettext('Memory'),
	    insideWizard: true,
	},
	{
	    xtype: 'pveLxcNetworkInputPanel',
	    title: gettext('Network'),
	    insideWizard: true,
	    bind: {
		nodename: '{nodename}',
	    },
	    isCreate: true,
	},
	{
	    xtype: 'pveLxcDNSInputPanel',
	    title: gettext('DNS'),
	    insideWizard: true,
	},
	{
	    title: gettext('Confirm'),
	    layout: 'fit',
	    items: [
		{
		    xtype: 'grid',
		    store: {
			model: 'KeyValue',
			sorters: [{
				property: 'key',
				direction: 'ASC',
			}],
		    },
		    columns: [
			{ header: 'Key', width: 150, dataIndex: 'key' },
			{ header: 'Value', flex: 1, dataIndex: 'value' },
		    ],
		},
	    ],
	    dockedItems: [
		{
		    xtype: 'proxmoxcheckbox',
		    name: 'start',
		    dock: 'bottom',
		    margin: '5 0 0 0',
		    boxLabel: gettext('Start after created'),
		},
	    ],
	    listeners: {
		show: function(panel) {
		    var wizard = this.up('window');
		    var kv = wizard.getValues();
		    var data = [];
		    Ext.Object.each(kv, function(key, value) {
			if (key === 'delete' || key === 'tmplstorage') { // ignore
			    return;
			}
			if (key === 'password') { // don't show pw
			    return;
			}
			var html = Ext.htmlEncode(Ext.JSON.encode(value));
			data.push({ key: key, value: value });
		    });

		    var summarystore = panel.down('grid').getStore();
		    summarystore.suspendEvents();
		    summarystore.removeAll();
		    summarystore.add(data);
		    summarystore.sort();
		    summarystore.resumeEvents();
		    summarystore.fireEvent('refresh');
		},
	    },
	    onSubmit: function() {
		var wizard = this.up('window');
		var kv = wizard.getValues();
		delete kv.delete;

		var nodename = kv.nodename;
		delete kv.nodename;
		delete kv.tmplstorage;

		if (!kv.pool.length) {
		    delete kv.pool;
		}

		if (!kv.password.length && kv['ssh-public-keys']) {
		    delete kv.password;
		}

		Proxmox.Utils.API2Request({
		    url: '/nodes/' + nodename + '/lxc',
		    waitMsgTarget: wizard,
		    method: 'POST',
		    params: kv,
		    success: function(response, opts) {
			var upid = response.result.data;

			var win = Ext.create('Proxmox.window.TaskViewer', {
			    upid: upid,
			});
			win.show();
			wizard.close();
		    },
		    failure: function(response, opts) {
			Ext.Msg.alert(gettext('Error'), response.htmlStatus);
		    },
		});
	    },
	},
    ],
});


