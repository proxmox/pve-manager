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
    }
});
