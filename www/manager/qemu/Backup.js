Ext.define('PVE.qemu.Backup', {
    extend: 'Ext.window.Window',

    resizable: false,

    initComponent : function() {
	var me = this;

	if (!me.nodename) {
	    throw "no node name specified";
	}

	if (!me.vmid) {
	    throw "no VM ID specified";
	}

	var storagesel = Ext.create('PVE.form.StorageSelector', {
	    nodename: me.nodename,
	    name: 'storage',
	    value: me.storage,
	    fieldLabel: 'Storage',
	    storageContent: 'backup',
	    allowBlank: false
	});

	me.formPanel = Ext.create('Ext.form.Panel', {
	    bodyPadding: 10,
	    border: false,
	    fieldDefaults: {
		labelWidth: 100,
		anchor: '100%'
	    },
	    items: [
		storagesel,
		{
		    xtype: 'pvecheckbox',
		    name: 'compress',
		    uncheckedValue: 0,
		    value: 1,
		    fieldLabel: 'Compress'
		},
		{
		    xtype: 'pvecheckbox',
		    name: 'snapshot',
		    uncheckedValue: 0,
		    value: 1,
		    fieldLabel: 'Snapshot mode'
		}
	    ]
	});

	var form = me.formPanel.getForm();

	var submitBtn = Ext.create('Ext.Button', {
	    text: 'Backup',
	    handler: function(){
		var storage = storagesel.getValue();
		var msg = 'Start backup to storage "' + storage + '"';
		var values = form.getValues();
		console.dir(me.vmid, me.nodename, values.online);
		
		PVE.Utils.API2Request({
		    url: '/nodes/' + me.nodename + '/vzdump',
		    params: {
			storage: storage,
			vmid: me.vmid,
			compress: values.compress,
			snapshot: values.snapshot
		    },
		    method: 'POST',
		    failure: function (response, opts) {
			Ext.Msg.alert('Error',response.htmlStatus);
		    },
		    success: function(response, options) {
			var upid = response.result.data;
			
			var win = Ext.create('PVE.window.TaskViewer', { 
			    upid: upid
			});
			win.show();
			me.close();
		    }
		});
	    }
	});

	Ext.apply(me, {
	    title: "Backup VM " + me.vmid,
	    width: 350,
	    modal: true,
	    layout: 'auto',
	    border: false,
	    items: [ me.formPanel ],
	    buttons: [ submitBtn ],
	});

	me.callParent();
    }
});

Ext.define('PVE.qemu.BackupView', {
    extend: 'Ext.grid.GridPanel',

    alias: ['widget.pveQemuBackupView'],


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
		var win = Ext.create('PVE.qemu.Backup', { 
		    nodename: nodename,
		    vmid: vmid,
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

		console.log("RESRORE " + volid);
	    }
	});

	var set_button_status = function() {
	    var sm = me.getSelectionModel();
	    var rec = sm.getSelection()[0];

	    restore_btn.setDisabled(!(rec && rec.data.volid));
	}

	Ext.apply(me, {
	    stateful: false,
	    tbar: [ backup_btn, restore_btn, '->', storagesel ],
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

	//setStorage('local');
    }
});
