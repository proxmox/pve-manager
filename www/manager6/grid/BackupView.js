Ext.define('PVE.grid.BackupView', {
    extend: 'Ext.grid.GridPanel',

    alias: ['widget.pveBackupView'],

    onlineHelp: 'chapter_vzdump',

    initComponent : function() {
	var me = this;

	var nodename = me.pveSelNode.data.node;
	if (!nodename) {
	    throw "no node name specified";
	}

	var vmid = me.pveSelNode.data.vmid;
	if (!vmid) {
	    throw "no VM ID specified";
	}

	var vmtype = me.pveSelNode.data.type;
	if (!vmtype) {
	    throw "no VM type specified";
	}

	var filterFn;
	if (vmtype === 'openvz') {
	    filterFn = function(item) {
		return item.data.volid.match(':backup/vzdump-openvz-');
	    };
	} else if (vmtype === 'lxc') {
	    filterFn = function(item) {
		return item.data.volid.match(':backup/vzdump-lxc-');
	    };
	} else if (vmtype === 'qemu') {
	    filterFn = function(item) {
		return item.data.volid.match(':backup/vzdump-qemu-');
	    };
	} else {
	    throw "unsupported VM type '" + vmtype + "'";
	}

	me.store = Ext.create('Ext.data.Store', {
	    model: 'pve-storage-content',
	    sorters: { 
		property: 'volid', 
		order: 'DESC' 
	    },
	    filters: { filterFn: filterFn }
	});

	var reload = Ext.Function.createBuffered(function() {
	    if (me.store && me.store.proxy.url) {
		me.store.load();
	    }
	}, 100);

	var setStorage = function(storage) {
	    var url = '/api2/json/nodes/' + nodename + '/storage/' + storage + '/content';
	    url += '?content=backup';

	    me.store.setProxy({
		type: 'pve',
		url: url
	    });

	    reload();
	};

	var storagesel = Ext.create('PVE.form.StorageSelector', {
	    nodename: nodename,
	    fieldLabel: gettext('Storage'),
	    labelAlign: 'right',
	    storageContent: 'backup',
	    allowBlank: false,
	    listeners: {
		change: function(f, value) {
		    setStorage(value);
		}
	    }
	});

	var storagefilter = Ext.create('Ext.form.field.Text', {
	    fieldLabel: gettext('Search'),
	    labelWidth: 50,
	    labelAlign: 'right',
	    enableKeyEvents: true,
	    listeners: {
		buffer: 500,
		keyup: function(field) {
		    me.store.clearFilter(true);
		    me.store.filter([
			filterFn,
			{
			    property: 'volid',
			    value: field.getValue(),
			    anyMatch: true,
			    caseSensitive: false
			}
		    ]);
		}
	    }
	});

	var sm = Ext.create('Ext.selection.RowModel', {});

	var backup_btn = Ext.create('Ext.button.Button', {
	    text: gettext('Backup now'),
	    handler: function() {
		var win = Ext.create('PVE.window.Backup', { 
		    nodename: nodename,
		    vmid: vmid,
		    vmtype: vmtype,
		    storage: storagesel.getValue()
		});
		win.show();
	    }
	});

	var restore_btn = Ext.create('PVE.button.Button', {
	    text: gettext('Restore'),
	    disabled: true,
	    selModel: sm,
	    enableFn: function(rec) {
		return !!rec;
	    },
	    handler: function(b, e, rec) {
		var volid = rec.data.volid;

		var win = Ext.create('PVE.window.Restore', {
		    nodename: nodename,
		    vmid: vmid,
		    volid: rec.data.volid,
		    volidText: PVE.Utils.render_storage_content(rec.data.volid, {}, rec),
		    vmtype: vmtype
		});
		win.show();
		win.on('destroy', reload);
	    }
	});

	var delete_btn = Ext.create('PVE.button.Button', {
	    text: gettext('Remove'),
	    disabled: true,
	    selModel: sm,
	    dangerous: true,	    
	    confirmMsg: function(rec) {
		var msg = Ext.String.format(gettext('Are you sure you want to remove entry {0}'),
					    "'" + rec.data.volid + "'");
		msg += " " + gettext('This will permanently erase all data.');

		return msg;
	    },
	    enableFn: function(rec) {
		return !!rec;
	    },
	    handler: function(b, e, rec){
		var storage = storagesel.getValue();
		if (!storage) {
		    return;
		}

		var volid = rec.data.volid;
		PVE.Utils.API2Request({
		    url: "/nodes/" + nodename + "/storage/" + storage + "/content/" + volid,
		    method: 'DELETE',
		    waitMsgTarget: me,
		    failure: function(response, opts) {
			Ext.Msg.alert('Error', response.htmlStatus);
		    },
		    success: function(response, options) {
			reload();
		    }
		});
	    }
	});

	var config_btn = Ext.create('PVE.button.Button', {
	    text: gettext('Show Configuration'),
	    disabled: true,
	    selModel: sm,
	    enableFn: function(rec) {
		return !!rec;
	    },
	    handler: function(b, e, rec) {
		var storage = storagesel.getValue();
		if (!storage) {
		    return;
		}

		var win = Ext.create('PVE.window.BackupConfig', {
		    volume: rec.data.volid,
		    pveSelNode: me.pveSelNode
		});

		win.show();
	    }
	});

	Ext.apply(me, {
	    stateful: false,
	    selModel: sm,
	    tbar: [ backup_btn, restore_btn, delete_btn,config_btn, '->', storagesel, storagefilter ],
	    columns: [
		{
		    header: gettext('Name'),
		    flex: 1,
		    sortable: true,
		    renderer: PVE.Utils.render_storage_content,
		    dataIndex: 'volid'
		},
		{
		    header: gettext('Format'),
		    width: 100,
		    dataIndex: 'format'
		},
		{
		    header: gettext('Size'),
		    width: 100,
		    renderer: PVE.Utils.format_size,
		    dataIndex: 'size'
		}
	    ],
	    listeners: {
		activate: reload
	    }
	});

	me.callParent();
    }
});
