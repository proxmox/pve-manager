Ext.define('PVE.storage.BackupView', {
    extend: 'PVE.storage.ContentView',

    alias: 'widget.pveStorageBackupView',

    initComponent: function() {
	var me = this;

	var nodename = me.nodename = me.pveSelNode.data.node;
	if (!nodename) {
	    throw "no node name specified";
	}

	var storage = me.storage = me.pveSelNode.data.storage;
	if (!storage) {
	    throw "no storage ID specified";
	}

	me.content = 'backup';

	var sm = me.sm = Ext.create('Ext.selection.RowModel', {});

	var reload = function() {
	    me.store.load();
	};

	me.tbar = [
	    {
		xtype: 'proxmoxButton',
		text: gettext('Restore'),
		selModel: sm,
		disabled: true,
		handler: function(b, e, rec) {
		    var vmtype;
		    if (PVE.Utils.volume_is_qemu_backup(rec.data.volid, rec.data.format)) {
			vmtype = 'qemu';
		    } else if (PVE.Utils.volume_is_lxc_backup(rec.data.volid, rec.data.format)) {
			vmtype = 'lxc';
		    } else {
			return;
		    }

		    var win = Ext.create('PVE.window.Restore', {
			nodename: nodename,
			volid: rec.data.volid,
			volidText: PVE.Utils.render_storage_content(rec.data.volid, {}, rec),
			vmtype: vmtype
		    });
		    win.show();
		    win.on('destroy', reload);
		}
	    },
	    {
		xtype: 'proxmoxButton',
		text: gettext('Show Configuration'),
		disabled: true,
		selModel: sm,
		handler: function(b,e,rec) {
		    var win = Ext.create('PVE.window.BackupConfig', {
			volume: rec.data.volid,
			pveSelNode: me.pveSelNode
		    });

		    win.show();
		}
	    },
	];

	me.callParent();
    },
});
