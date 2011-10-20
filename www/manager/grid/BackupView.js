Ext.define('PVE.grid.BackupView', {
    extend: 'Ext.grid.GridPanel',

    alias: ['widget.pveBackupView'],


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

	me.store = Ext.create('Ext.data.Store', {
	    model: 'pve-storage-content',
	    sorters: { 
		property: 'volid', 
		order: 'DESC' 
	    }
	});

	var reload = Ext.Function.createBuffered(function() {
	    if (me.store.proxy.url) {
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
	    fieldLabel: 'Storage',
	    labelAlign: 'right',
	    storageContent: 'backup',
	    allowBlank: false,
	    listeners: {
		change: function(f, value) {
		    setStorage(value);
		}
	    }
	});

	var backup_btn = new Ext.Button({
	    text: 'Backup now',
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

	var restore_btn = new Ext.Button({
	    text: 'Restore',
	    disabled: true,
	    handler: function(){
		var sm = me.getSelectionModel();
		var rec = sm.getSelection()[0];
		if (!rec) {
		    return;
		}

		var volid = rec.data.volid;

		msg = 'Are you sure you want to restore from "' + volid + '"? ' +
		    'This will permanently erase current VM data.';
		Ext.Msg.confirm('Restore Confirmation', msg, function(btn) {
		    if (btn !== 'yes') {
			return;
		    }

		    var url;
		    var params = {
			vmid: vmid, 
			force: 1
		    };

		    if (vmtype === 'openvz') {
			url = '/nodes/' + nodename + '/openvz';
			params.ostemplate = volid;
		    } else if (vmtype === 'qemu') {
			url = '/nodes/' + nodename + '/qemu';
			params.archive = volid;
		    } else {
			throw 'unknown VM type';
		    }

		    PVE.Utils.API2Request({
			url: url,
			params: params,
			method: 'POST',
			waitMsgTarget: me,
			failure: function(response, opts) {
			    Ext.Msg.alert('Error', response.htmlStatus);
			},
			success: function(response, options) {
			    var upid = response.result.data;
			
			    var win = Ext.create('PVE.window.TaskViewer', { 
				upid: upid
			    });
			    win.show();
			}
		    });
		});
	    }
	});

	var delete_btn = new Ext.Button({
	    text: 'Delete',
	    disabled: true,
	    handler: function(){
		var sm = me.getSelectionModel();
		var rec = sm.getSelection()[0];
		if (!rec) {
		    return;
		}

		var storage = storagesel.getValue();
		if (!storage) {
		    return;
		}

		var volid = rec.data.volid;

		msg = 'Are you sure you want to delete "' + volid + '"? ' +
		    'This will permanently erase all data.';
		Ext.Msg.confirm('Delete Confirmation', msg, function(btn) {
		    if (btn !== 'yes') {
			return;
		    }

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
		});
	    }
	});

	var set_button_status = function() {
	    var sm = me.getSelectionModel();
	    var rec = sm.getSelection()[0];

	    restore_btn.setDisabled(!(rec && rec.data.volid));
	    delete_btn.setDisabled(!(rec && rec.data.volid));
	}

	Ext.apply(me, {
	    stateful: false,
	    tbar: [ backup_btn, restore_btn, delete_btn, '->', storagesel ],
	    columns: [
		{
		    header: 'Name',
		    flex: 1,
		    sortable: true,
		    renderer: PVE.Utils.render_storage_content,
		    dataIndex: 'volid'
		},
		{
		    header: 'Format',
		    width: 100,
		    dataIndex: 'format'
		},
		{
		    header: 'Size',
		    width: 100,
		    renderer: PVE.Utils.format_size,
		    dataIndex: 'size'
		}
	    ],
	    listeners: {
		show: reload,
		selectionchange: set_button_status
	    }
	});

	me.callParent();
    }
});
