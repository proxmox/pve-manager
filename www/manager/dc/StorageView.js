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

	var sm = Ext.create('Ext.selection.RowModel', {});

	var run_editor = function() {
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
	    } else if (type === 'glusterfs') {
		editor = 'PVE.storage.GlusterFsEdit';
	    } else if (type === 'lvm') {
		editor = 'PVE.storage.LVMEdit';
	    } else if (type === 'iscsi') {
		editor = 'PVE.storage.IScsiEdit';
	    } else if (type === 'rbd') {
		editor = 'PVE.storage.RBDEdit';
	    } else if (type === 'sheepdog') {
		editor = 'PVE.storage.SheepdogEdit';
	    } else if (type === 'nexenta') {
		editor = 'PVE.storage.NexentaEdit';
	    } else {
		return;
	    }
	    var win = Ext.create(editor, {
		storageId: rec.data.storage
	    });

	    win.show();
	    win.on('destroy', reload);
	};
	
	var edit_btn = new PVE.button.Button({
	    text: gettext('Edit'),
	    disabled: true,
	    selModel: sm,
	    handler: run_editor
	});

	var remove_btn = new PVE.button.Button({
	    text: gettext('Remove'),
	    disabled: true,
	    selModel: sm,
	    confirmMsg: function (rec) {
		return Ext.String.format(gettext('Are you sure you want to remove entry {0}'),
					 "'" + rec.data.storage + "'");
	    },
	    handler: function(btn, event, rec) {
		PVE.Utils.API2Request({
		    url: '/storage/' + rec.data.storage,
		    method: 'DELETE',
		    waitMsgTarget: me,
		    callback: function() {
			reload();
		    },
		    failure: function (response, opts) {
			Ext.Msg.alert(gettext('Error'), response.htmlStatus);
		    }
		});
	    }
	});

	Ext.apply(me, {
	    store: store,
	    selModel: sm,
	    stateful: false,
	    viewConfig: {
		trackOver: false
	    },
	    tbar: [ 
		{
		    text: gettext('Add'),
		    menu: new Ext.menu.Menu({
			items: [
			    {
				text: gettext('Directory'),
				iconCls: 'pve-itype-icon-itype',
				handler: function() {
				    var win = Ext.create('PVE.storage.DirEdit', {});
				    win.on('destroy', reload);
				    win.show();
				}

			    },
			    {
				text: gettext('LVM group'),
				handler: function() {
				    var win = Ext.create('PVE.storage.LVMEdit', {});
				    win.on('destroy', reload);
				    win.show();
				}
			    },
			    {
				text: gettext('NFS share'),
				iconCls: 'pve-itype-icon-node',
				handler: function() {
				    var win = Ext.create('PVE.storage.NFSEdit', {});
				    win.on('destroy', reload);
				    win.show();
				}
			    },
			    {
				text: gettext('iSCSI target'),
				iconCls: 'pve-itype-icon-node',
				handler: function() {
				    var win = Ext.create('PVE.storage.IScsiEdit', {});
				    win.on('destroy', reload);
				    win.show();
				}
			    },
			    {
				text: gettext('GlusterFS volume'),
				iconCls: 'pve-itype-icon-node',
				handler: function() {
				    var win = Ext.create('PVE.storage.GlusterFsEdit', {});
				    win.on('destroy', reload);
				    win.show();
				}
			    },
			    {
				text: 'RBD',
				iconCls: 'pve-itype-icon-node',
				handler: function() {
				    var win = Ext.create('PVE.storage.RBDEdit', {});
				    win.on('destroy', reload);
				    win.show();
				}
			    }
/* the following type are conidered unstable
 * so we do not enable that on the GUI for now
			    {
				text: 'Sheepdog',
				iconCls: 'pve-itype-icon-node',
				handler: function() {
				    var win = Ext.create('PVE.storage.SheepdogEdit', {});
				    win.on('destroy', reload);
				    win.show();
				}
			    },
			    {
				text: 'Nexenta',
				iconCls: 'pve-itype-icon-node',
				handler: function() {
				    var win = Ext.create('PVE.storage.NexentaEdit', {});
				    win.on('destroy', reload);
				    win.show();
				}
			    },
*/
			]
		    })
		},
		remove_btn,
		edit_btn
	    ],
	    columns: [
		{
		    header: 'ID',
		    width: 100,
		    sortable: true,
		    dataIndex: 'storage'
		},
		{
		    header: gettext('Type'),
		    width: 60,
		    sortable: true,
		    dataIndex: 'type',
		    renderer: PVE.Utils.format_storage_type
		},
		{
		    header: gettext('Content'),
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
		    header: gettext('Shared'),
		    width: 80,
		    sortable: true,
		    dataIndex: 'shared',
		    renderer: PVE.Utils.format_boolean
		},
		{
		    header: gettext('Enable'),
		    width: 80,
		    sortable: true,
		    dataIndex: 'disable',
		    renderer: PVE.Utils.format_neg_boolean
		}
	    ],
	    listeners: {
		show: reload,
		itemdblclick: run_editor
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
