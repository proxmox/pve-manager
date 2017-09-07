
Ext.define('PVE.dc.StorageView', {
    extend: 'Ext.grid.GridPanel',

    alias: ['widget.pveStorageView'],

    onlineHelp: 'chapter_storage',

    stateful: true,
    stateId: 'grid-dc-storage',

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
	    } else if (type === 'lvmthin') {
		editor = 'PVE.storage.LvmThinEdit';
	    } else if (type === 'iscsi') {
		editor = 'PVE.storage.IScsiEdit';
	    } else if (type === 'rbd') {
		editor = 'PVE.storage.RBDEdit';
	    } else if (type === 'sheepdog') {
		editor = 'PVE.storage.SheepdogEdit';
	    } else if (type === 'zfs') {
		editor = 'PVE.storage.ZFSEdit';
	    } else if (type === 'zfspool') {
		editor = 'PVE.storage.ZFSPoolEdit';
	    } else {
		return;
	    }
	    var win = Ext.create(editor, {
		storageId: rec.data.storage,
		pveceph: !rec.data.monhost
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
	    viewConfig: {
		trackOver: false
	    },
	    tbar: [
		{
		    text: gettext('Add'),
		    menu: new Ext.menu.Menu({
			items: [
			    {
				text:  PVE.Utils.format_storage_type('dir'),
				iconCls: 'fa fa-fw fa-folder',
				handler: function() {
				    var win = Ext.create('PVE.storage.DirEdit', {});
				    win.on('destroy', reload);
				    win.show();
				}

			    },
			    {
				text:  PVE.Utils.format_storage_type('lvm'),
				iconCls: 'fa fa-fw fa-folder',
				handler: function() {
				    var win = Ext.create('PVE.storage.LVMEdit', {});
				    win.on('destroy', reload);
				    win.show();
				}
			    },
			    {
				text:  PVE.Utils.format_storage_type('lvmthin'),
				iconCls: 'fa fa-fw fa-folder',
				handler: function() {
				    var win = Ext.create('PVE.storage.LvmThinEdit', {});
				    win.on('destroy', reload);
				    win.show();
				}
			    },
			    {
				text:  PVE.Utils.format_storage_type('nfs'),
				iconCls: 'fa fa-fw fa-building',
				handler: function() {
				    var win = Ext.create('PVE.storage.NFSEdit', {});
				    win.on('destroy', reload);
				    win.show();
				}
			    },
			    {
				text: PVE.Utils.format_storage_type('iscsi'),
				iconCls: 'fa fa-fw fa-building',
				handler: function() {
				    var win = Ext.create('PVE.storage.IScsiEdit', {});
				    win.on('destroy', reload);
				    win.show();
				}
			    },
			    {
				text: PVE.Utils.format_storage_type('glusterfs'),
				iconCls: 'fa fa-fw fa-building',
				handler: function() {
				    var win = Ext.create('PVE.storage.GlusterFsEdit', {});
				    win.on('destroy', reload);
				    win.show();
				}
			    },
			    {
				text: PVE.Utils.format_storage_type('pveceph'),
				iconCls: 'fa fa-fw fa-building',
				handler: function() {
				    var win = Ext.create('PVE.storage.RBDEdit', {
					pveceph: 1
				    });
				    win.on('destroy', reload);
				    win.show();
				}
			    },
			    {
				text: PVE.Utils.format_storage_type('rbd_ext'),
				iconCls: 'fa fa-fw fa-building',
				handler: function() {
				    var win = Ext.create('PVE.storage.RBDEdit', {});
				    win.on('destroy', reload);
				    win.show();
				}
			    },
			    {
				text: PVE.Utils.format_storage_type('zfs'),
				iconCls: 'fa fa-fw fa-building',
				handler: function() {
				    var win = Ext.create('PVE.storage.ZFSEdit', {});
				    win.on('destroy', reload);
				    win.show();
				}
			    },
			    {
                                text: PVE.Utils.format_storage_type('zfspool'),
                                iconCls: 'fa fa-fw fa-folder',
                                handler: function() {
                                    var win = Ext.create('PVE.storage.ZFSPoolEdit', {});
                                    win.on('destroy', reload);
                                    win.show();
                                }
                            }

/* the following type are conidered unstable
 * so we do not enable that on the GUI for now
			    {
				text: PVE.Utils.format_storage_type('sheepdog'),
				iconCls: 'fa fa-fw fa-building',
				handler: function() {
				    var win = Ext.create('PVE.storage.SheepdogEdit', {});
				    win.on('destroy', reload);
				    win.show();
				}
			    }
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
		    header: gettext('Path') + '/' + gettext('Target'),
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
		    header: gettext('Enabled'),
		    width: 80,
		    sortable: true,
		    dataIndex: 'disable',
		    renderer: PVE.Utils.format_neg_boolean
		}
	    ],
	    listeners: {
		activate: reload,
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
