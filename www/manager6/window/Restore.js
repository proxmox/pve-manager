Ext.define('PVE.window.Restore', {
    extend: 'Ext.window.Window', // fixme: Proxmox.window.Edit?

    resizable: false,

    controller: {
	xclass: 'Ext.app.ViewController',
	control: {
	    '#liveRestore': {
		change: function(el, newVal) {
		    let liveWarning = this.lookupReference('liveWarning');
		    liveWarning.setHidden(!newVal);
		    let start = this.lookupReference('start');
		    start.setDisabled(newVal);
		},
	    },
	},
    },

    initComponent: function() {
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
	    fieldLabel: gettext('Storage'),
	    storageContent: me.vmtype === 'lxc' ? 'rootdir' : 'images',
	    // when restoring a container without specifying a storage, the backend defaults
	    // to 'local', which is unintuitive and 'rootdir' might not even be allowed on it
	    allowBlank: me.vmtype !== 'lxc',
	    emptyText: me.vmtype === 'lxc' ? '' : gettext('From backup configuration'),
	    autoSelect: me.vmtype === 'lxc',
	});

	var IDfield;
	if (me.vmid) {
	    IDfield = Ext.create('Ext.form.field.Display', {
		name: 'vmid',
		value: me.vmid,
		fieldLabel: me.vmtype === 'lxc' ? 'CT' : 'VM',
	    });
	} else {
	    IDfield = Ext.create('PVE.form.GuestIDSelector', {
		name: 'vmid',
		guestType: me.vmtype,
		loadNextFreeID: true,
		validateExists: false,
	    });
	}

	var items = [
	    {
		xtype: 'displayfield',
		value: me.volidText || me.volid,
		fieldLabel: gettext('Source'),
	    },
	    storagesel,
	    IDfield,
	    {
		xtype: 'pveBandwidthField',
		name: 'bwlimit',
		backendUnit: 'KiB',
		allowZero: true,
		fieldLabel: gettext('Bandwidth Limit'),
		emptyText: gettext('Defaults to target storage restore limit'),
		autoEl: {
		    tag: 'div',
		    'data-qtip': gettext("Use '0' to disable all bandwidth limits."),
		},
	    },
	    {
		xtype: 'fieldcontainer',
		layout: 'hbox',
		items: [{
		    xtype: 'proxmoxcheckbox',
		    name: 'unique',
		    fieldLabel: gettext('Unique'),
		    hidden: !!me.vmid,
		    flex: 1,
		    autoEl: {
			tag: 'div',
			'data-qtip': gettext('Autogenerate unique properties, e.g., MAC addresses'),
		    },
		    checked: false,
		},
		{
		    xtype: 'proxmoxcheckbox',
		    name: 'start',
		    reference: 'start',
		    flex: 1,
		    fieldLabel: gettext('Start after restore'),
		    labelWidth: 105,
		    checked: false,
		}],
	    },
	];

	if (me.vmtype === 'lxc') {
	    items.push(
		{
		    xtype: 'radiogroup',
		    fieldLabel: gettext('Privilege Level'),
		    reference: 'noVNCScalingGroup',
		    height: '15px', // renders faster with value assigned
		    layout: {
			type: 'hbox',
			algin: 'stretch',
		    },
		    autoEl: {
			tag: 'div',
			'data-qtip':
			    gettext('Choose if you want to keep or override the privilege level of the restored Container.'),
		    },
		    items: [
			{
			    xtype: 'radiofield',
			    name: 'unprivileged',
			    inputValue: 'keep',
			    boxLabel: gettext('From Backup'),
			    flex: 1,
			    checked: true,
			},
			{
			    xtype: 'radiofield',
			    name: 'unprivileged',
			    inputValue: '1',
			    boxLabel: gettext('Unprivileged'),
			    flex: 1,
			},
			{
			    xtype: 'radiofield',
			    name: 'unprivileged',
			    inputValue: '0',
			    boxLabel: gettext('Privileged'),
			    flex: 1,
			    //margin: '0 0 0 10',
			},
		    ],
		},
	    );
	} else if (me.vmtype === 'qemu') {
	    items.push({
		xtype: 'proxmoxcheckbox',
		name: 'live-restore',
		itemId: 'liveRestore',
		flex: 1,
		fieldLabel: gettext('Live restore'),
		checked: false,
		hidden: !me.isPBS,
		// align checkbox with 'start' if 'unique' is hidden
		labelWidth: me.vmid ? 105 : 100,
	    });
	    items.push({
		xtype: 'displayfield',
		reference: 'liveWarning',
		// TODO: Remove once more tested/stable?
		value: gettext('Note: If anything goes wrong during the live-restore, new data written by the VM will be lost.'),
		userCls: 'pmx-hint',
		hidden: true,
	    });
	}

	me.formPanel = Ext.create('Ext.form.Panel', {
	    bodyPadding: 10,
	    border: false,
	    fieldDefaults: {
		labelWidth: 100,
		anchor: '100%',
	    },
	    items: items,
	});

	var form = me.formPanel.getForm();

	var doRestore = function(url, params) {
	    Proxmox.Utils.API2Request({
		url: url,
		params: params,
		method: 'POST',
		waitMsgTarget: me,
		failure: function(response, opts) {
		    Ext.Msg.alert(gettext('Error'), response.htmlStatus);
		},
		success: function(response, options) {
		    var upid = response.result.data;

		    var win = Ext.create('Proxmox.window.TaskViewer', {
			upid: upid,
		    });
		    win.show();
		    me.close();
		},
	    });
	};

	var submitBtn = Ext.create('Ext.Button', {
	    text: gettext('Restore'),
	    handler: function() {
		var values = form.getValues();

		var params = {
		    vmid: me.vmid || values.vmid,
		    force: me.vmid ? 1 : 0,
		};
		if (values.unique) { params.unique = 1; }
		if (values.start && !values['live-restore']) { params.start = 1; }
		if (values['live-restore']) { params['live-restore'] = 1; }
		if (values.storage) { params.storage = values.storage; }

		if (values.bwlimit !== undefined) {
		    params.bwlimit = values.bwlimit;
		}

		var url;
		var msg;
		if (me.vmtype === 'lxc') {
		    url = '/nodes/' + me.nodename + '/lxc';
		    params.ostemplate = me.volid;
		    params.restore = 1;
		    if (values.unprivileged !== 'keep') {
			params.unprivileged = values.unprivileged;
		    }
		    msg = Proxmox.Utils.format_task_description('vzrestore', params.vmid);
		} else if (me.vmtype === 'qemu') {
		    url = '/nodes/' + me.nodename + '/qemu';
		    params.archive = me.volid;
		    msg = Proxmox.Utils.format_task_description('qmrestore', params.vmid);
		} else {
		    throw 'unknown VM type';
		}

		if (me.vmid) {
		    msg += '. ' + gettext('This will permanently erase current VM data.');
		    Ext.Msg.confirm(gettext('Confirm'), msg, function(btn) {
			if (btn !== 'yes') {
			    return;
			}
			doRestore(url, params);
		    });
		} else {
		    doRestore(url, params);
		}
	    },
	});

	form.on('validitychange', function(f, valid) {
	    submitBtn.setDisabled(!valid);
	});

	var title = gettext('Restore') + ": " + (
	    me.vmtype === 'lxc' ? 'CT' : 'VM');

	if (me.vmid) {
	    title += " " + me.vmid;
	}

	Ext.apply(me, {
	    title: title,
	    width: 500,
	    modal: true,
	    layout: 'auto',
	    border: false,
	    items: [me.formPanel],
	    buttons: [submitBtn],
	});

	me.callParent();
    },
});
