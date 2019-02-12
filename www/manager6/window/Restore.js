Ext.define('PVE.window.Restore', {
    extend: 'Ext.window.Window', // fixme: Proxmox.window.Edit?

    resizable: false,

    initComponent : function() {
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
	    storageContent: (me.vmtype === 'lxc') ? 'rootdir' : 'images',
	    allowBlank: true
	});

	var IDfield;
	if (me.vmid) {
	    IDfield = Ext.create('Ext.form.field.Display', {
		name: 'vmid',
		value: me.vmid,
		fieldLabel: (me.vmtype === 'lxc') ? 'CT' : 'VM'
	    });
	} else {
	    IDfield = Ext.create('PVE.form.GuestIDSelector', {
		name: 'vmid',
		guestType: me.vmtype,
		loadNextGuestID: true,
		validateExists: false
	    });
	}

	var items = [
	    {
		xtype: 'displayfield',
		value: me.volidText || me.volid,
		fieldLabel: gettext('Source')
	    },
	    storagesel,
	    IDfield,
	    {
		xtype: 'proxmoxintegerfield',
		name: 'bwlimit',
		fieldLabel: gettext('Read Limit (MiB/s)'),
		minValue: 0,
		emptyText: gettext('Defaults to target storage restore limit'),
		autoEl: {
		    tag: 'div',
		    'data-qtip': gettext("Use '0' to disable all bandwidth limits.")
		}
	    }
	];

	if (me.vmtype === 'lxc') {
	    items.push({
		xtype: 'proxmoxcheckbox',
		name: 'unprivileged',
		value: true,
		fieldLabel: gettext('Unprivileged container')
	    });
	}

	me.formPanel = Ext.create('Ext.form.Panel', {
	    bodyPadding: 10,
	    border: false,
	    fieldDefaults: {
		labelWidth: 100,
		anchor: '100%'
	    },
	    items: items
	});

	var form = me.formPanel.getForm();

	var doRestore = function(url, params) {
	    Proxmox.Utils.API2Request({
		url: url,
		params: params,
		method: 'POST',
		waitMsgTarget: me,
		failure: function (response, opts) {
		    Ext.Msg.alert(gettext('Error'), response.htmlStatus);
		},
		success: function(response, options) {
		    var upid = response.result.data;
		    
		    var win = Ext.create('Proxmox.window.TaskViewer', {
			upid: upid
		    });
		    win.show();
		    me.close();
		}
	    });
	};

	var submitBtn = Ext.create('Ext.Button', {
	    text: gettext('Restore'),
	    handler: function(){
		var storage = storagesel.getValue();
		var values = form.getValues();

		var params = {
		    storage: storage,
		    vmid: me.vmid || values.vmid,
		    force: me.vmid ? 1 : 0
		};

		if (values.bwlimit !== undefined) {
		    params.bwlimit = values.bwlimit * 1024;
		}

		var url;
		var msg;
		if (me.vmtype === 'lxc') {
		    url = '/nodes/' + me.nodename + '/lxc';
		    params.ostemplate = me.volid;
		    params.restore = 1;
		    if (values.unprivileged) { params.unprivileged = 1; }
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
	    }
	});

	form.on('validitychange', function(f, valid) {
	    submitBtn.setDisabled(!valid);
	});

	var title =  gettext('Restore') + ": " + (
	    (me.vmtype === 'lxc') ? 'CT' : 'VM');

	if (me.vmid) {
	    title += " " + me.vmid;
	}

	Ext.apply(me, {
	    title: title,
	    width: 500,
	    modal: true,
	    layout: 'auto',
	    border: false,
	    items: [ me.formPanel ],
	    buttons: [ submitBtn ]
	});

	me.callParent();
    }
});
