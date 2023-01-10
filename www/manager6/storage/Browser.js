Ext.define('PVE.storage.Browser', {
    extend: 'PVE.panel.Config',
    alias: 'widget.PVE.storage.Browser',

    onlineHelp: 'chapter_storage',

    initComponent: function() {
        let me = this;

	let nodename = me.pveSelNode.data.node;
	if (!nodename) {
	    throw "no node name specified";
	}

	let storeid = me.pveSelNode.data.storage;
	if (!storeid) {
	    throw "no storage ID specified";
	}

	me.items = [
	    {
		title: gettext('Summary'),
		xtype: 'pveStorageSummary',
		iconCls: 'fa fa-book',
		itemId: 'summary',
	    },
	];

	let caps = Ext.state.Manager.get('GuiCap');

	Ext.apply(me, {
	    title: Ext.String.format(gettext("Storage {0} on node {1}"), `'${storeid}'`, `'${nodename}'`),
	    hstateid: 'storagetab',
	});

	if (
	    caps.storage['Datastore.Allocate'] ||
	    caps.storage['Datastore.AllocateSpace'] ||
	    caps.storage['Datastore.Audit']
	) {
	    let storageInfo = PVE.data.ResourceStore.findRecord(
		'id',
		`storage/${nodename}/${storeid}`,
		0, // startIndex
		false, // anyMatch
		true, // caseSensitive
		true, // exactMatch
	    );
	    let res = storageInfo.data;
	    let plugin = res.plugintype;
	    let contents = res.content.split(',');

	    let enableUpload = !!caps.storage['Datastore.AllocateTemplate'];
	    let enableDownloadUrl = enableUpload && !!(caps.nodes['Sys.Audit'] && caps.nodes['Sys.Modify']);

	    if (contents.includes('backup')) {
		me.items.push({
		    xtype: 'pveStorageBackupView',
		    title: gettext('Backups'),
		    iconCls: 'fa fa-floppy-o',
		    itemId: 'contentBackup',
		    pluginType: plugin,
		});
	    }
	    if (contents.includes('images')) {
		me.items.push({
		    xtype: 'pveStorageImageView',
		    title: gettext('VM Disks'),
		    iconCls: 'fa fa-hdd-o',
		    itemId: 'contentImages',
		    content: 'images',
		    pluginType: plugin,
		});
	    }
	    if (contents.includes('rootdir')) {
		me.items.push({
		    xtype: 'pveStorageImageView',
		    title: gettext('CT Volumes'),
		    iconCls: 'fa fa-hdd-o lxc',
		    itemId: 'contentRootdir',
		    content: 'rootdir',
		    pluginType: plugin,
		});
	    }
	    if (contents.includes('iso')) {
		me.items.push({
		    xtype: 'pveStorageContentView',
		    title: gettext('ISO Images'),
		    iconCls: 'pve-itype-treelist-item-icon-cdrom',
		    itemId: 'contentIso',
		    content: 'iso',
		    pluginType: plugin,
		    enableUploadButton: enableUpload,
		    enableDownloadUrlButton: enableDownloadUrl,
		    useUploadButton: true,
		});
	    }
	    if (contents.includes('vztmpl')) {
		me.items.push({
		    xtype: 'pveStorageTemplateView',
		    title: gettext('CT Templates'),
		    iconCls: 'fa fa-file-o lxc',
		    itemId: 'contentVztmpl',
		    pluginType: plugin,
		    enableUploadButton: enableUpload,
		    enableDownloadUrlButton: enableDownloadUrl,
		    useUploadButton: true,
		});
	    }
	    if (contents.includes('snippets')) {
		me.items.push({
		    xtype: 'pveStorageContentView',
		    title: gettext('Snippets'),
		    iconCls: 'fa fa-file-code-o',
		    itemId: 'contentSnippets',
		    content: 'snippets',
		    pluginType: plugin,
		});
	    }
	}

	if (caps.storage['Permissions.Modify']) {
	    me.items.push({
		xtype: 'pveACLView',
		title: gettext('Permissions'),
		iconCls: 'fa fa-unlock',
		itemId: 'permissions',
		path: `/storage/${storeid}`,
	    });
	}

	me.callParent();
   },
});
