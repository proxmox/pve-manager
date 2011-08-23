Ext.define('PVE.dc.StorageView', {
    extend: 'Ext.grid.GridPanel',

    alias: ['widget.pveStorageView'],

    initComponent : function() {
	var me = this;

	var store = new Ext.data.Store({
	    model: 'pve-storage',
	    proxy: {
                type: 'pve',
		url: "/api2/json/storage"
	    },
	    sorters: { 
		property: 'storage', 
		order: 'DESC' 
	    }
	});

	var reload = function() {
	    store.load();
	};

	var run_editor = function() {
	    var sm = me.getSelectionModel();
	    var rec = sm.getSelection()[0];
	    if (!rec) {
		return;
	    }
	    var type = rec.data.type;
	    
	    var editor;
	    if (type === 'dir') {
		editor = 'PVE.storage.DirEdit';
	    } else if (type === 'nfs') {
		editor = 'PVE.storage.NFSEdit';
	    } else if (type === 'lvm') {
		editor = 'PVE.storage.LVMEdit';
	    } else if (type === 'iscsi') {
		editor = 'PVE.storage.IScsiEdit';
	    } else {
		return;
	    }
	    var win = Ext.create(editor, {
		storageId: rec.data.storage
	    });

	    win.show();
	    win.on('destroy', reload);
	};
	
	var edit_btn = new Ext.Button({
	    text: 'Edit',
	    disabled: true,
	    handler: run_editor
	});

	var remove_btn = new Ext.Button({
	    text: 'Remove',
	    disabled: true,
	    handler: function(){
		var sm = me.getSelectionModel();
		var rec = sm.getSelection()[0];

		if (!rec) {
		    return;
		}

		var msg = "Are you sure you want to remove storage: '" + 
		    rec.data.storage + "'";

		Ext.Msg.confirm('Deletion Confirmation', msg, function(btn) {
		    if (btn !== 'yes') {
			return;
		    }
		    PVE.Utils.API2Request({
			url: '/storage/' + rec.data.storage,
			method: 'DELETE',
			waitMsgTarget: me,
			callback: function() {
			    reload();
			},
			failure: function (response, opts) {
			    Ext.Msg.alert('Error', response.htmlStatus);
			}
		    });
		});
	    }
	});

	var set_button_status = function() {
	    var sm = me.getSelectionModel();
	    var rec = sm.getSelection()[0];

	    if (!rec) {
		remove_btn.disable();
		edit_btn.disable();
		return;
	    }

	    edit_btn.setDisabled(false);

	    remove_btn.setDisabled(rec.data.storage === 'local');
	};

	Ext.apply(me, {
	    store: store,
	    stateful: false,
	    viewConfig: {
		trackOver: false
	    },
	    tbar: [ 
		{
		    text: 'Add',
		    menu: new Ext.menu.Menu({
			items: [
			    {
				text: 'Directory',
				iconCls: 'pve-itype-icon-itype',
				handler: function() {
				    var win = Ext.create('PVE.storage.DirEdit', {});
				    win.on('destroy', reload);
				    win.show();
				}

			    },
			    {
				text: 'LVM group',
				handler: function() {
				    var win = Ext.create('PVE.storage.LVMEdit', {});
				    win.on('destroy', reload);
				    win.show();
				}
			    },
			    {
				text: 'NFS share',
				iconCls: 'pve-itype-icon-node',
				handler: function() {
				    var win = Ext.create('PVE.storage.NFSEdit', {});
				    win.on('destroy', reload);
				    win.show();
				}
			    },
			    {
				text: 'iSCSI target',
				iconCls: 'pve-itype-icon-node',
				handler: function() {
				    var win = Ext.create('PVE.storage.IScsiEdit', {});
				    win.on('destroy', reload);
				    win.show();
				}
			    }
			]
		    })
		},
		remove_btn,
		edit_btn
	    ],
	    columns: [
		{
		    header: 'Storage ID',
		    width: 100,
		    sortable: true,
		    dataIndex: 'storage'
		},
		{
		    header: 'Type',
		    width: 60,
		    sortable: true,
		    dataIndex: 'type',
		    renderer: PVE.Utils.format_storage_type
		},
		{
		    header: 'Content',
		    width: 150,
		    sortable: true,
		    dataIndex: 'content',
		    renderer: PVE.Utils.format_content_types
		},
		{
		    header: 'Path/Target',
		    flex: 1,
		    sortable: true,
		    dataIndex: 'path',
		    renderer: function(value, metaData, record) {
			if (record.data.target) {
			    return record.data.target;
			}
			return value;
		    }
		},
		{
		    header: 'Shared',
		    width: 80,
		    sortable: true,
		    dataIndex: 'shared',
		    renderer: PVE.Utils.format_boolean
		},
		{
		    header: 'Enable',
		    width: 80,
		    sortable: true,
		    dataIndex: 'disable',
		    renderer: PVE.Utils.format_neg_boolean
		}
	    ],
	    listeners: {
		show: reload,
		itemdblclick: run_editor,
		selectionchange: set_button_status
	    }
	});

	me.callParent();
    }
}, function() {

    Ext.define('pve-storage', {
	extend: 'Ext.data.Model',
	fields: [ 
	    'path', 'type', 'content', 'server', 'portal', 'target', 'export', 'storage',
	    { name: 'shared', type: 'boolean'},
	    { name: 'disable', type: 'boolean'} 
	],
	idProperty: 'storage'
    });

});