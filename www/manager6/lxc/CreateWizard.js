/*global
  FileReader
*/

Ext.define('PVE.lxc.CreateWizard', {
    extend: 'PVE.window.Wizard',

    loadSSHKeyFromFile: function(file) {
	var me = this;
	// ssh-keygen produces 740 bytes for an average 4096 bit rsa key, with
	// a user@host comment, 1420 for 8192 bits; current max is 16kbit
	// assume: 740*8 for max. 32kbit (5920 byte file)
	// round upwards to nearest nice number => 8192 bytes, leaves lots of comment space
	if (file.size > 8192) {
	    Ext.Msg.alert(gettext('Error'), gettext("Invalid file size: ") + file.size);
	    return;
	}
	var reader = new FileReader();
	reader.onload = function(evt) {
	    me.sshkeyfield.setValue(evt.target.result);
	};
	reader.readAsText(file);
    },

    initComponent: function() {
	var me = this;

	var summarystore = Ext.create('Ext.data.Store', {
	    model: 'KeyValue',
	    sorters: [
		{
		    property : 'key',
		    direction: 'ASC'
		}
	    ]
	});

	var tmplsel = Ext.create('PVE.form.FileSelector', {
	    name: 'ostemplate',
	    storageContent: 'vztmpl',
	    fieldLabel: gettext('Template'),
	    allowBlank: false
	});

	var tmplstoragesel = Ext.create('PVE.form.StorageSelector', {
	    name: 'tmplstorage',
	    fieldLabel: gettext('Storage'),
	    storageContent: 'vztmpl',
	    autoSelect: true,
	    allowBlank: false,
	    listeners: {
		change: function(f, value) {
		    tmplsel.setStorage(value);
		}
	    }
	});

	var rootfspanel = Ext.create('PVE.lxc.MountPointInputPanel', {
	    title: gettext('Root Disk'),
	    insideWizard: true,
	    isCreate: true,
	    unused: false,
	    unprivileged: false,
	    confid: 'rootfs'
	});

	var networkpanel = Ext.create('PVE.lxc.NetworkInputPanel', {
	    title: gettext('Network'),
	    insideWizard: true,
	    dataCache: {},
	    isCreate: true
	});

	var passwordfield = Ext.createWidget('textfield', {
	    inputType: 'password',
	    name: 'password',
	    value: '',
	    fieldLabel: gettext('Password'),
	    allowBlank: false,
	    minLength: 5,
	    change: function(f, value) {
		if (!me.rendered) {
		    return;
		}
		me.down('field[name=confirmpw]').validate();
	    }
	});

	/*jslint confusion: true */
	/* the validator function can return either a string or a boolean */
	me.sshkeyfield = Ext.createWidget('pvetextfield', {
	    name: 'ssh-public-keys',
	    value: '',
	    fieldLabel: gettext('SSH public key'),
	    allowBlank: true,
	    validator: function(value) {
		if (value.length) {
		    var key = PVE.Parser.parseSSHKey(value);
		    if (!key) {
			return "Failed to recognize ssh key";
		    }
		    me.down('field[name=password]').allowBlank = true;
		} else {
		    me.down('field[name=password]').allowBlank = false;
		}
		me.down('field[name=password]').validate();
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
		me.sshkeyfield.inputEl.on('dragover', cancel);
		me.sshkeyfield.inputEl.on('dragenter', cancel);
		me.sshkeyfield.inputEl.on('drop', function(ev) {
		    ev = ev.event;
		    if (ev.preventDefault) {
			ev.preventDefault();
		    }
		    var files = ev.dataTransfer.files;
		    me.loadSSHKeyFromFile(files[0]);
		});
	    }
	});

	var column2 = [
	    {
		xtype: 'pvePoolSelector',
		fieldLabel: gettext('Resource Pool'),
		name: 'pool',
		value: '',
		allowBlank: true
	    },
	    passwordfield,
	    {
		xtype: 'textfield',
		inputType: 'password',
		name: 'confirmpw',
		value: '',
		fieldLabel: gettext('Confirm password'),
		allowBlank: true,
		validator: function(value) {
		    var pw = me.down('field[name=password]').getValue();
		    if (pw !== value) {
			return "Passwords do not match!";
		    }
		    return true;
		}
	    },
	    me.sshkeyfield
	];
	/*jslint confusion: false */

	if (window.FileReader) {
	    column2.push({
		xtype: 'filebutton',
		name: 'file',
		text: gettext('Load SSH Key File'),
		listeners: {
		    change: function(btn, e, value) {
			e = e.event;
			me.loadSSHKeyFromFile(e.target.files[0]);
			btn.reset();
		    }
		}
	    });
	}

	Ext.applyIf(me, {
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
			    selectCurNode: !me.nodename,
			    preferredValue: me.nodename,
			    fieldLabel: gettext('Node'),
			    allowBlank: false,
			    onlineValidator: true,
			    listeners: {
				change: function(f, value) {
				    tmplstoragesel.setNodename(value);
				    tmplsel.setStorage(undefined, value);
				    networkpanel.setNodename(value);
				    rootfspanel.setNodename(value);
				}
			    }
			},
			{
			    xtype: 'pveGuestIDSelector',
			    name: 'vmid', // backend only knows vmid
			    guestType: 'lxc',
			    value: '',
			    loadNextFreeID: true,
			    validateExists: false
			},
			{
			    xtype: 'pvetextfield',
			    name: 'hostname',
			    vtype: 'DnsName',
			    value: '',
			    fieldLabel: gettext('Hostname'),
			    skipEmptyText: true,
			    allowBlank: true
			},
			{
			    xtype: 'pvecheckbox',
			    name: 'unprivileged',
			    value: '',
			    listeners: {
				change: function(f, value) {
				    if (value) {
					rootfspanel.down('field[name=quota]').setValue(false);
				    }
				    rootfspanel.unprivileged = value;
				    var hdsel = rootfspanel.down('#hdstorage');
				    hdsel.fireEvent('change', hdsel, hdsel.getValue());
				}
			    },
			    fieldLabel: gettext('Unprivileged container')
			}
		    ],
		    column2: column2,
		    onGetValues: function(values) {
			delete values.confirmpw;
			if (!values.pool) {
			    delete values.pool;
			}
			return values;
		    }
		},
		{
		    xtype: 'inputpanel',
		    title: gettext('Template'),
		    onlineHelp: 'pct_container_images',
		    column1: [ tmplstoragesel, tmplsel]
		},
		rootfspanel,
		{
		    xtype: 'pveLxcCPUInputPanel',
		    title: gettext('CPU'),
		    insideWizard: true
		},
		{
		    xtype: 'pveLxcMemoryInputPanel',
		    title: gettext('Memory'),
		    insideWizard: true
		},
		networkpanel,
		{
		    xtype: 'pveLxcDNSInputPanel',
		    title: gettext('DNS'),
		    insideWizard: true
		},
		{
		    title: gettext('Confirm'),
		    layout: 'fit',
		    items: [
			{
			    xtype: 'grid',
			    store: summarystore,
			    columns: [
				{header: 'Key', width: 150, dataIndex: 'key'},
				{header: 'Value', flex: 1, dataIndex: 'value'}
			    ]
			}
		    ],
		    listeners: {
			show: function(panel) {
			    var form = me.down('form').getForm();
			    var kv = me.getValues();
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
			    summarystore.suspendEvents();
			    summarystore.removeAll();
			    summarystore.add(data);
			    summarystore.sort();
			    summarystore.resumeEvents();
			    summarystore.fireEvent('refresh');
			}
		    },
		    onSubmit: function() {
			var kv = me.getValues();
			delete kv['delete'];

			var nodename = kv.nodename;
			delete kv.nodename;
			delete kv.tmplstorage;

			if (!kv.password.length && kv['ssh-public-keys']) {
			    delete kv.password;
			}

			PVE.Utils.API2Request({
			    url: '/nodes/' + nodename + '/lxc',
			    waitMsgTarget: me,
			    method: 'POST',
			    params: kv,
			    success: function(response, opts){
				var upid = response.result.data;

				var win = Ext.create('PVE.window.TaskViewer', {
				    upid: upid
				});
				win.show();
				me.close();
			    },
			    failure: function(response, opts) {
				Ext.Msg.alert(gettext('Error'), response.htmlStatus);
			    }
			});
		    }
		}
	    ]
	});

	me.callParent();
    }
});



