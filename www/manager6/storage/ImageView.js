Ext.define('PVE.storage.ImageView', {
    extend: 'PVE.storage.ContentView',

    alias: 'widget.pveStorageImageView',

    initComponent: function() {
	var me = this;

	var nodename = me.nodename = me.pveSelNode.data.node;
	if (!me.nodename) {
	    throw "no node name specified";
	}

	var storage = me.storage = me.pveSelNode.data.storage;
	if (!me.storage) {
	    throw "no storage ID specified";
	}

	if (!me.content || (me.content !== 'images' && me.content !== 'rootdir')) {
	    throw "content needs to be either 'images' or 'rootdir'";
	}

	var sm = me.sm = Ext.create('Ext.selection.RowModel', {});

	var reload = function() {
	    me.store.load();
	}

	me.tbar = [
	    {
		xtype: 'proxmoxButton',
		selModel: sm,
		text: gettext('Remove'),
		disabled: true,
		handler: function(btn, event, rec) {
		    var url = "/nodes/" + nodename + "/storage/" + storage +
			      "/content" + '/' + rec.data.volid;
		    var vmid = rec.data.vmid;

		    var store = PVE.data.ResourceStore;

		    if (vmid && store.findVMID(vmid)) {
			var guest_node = store.guestNode(vmid);
			var storage_path = 'storage/' + nodename + '/' + storage;

			// allow to delete local backed images if a VMID exists on another node.
			if (store.storageIsShared(storage_path) || guest_node == nodename) {
			    var msg = Ext.String.format(
				gettext("Cannot remove image, a guest with VMID '{0}' exists!"), vmid);
			    msg += '<br />' + gettext("You can delete the image from the guest's hardware pane");

			    Ext.Msg.show({
				title: gettext('Cannot remove disk image.'),
				icon: Ext.Msg.ERROR,
				msg: msg
			    });
			    return;
			}
		    }
		    var win = Ext.create('PVE.window.SafeDestroy', {
			title: Ext.String.format(gettext("Destroy '{0}'"), rec.data.volid),
			showProgress: true,
			url: url,
			item: { type: 'Image', id: vmid }
		    }).show();
		    win.on('destroy', function() {
			reload();
		    });
		}
	    },
	];
	me.useCustomRemoveButton = true;

	me.callParent();
    },
});
