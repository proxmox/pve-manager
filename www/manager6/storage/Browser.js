Ext.define('PVE.storage.Browser', {
    extend: 'PVE.panel.Config',
    alias: 'widget.PVE.storage.Browser',

    onlineHelp: 'chapter_storage',

    initComponent: function() {
        var me = this;

	var nodename = me.pveSelNode.data.node;
	if (!nodename) {
	    throw "no node name specified";
	}

	var storeid = me.pveSelNode.data.storage;
	if (!storeid) {
	    throw "no storage ID specified";
	}


	me.items = [
	    {
		title: gettext('Summary'),
		xtype: 'pveStorageSummary',
		iconCls: 'fa fa-book',
		itemId: 'summary'
	    }
	];

	var caps = Ext.state.Manager.get('GuiCap');

	Ext.apply(me, {
	    title: Ext.String.format(gettext("Storage {0} on node {1}"),
				     "'" + storeid + "'", "'" + nodename + "'"),
	    hstateid: 'storagetab'
	});

	// call here, so there is a root for insertNodes()
	me.callParent();

	if (caps.storage['Datastore.Allocate'] ||
	    caps.storage['Datastore.AllocateSpace'] ||
	    caps.storage['Datastore.Audit']) {

	    Proxmox.Utils.API2Request({
		url: "/nodes/" + nodename + "/storage/" + storeid + "/status",
		method: 'GET',
		success: function(response, opts) {
		    var contents = response.result.data.content.split(',');
		    var items = [];

		    if (contents.includes('backup')) {
			items.push({
			    xtype: 'pveStorageContentView',
			    title: gettext('Backups'),
			    iconCls: 'fa fa-floppy-o',
			    itemId: 'contentBackup',
			    content: 'backup',
			    stateful: true,
			    stateId: 'grid-storage-content-backup',
			});
		    }
		    if (contents.includes('images')) {
			items.push({
			    xtype: 'pveStorageContentView',
			    title: gettext('Disk Images'),
			    iconCls: 'fa fa-hdd-o',
			    itemId: 'contentImages',
			    content: 'images',
			    stateful: true,
			    stateId: 'grid-storage-content-images',
			});
		    }
		    if (contents.includes('iso')) {
			items.push({
			    xtype: 'pveStorageContentView',
			    title: gettext('ISO Images'),
			    iconCls: 'pve-itype-treelist-item-icon-cdrom',
			    itemId: 'contentIso',
			    content: 'iso',
			    stateful: true,
			    stateId: 'grid-storage-content-iso',
			    useUploadButton: true,
			});
		    }
		    if (contents.includes('rootdir')) {
			items.push({
			    xtype: 'pveStorageContentView',
			    title: gettext('Container Data'),
			    iconCls: 'fa fa-hdd-o',
			    itemId: 'contentRootdir',
			    content: 'rootdir',
			    stateful: true,
			    stateId: 'grid-storage-content-rootdir',
			});
		    }
		    if (contents.includes('snippets')) {
			items.push({
			    xtype: 'pveStorageContentView',
			    title: gettext('Snippets'),
			    iconCls: 'fa fa-file-code-o',
			    itemId: 'contentSnippets',
			    content: 'snippets',
			    stateful: true,
			    stateId: 'grid-storage-content-snippets',
			});
		    }
		    if (contents.includes('vztmpl')) {
			items.push({
			    xtype: 'pveStorageTemplateView',
			    title: gettext('Container Templates'),
			    iconCls: 'fa fa-file-o lxc',
			    itemId: 'contentVztmpl',
			});
		    }
		    me.insertNodes(items);
		},
	    });
	}

	if (caps.storage['Permissions.Modify']) {
	    me.insertNodes([
		{
		    xtype: 'pveACLView',
		    title: gettext('Permissions'),
		    iconCls: 'fa fa-unlock',
		    itemId: 'permissions',
		    path: '/storage/' + storeid
		},
	    ]);
	}
   }
});
