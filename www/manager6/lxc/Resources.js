Ext.define('PVE.lxc.RessourceView', {
    extend: 'Proxmox.grid.PendingObjectGrid',
    alias: ['widget.pveLxcRessourceView'],

    onlineHelp: 'pct_configuration',

    renderKey: function(key, metaData, rec, rowIndex, colIndex, store) {
	var me = this;
	var rowdef = me.rows[key] || {};

	metaData.tdAttr = "valign=middle";
	if (rowdef.tdCls) {
	    metaData.tdCls = rowdef.tdCls;
	}
	return rowdef.header || key;
    },

    initComponent : function() {
	var me = this;
	var i, confid;

	var nodename = me.pveSelNode.data.node;
	if (!nodename) {
	    throw "no node name specified";
	}

	var vmid = me.pveSelNode.data.vmid;
	if (!vmid) {
	    throw "no VM ID specified";
	}

	var caps = Ext.state.Manager.get('GuiCap');
	var diskCap = caps.vms['VM.Config.Disk'];

	var mpeditor = caps.vms['VM.Config.Disk'] ? 'PVE.lxc.MountPointEdit' : undefined;

	var rows = {
	    memory: {
		header: gettext('Memory'),
		editor: caps.vms['VM.Config.Memory'] ? 'PVE.lxc.MemoryEdit' : undefined,
		defaultValue: 512,
		tdCls: 'pve-itype-icon-memory',
		group: 1,
		renderer: function(value) {
		    return Proxmox.Utils.format_size(value*1024*1024);
		},
	    },
	    swap: {
		header: gettext('Swap'),
		editor: caps.vms['VM.Config.Memory'] ? 'PVE.lxc.MemoryEdit' : undefined,
		defaultValue: 512,
		tdCls: 'pve-itype-icon-swap',
		group: 2,
		renderer: function(value) {
		    return Proxmox.Utils.format_size(value*1024*1024);
		},
	    },
	    cores: {
		header: gettext('Cores'),
		editor: caps.vms['VM.Config.CPU'] ? 'PVE.lxc.CPUEdit' : undefined,
		defaultValue: '',
		tdCls: 'pve-itype-icon-processor',
		group: 3,
		renderer: function(value) {
		    var cpulimit = me.getObjectValue('cpulimit');
		    var cpuunits = me.getObjectValue('cpuunits');
		    var res;
		    if (value) {
			res = value;
		    } else {
			res = gettext('unlimited');
		    }

		    if (cpulimit) {
			res += ' [cpulimit=' + cpulimit + ']';
		    }

		    if (cpuunits) {
			res += ' [cpuunits=' + cpuunits + ']';
		    }
		    return res;
		},
	    },
	    rootfs: {
		header: gettext('Root Disk'),
		defaultValue: Proxmox.Utils.noneText,
		editor: mpeditor,
		tdCls: 'pve-itype-icon-storage',
		group: 4,
	    },
	    cpulimit: {
		visible: false,
	    },
	    cpuunits: {
		visible: false,
	    },
	    unprivileged: {
		visible: false,
	    },
	};

	PVE.Utils.forEachMP(function(bus, i) {
	    confid = bus + i;
	    var group = 5;
	    var header;
	    if (bus === 'mp') {
		header = gettext('Mount Point') + ' (' + confid + ')';
	    } else {
		header = gettext('Unused Disk') + ' ' + i;
		group += 1;
	    }
	    rows[confid] = {
		group: group,
		order: i,
		tdCls: 'pve-itype-icon-storage',
		editor: mpeditor,
		header: header,
	    };
	}, true);

	var baseurl = 'nodes/' + nodename + '/lxc/' + vmid + '/config';

	me.selModel = Ext.create('Ext.selection.RowModel', {});

	var run_resize = function() {
	    var rec = me.selModel.getSelection()[0];
	    if (!rec) {
		return;
	    }

	    var win = Ext.create('PVE.window.MPResize', {
		disk: rec.data.key,
		nodename: nodename,
		vmid: vmid,
	    });

	    win.show();
	};

	var run_remove = function(b, e, rec) {
	    Proxmox.Utils.API2Request({
		url: '/api2/extjs/' + baseurl,
		waitMsgTarget: me,
		method: 'PUT',
		params: {
		    'delete': rec.data.key,
		},
		failure: function (response, opts) {
		    Ext.Msg.alert('Error', response.htmlStatus);
		},
	    });
	};

	var run_move = function(b, e, rec) {
	    if (!rec) {
		return;
	    }

	    var win = Ext.create('PVE.window.HDMove', {
		disk: rec.data.key,
		nodename: nodename,
		vmid: vmid,
		type: 'lxc',
	    });

	    win.show();

	    win.on('destroy', me.reload, me);
	};

	var edit_btn = new Proxmox.button.Button({
	    text: gettext('Edit'),
	    selModel: me.selModel,
	    disabled: true,
	    enableFn: function(rec) {
		if (!rec) {
		    return false;
		}
		var rowdef = rows[rec.data.key];
		return !!rowdef.editor;
	    },
	    handler: function() { me.run_editor(); },
	});

	var resize_btn = new Proxmox.button.Button({
	    text: gettext('Resize disk'),
	    selModel: me.selModel,
	    disabled: true,
	    handler: run_resize,
	});

	var remove_btn = new Proxmox.button.Button({
	    text: gettext('Remove'),
	    selModel: me.selModel,
	    disabled: true,
	    dangerous: true,
	    confirmMsg: function(rec) {
		var msg = Ext.String.format(gettext('Are you sure you want to remove entry {0}'),
					    "'" + me.renderKey(rec.data.key, {}, rec) + "'");
		if (rec.data.key.match(/^unused\d+$/)) {
		    msg += " " + gettext('This will permanently erase all data.');
		}

		return msg;
	    },
	    handler: run_remove,
	});

	var move_btn = new Proxmox.button.Button({
	    text: gettext('Move Volume'),
	    selModel: me.selModel,
	    disabled: true,
	    dangerous: true,
	    handler: run_move,
	});

	var revert_btn = new PVE.button.PendingRevert();

	var set_button_status = function() {
	    var rec = me.selModel.getSelection()[0];

	    if (!rec) {
		edit_btn.disable();
		remove_btn.disable();
		resize_btn.disable();
		revert_btn.disable();
		return;
	    }
	    var key = rec.data.key;
	    var value = rec.data.value;
	    var rowdef = rows[key];

	    var pending = rec.data['delete'] || me.hasPendingChanges(key);
	    var isDisk = (rowdef.tdCls == 'pve-itype-icon-storage');
	    var isUnusedDisk = key.match(/^unused\d+/);

	    var noedit = rec.data['delete'] || !rowdef.editor;
	    if (!noedit && Proxmox.UserName !== 'root@pam' && key.match(/^mp\d+$/)) {
		var mp = PVE.Parser.parseLxcMountPoint(value);
		if (mp.type !== 'volume') {
		    noedit = true;
		}
	    }
	    edit_btn.setDisabled(noedit);

	    remove_btn.setDisabled(!isDisk || rec.data.key === 'rootfs' || !diskCap || pending);
	    resize_btn.setDisabled(!isDisk || !diskCap || isUnusedDisk);
	    move_btn.setDisabled(!isDisk || !diskCap);
	    revert_btn.setDisabled(!pending);

	};

	var sorterFn = function(rec1, rec2) {
	    var v1 = rec1.data.key;
	    var v2 = rec2.data.key;
	    var g1 = rows[v1].group || 0;
	    var g2 = rows[v2].group || 0;
	    var order1 = rows[v1].order || 0;
	    var order2 = rows[v2].order || 0;

	    if ((g1 - g2) !== 0) {
		return g1 - g2;
	    }

	    if ((order1 - order2) !== 0) {
		return order1 - order2;
	    }

	    if (v1 > v2) {
		return 1;
	    } else if (v1 < v2) {
	        return -1;
	    } else {
		return 0;
	    }
	};

	Ext.apply(me, {
	    url: "/api2/json/nodes/" + nodename + "/lxc/" + vmid + "/pending",
	    selModel: me.selModel,
	    interval: 2000,
	    cwidth1: 170,
	    tbar: [
		{
		    text: gettext('Add'),
		    menu: new Ext.menu.Menu({
			items: [
			    {
				text: gettext('Mount Point'),
				iconCls: 'pve-itype-icon-storage',
				disabled: !caps.vms['VM.Config.Disk'],
				handler: function() {
				    var win = Ext.create('PVE.lxc.MountPointEdit', {
					url: '/api2/extjs/' + baseurl,
					unprivileged: me.getObjectValue('unprivileged'),
					pveSelNode: me.pveSelNode,
				    });
				    win.on('destroy', me.reload, me);
				    win.show();
				},
			    },
			],
		    }),
		},
		edit_btn,
		remove_btn,
		resize_btn,
		move_btn,
		revert_btn,
	    ],
	    rows: rows,
	    sorterFn: sorterFn,
	    editorConfig: {
		pveSelNode: me.pveSelNode,
		url: '/api2/extjs/' + baseurl,
	    },
	    listeners: {
		itemdblclick: me.run_editor,
		selectionchange: set_button_status,
	    },
	});

	me.callParent();

	me.on('activate', me.rstore.startUpdate);
	me.on('destroy', me.rstore.stopUpdate);
	me.on('deactivate', me.rstore.stopUpdate);

	me.mon(me.getStore(), 'datachanged', function() {
	    set_button_status();
	});

	Ext.apply(me.editorConfig, { unprivileged: me.getObjectValue('unprivileged') });
    },
});
