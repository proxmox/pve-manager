Ext.define('PVE.qemu.HardwareView', {
    extend: 'Proxmox.grid.PendingObjectGrid',
    alias: ['widget.PVE.qemu.HardwareView'],

    onlineHelp: 'qm_virtual_machines_settings',

    renderKey: function(key, metaData, rec, rowIndex, colIndex, store) {
	var me = this;
	var rows = me.rows;
	var rowdef = rows[key] || {};
	var iconCls = rowdef.iconCls;
	var icon = '';
	var txt = (rowdef.header || key);

	metaData.tdAttr = "valign=middle";

	if (rowdef.isOnStorageBus) {
	    var value = me.getObjectValue(key, '', false);
	    if (value === '') {
		value = me.getObjectValue(key, '', true);
	    }
	    if (value.match(/vm-.*-cloudinit/)) {
		iconCls = 'cloud';
		txt = rowdef.cloudheader;
	    } else if (value.match(/media=cdrom/)) {
		metaData.tdCls = 'pve-itype-icon-cdrom';
		return rowdef.cdheader;
	    }
	}

	if (rowdef.tdCls) {
	    metaData.tdCls = rowdef.tdCls;
	} else if (iconCls) {
	    icon = "<i class='pve-grid-fa fa fa-fw fa-" + iconCls + "'></i>";
	    metaData.tdCls += " pve-itype-fa";
	}

	// only return icons in grid but not remove dialog
	if (rowIndex !== undefined) {
	    return icon + txt;
	} else {
	    return txt;
	}
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

	var rows = {
	    memory: {
		header: gettext('Memory'),
		editor: caps.vms['VM.Config.Memory'] ? 'PVE.qemu.MemoryEdit' : undefined,
		never_delete: true,
		defaultValue: '512',
		tdCls: 'pve-itype-icon-memory',
		group: 2,
		multiKey: ['memory', 'balloon', 'shares'],
		renderer: function(value, metaData, record, ri, ci, store, pending) {
		    var res = '';

		    var max = me.getObjectValue('memory', 512, pending);
		    var balloon =  me.getObjectValue('balloon', undefined, pending);
		    var shares = me.getObjectValue('shares', undefined, pending);

		    res  = Proxmox.Utils.format_size(max*1024*1024);

		    if (balloon !== undefined && balloon > 0) {
			res = Proxmox.Utils.format_size(balloon*1024*1024) + "/" + res;

			if (shares) {
			    res += ' [shares=' + shares +']';
			}
		    } else if (balloon === 0) {
			res += ' [balloon=0]';
		    }
		    return res;
		},
	    },
	    sockets: {
		header: gettext('Processors'),
		never_delete: true,
		editor: (caps.vms['VM.Config.CPU'] || caps.vms['VM.Config.HWType']) ?
		    'PVE.qemu.ProcessorEdit' : undefined,
		tdCls: 'pve-itype-icon-processor',
		group: 3,
		defaultValue: '1',
		multiKey: ['sockets', 'cpu', 'cores', 'numa', 'vcpus', 'cpulimit', 'cpuunits'],
		renderer: function(value, metaData, record, rowIndex, colIndex, store, pending) {

		    var sockets = me.getObjectValue('sockets', 1, pending);
		    var model = me.getObjectValue('cpu', undefined, pending);
		    var cores = me.getObjectValue('cores', 1, pending);
		    var numa = me.getObjectValue('numa', undefined, pending);
		    var vcpus = me.getObjectValue('vcpus', undefined, pending);
		    var cpulimit = me.getObjectValue('cpulimit', undefined, pending);
		    var cpuunits = me.getObjectValue('cpuunits', undefined, pending);

		    var res = Ext.String.format('{0} ({1} sockets, {2} cores)',
			sockets*cores, sockets, cores);

		    if (model) {
			res += ' [' + model + ']';
		    }

		    if (numa) {
			res += ' [numa=' + numa +']';
		    }

		    if (vcpus) {
			res += ' [vcpus=' + vcpus +']';
		    }

		    if (cpulimit) {
			res += ' [cpulimit=' + cpulimit +']';
		    }

		    if (cpuunits) {
			res += ' [cpuunits=' + cpuunits +']';
		    }

		    return res;
		},
	    },
	    bios: {
		header: 'BIOS',
		group: 4,
		never_delete: true,
		editor: caps.vms['VM.Config.Options'] ? 'PVE.qemu.BiosEdit' : undefined,
		defaultValue: '',
		iconCls: 'microchip',
		renderer: PVE.Utils.render_qemu_bios,
	    },
	    vga: {
		header: gettext('Display'),
		editor: caps.vms['VM.Config.HWType'] ? 'PVE.qemu.DisplayEdit' : undefined,
		never_delete: true,
		iconCls: 'desktop',
		group:5,
		defaultValue: '',
		renderer: PVE.Utils.render_kvm_vga_driver,
	    },
	    machine: {
		header: gettext('Machine'),
		editor: caps.vms['VM.Config.HWType'] ?  {
		    xtype: 'proxmoxWindowEdit',
		    subject: gettext('Machine'),
		    width: 350,
		    items: [{
			xtype: 'proxmoxKVComboBox',
			name: 'machine',
			value: '__default__',
			fieldLabel: gettext('Machine'),
			comboItems: [
			    ['__default__', PVE.Utils.render_qemu_machine('')],
			    ['q35', 'q35'],
			],
		    }]} : undefined,
		iconCls: 'cogs',
		never_delete: true,
		group: 6,
		defaultValue: '',
		renderer: PVE.Utils.render_qemu_machine,
	    },
	    scsihw: {
		header: gettext('SCSI Controller'),
		iconCls: 'database',
		editor: caps.vms['VM.Config.Options'] ? 'PVE.qemu.ScsiHwEdit' : undefined,
		renderer: PVE.Utils.render_scsihw,
		group: 7,
		never_delete: true,
		defaultValue: '',
	    },
	    vmstate: {
		header: gettext('Hibernation VM State'),
		iconCls: 'download',
		del_extra_msg: gettext('The saved VM state will be permanently lost.'),
		group: 100,
	    },
	    cores: {
		visible: false,
	    },
	    cpu: {
		visible: false,
	    },
	    numa: {
		visible: false,
	    },
	    balloon: {
		visible: false,
	    },
	    hotplug: {
		visible: false,
	    },
	    vcpus: {
		visible: false,
	    },
	    cpuunits: {
		visible: false,
	    },
	    cpulimit: {
		visible: false,
	    },
	    shares: {
		visible: false,
	    },
	};

	PVE.Utils.forEachBus(undefined, function(type, id) {
	    var confid = type + id;
	    rows[confid] = {
		group: 10,
		iconCls: 'hdd-o',
		editor: 'PVE.qemu.HDEdit',
		never_delete: caps.vms['VM.Config.Disk'] ? false : true,
		isOnStorageBus: true,
		header: gettext('Hard Disk') + ' (' + confid +')',
		cdheader: gettext('CD/DVD Drive') + ' (' + confid +')',
		cloudheader: gettext('CloudInit Drive') + ' (' + confid + ')',
	    };
	});
	for (i = 0; i < PVE.Utils.hardware_counts.net; i++) {
	    confid = "net" + i.toString();
	    rows[confid] = {
		group: 15,
		order: i,
		iconCls: 'exchange',
		editor: caps.vms['VM.Config.Network'] ? 'PVE.qemu.NetworkEdit' : undefined,
		never_delete: caps.vms['VM.Config.Network'] ? false : true,
		header: gettext('Network Device') + ' (' + confid +')',
	    };
	}
	rows.efidisk0 = {
	    group: 20,
	    iconCls: 'hdd-o',
	    editor: null,
	    never_delete: caps.vms['VM.Config.Disk'] ? false : true,
	    header: gettext('EFI Disk'),
	};
	for (i = 0; i < PVE.Utils.hardware_counts.usb; i++) {
	    confid = "usb" + i.toString();
	    rows[confid] = {
		group: 25,
		order: i,
		iconCls: 'usb',
		editor: caps.nodes['Sys.Console'] ? 'PVE.qemu.USBEdit' : undefined,
		never_delete: caps.nodes['Sys.Console'] ? false : true,
		header: gettext('USB Device') + ' (' + confid + ')',
	    };
	}
	for (i = 0; i < PVE.Utils.hardware_counts.hostpci; i++) {
	    confid = "hostpci" + i.toString();
	    rows[confid] = {
		group: 30,
		order: i,
		tdCls: 'pve-itype-icon-pci',
		never_delete: caps.nodes['Sys.Console'] ? false : true,
		editor: caps.nodes['Sys.Console'] ? 'PVE.qemu.PCIEdit' : undefined,
		header: gettext('PCI Device') + ' (' + confid + ')',
	    };
	}
	for (i = 0; i < PVE.Utils.hardware_counts.serial; i++) {
	    confid = "serial" + i.toString();
	    rows[confid] = {
		group: 35,
		order: i,
		tdCls: 'pve-itype-icon-serial',
		never_delete: caps.nodes['Sys.Console'] ? false : true,
		header: gettext('Serial Port') + ' (' + confid + ')',
	    };
	}
	rows.audio0 = {
	    group: 40,
	    iconCls: 'volume-up',
	    editor: caps.vms['VM.Config.HWType'] ? 'PVE.qemu.AudioEdit' : undefined,
	    never_delete: caps.vms['VM.Config.HWType'] ? false : true,
	    header: gettext('Audio Device'),
	};
	for (i = 0; i < 256; i++) {
	    rows["unused" + i.toString()] = {
		group: 99,
		order: i,
		iconCls: 'hdd-o',
		del_extra_msg: gettext('This will permanently erase all data.'),
		editor: caps.vms['VM.Config.Disk'] ? 'PVE.qemu.HDEdit' : undefined,
		header: gettext('Unused Disk') + ' ' + i.toString(),
	    };
	}
	rows.rng0 = {
	    group: 45,
	    tdCls: 'pve-itype-icon-die',
	    editor: caps.nodes['Sys.Console'] ? 'PVE.qemu.RNGEdit' : undefined,
	    never_delete: caps.nodes['Sys.Console'] ? false : true,
	    header: gettext("VirtIO RNG"),
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

	var baseurl = 'nodes/' + nodename + '/qemu/' + vmid + '/config';

	var sm = Ext.create('Ext.selection.RowModel', {});

	var run_editor = function() {
	    var rec = sm.getSelection()[0];
	    if (!rec) {
		return;
	    }

	    var rowdef = rows[rec.data.key];
	    if (!rowdef.editor) {
		return;
	    }

	    var editor = rowdef.editor;
	    if (rowdef.isOnStorageBus) {
		var value = me.getObjectValue(rec.data.key, '', true);
		if (value.match(/vm-.*-cloudinit/)) {
		    return;
		} else if (value.match(/media=cdrom/)) {
		    editor = 'PVE.qemu.CDEdit';
		} else if (!diskCap) {
		    return;
		}
	    }

	    var win;

	    if (Ext.isString(editor)) {
		win = Ext.create(editor, {
		    pveSelNode: me.pveSelNode,
		    confid: rec.data.key,
		    url: '/api2/extjs/' + baseurl,
		});
	    } else {
		var config = Ext.apply({
		    pveSelNode: me.pveSelNode,
		    confid: rec.data.key,
		    url: '/api2/extjs/' + baseurl,
		}, rowdef.editor);
		win = Ext.createWidget(rowdef.editor.xtype, config);
		win.load();
	    }

	    win.show();
	    win.on('destroy', me.reload, me);
	};

	var run_resize = function() {
	    var rec = sm.getSelection()[0];
	    if (!rec) {
		return;
	    }

	    var win = Ext.create('PVE.window.HDResize', {
		disk: rec.data.key,
		nodename: nodename,
		vmid: vmid,
	    });

	    win.show();

	    win.on('destroy', me.reload, me);
	};

	var run_move = function() {
	    var rec = sm.getSelection()[0];
	    if (!rec) {
		return;
	    }

	    var win = Ext.create('PVE.window.HDMove', {
		disk: rec.data.key,
		nodename: nodename,
		vmid: vmid,
	    });

	    win.show();

	    win.on('destroy', me.reload, me);
	};

	var edit_btn = new Proxmox.button.Button({
	    text: gettext('Edit'),
	    selModel: sm,
	    disabled: true,
	    handler: run_editor,
        });

	var resize_btn = new Proxmox.button.Button({
	    text: gettext('Resize disk'),
	    selModel: sm,
	    disabled: true,
	    handler: run_resize,
	});

	var move_btn = new Proxmox.button.Button({
	    text: gettext('Move disk'),
	    selModel: sm,
	    disabled: true,
	    handler: run_move,
	});

	var remove_btn = new Proxmox.button.Button({
	    text: gettext('Remove'),
	    defaultText: gettext('Remove'),
	    altText: gettext('Detach'),
	    selModel: sm,
	    disabled: true,
	    dangerous: true,
	    RESTMethod: 'PUT',
	    confirmMsg: function(rec) {
		var warn = gettext('Are you sure you want to remove entry {0}');
		if (this.text === this.altText) {
		    warn = gettext('Are you sure you want to detach entry {0}');
		}
		var key = rec.data.key;
		var entry = rows[key];

		var rendered = me.renderKey(key, {}, rec);
		var msg = Ext.String.format(warn, "'" + rendered + "'");

		if (entry.del_extra_msg) {
		    msg += '<br>' + entry.del_extra_msg;
		}

		return msg;
	    },
	    handler: function(b, e, rec) {
		Proxmox.Utils.API2Request({
		    url: '/api2/extjs/' + baseurl,
		    waitMsgTarget: me,
		    method: b.RESTMethod,
		    params: {
			'delete': rec.data.key,
		    },
		    callback: () => me.reload(),
		    failure: function (response, opts) {
			Ext.Msg.alert('Error', response.htmlStatus);
		    },
		    success: function(response, options) {
			if (b.RESTMethod === 'POST') {
			    var upid = response.result.data;
			    var win = Ext.create('Proxmox.window.TaskProgress', {
				upid: upid,
				listeners: {
				    destroy: () => me.reload(),
				},
			    });
			    win.show();
			}
		    },
		});
	    },
	    listeners: {
		render: function(btn) {
		    // hack: calculate an optimal button width on first display
		    // to prevent the whole toolbar to move when we switch
		    // between the "Remove" and "Detach" labels
		    var def = btn.getSize().width;

		    btn.setText(btn.altText);
		    var alt = btn.getSize().width;

		    btn.setText(btn.defaultText);

		    var optimal = alt > def ? alt : def;
		    btn.setSize({ width: optimal });
		},
	    },
	});

	var revert_btn = new PVE.button.PendingRevert({
	    apiurl: '/api2/extjs/' + baseurl,
	});

	var efidisk_menuitem = Ext.create('Ext.menu.Item', {
	    text: gettext('EFI Disk'),
	    iconCls: 'fa fa-fw fa-hdd-o black',
	    disabled: !caps.vms['VM.Config.Disk'],
	    handler: function() {
		let bios = me.rstore.getData().map.bios;
		let usesEFI = bios && (bios.data.value === 'ovmf' || bios.data.pending === 'ovmf');

		var win = Ext.create('PVE.qemu.EFIDiskEdit', {
		    url: '/api2/extjs/' + baseurl,
		    pveSelNode: me.pveSelNode,
		    usesEFI: usesEFI,
		});
		win.on('destroy', me.reload, me);
		win.show();
	    },
	});

	let counts = {};
	let isAtLimit = (type) => (counts[type] >= PVE.Utils.hardware_counts[type]);

	var set_button_status = function() {
	    var sm = me.getSelectionModel();
	    var rec = sm.getSelection()[0];

	    // en/disable hardwarebuttons
	    counts = {};
	    var hasCloudInit = false;
	    me.rstore.getData().items.forEach(function(item){
		if (!hasCloudInit && (
		    /vm-.*-cloudinit/.test(item.data.value) ||
		    /vm-.*-cloudinit/.test(item.data.pending)
		)) {
		    hasCloudInit = true;
		    return;
		}

		let match = item.id.match(/^([^\d]+)\d+$/);
		let type;
		if (match && PVE.Utils.hardware_counts[match[1]] !== undefined) {
		    type = match[1];
		} else {
		    return;
		}

		counts[type] = (counts[type] || 0) + 1;
	    });

	    // heuristic only for disabling some stuff, the backend has the final word.
	    var noSysConsolePerm = !caps.nodes['Sys.Console'];
	    var noVMConfigHWTypePerm = !caps.vms['VM.Config.HWType'];
	    var noVMConfigNetPerm = !caps.vms['VM.Config.Network'];


	    me.down('#addusb').setDisabled(noSysConsolePerm || isAtLimit('usb'));
	    me.down('#addpci').setDisabled(noSysConsolePerm || isAtLimit('hostpci'));
	    me.down('#addaudio').setDisabled(noVMConfigHWTypePerm || isAtLimit('audio'));
	    me.down('#addserial').setDisabled(noVMConfigHWTypePerm || isAtLimit('serial'));
	    me.down('#addnet').setDisabled(noVMConfigNetPerm || isAtLimit('net'));
	    me.down('#addrng').setDisabled(noSysConsolePerm || isAtLimit('rng'));
	    efidisk_menuitem.setDisabled(isAtLimit('efidisk'));
	    me.down('#addci').setDisabled(noSysConsolePerm || hasCloudInit);

	    if (!rec) {
		remove_btn.disable();
		edit_btn.disable();
		resize_btn.disable();
		move_btn.disable();
		revert_btn.disable();
		return;
	    }
	    var key = rec.data.key;
	    var value = rec.data.value;
	    var rowdef = rows[key];

	    var pending = rec.data['delete'] || me.hasPendingChanges(key);
	    var isCDRom = (value && !!value.toString().match(/media=cdrom/));
	    var isUnusedDisk = key.match(/^unused\d+/);
	    var isUsedDisk = !isUnusedDisk && rowdef.isOnStorageBus && !isCDRom;

	    var isCloudInit = (value && value.toString().match(/vm-.*-cloudinit/));

	    var isEfi = (key === 'efidisk0');

	    remove_btn.setDisabled(rec.data['delete'] || (rowdef.never_delete === true) || (isUnusedDisk && !diskCap));
	    remove_btn.setText((isUsedDisk && !isCloudInit) ? remove_btn.altText : remove_btn.defaultText);
	    remove_btn.RESTMethod = isUnusedDisk ? 'POST':'PUT';

	    edit_btn.setDisabled(rec.data['delete'] || !rowdef.editor || isCloudInit || (!isCDRom && !diskCap));

	    resize_btn.setDisabled(pending || !isUsedDisk || !diskCap);

	    move_btn.setDisabled(pending || !(isUsedDisk || isEfi) || !diskCap);

	    revert_btn.setDisabled(!pending);

	};

	Ext.apply(me, {
	    url: '/api2/json/' + 'nodes/' + nodename + '/qemu/' + vmid + '/pending',
	    interval: 5000,
	    selModel: sm,
	    run_editor: run_editor,
	    tbar: [
		{
		    text: gettext('Add'),
		    menu: new Ext.menu.Menu({
			cls: 'pve-add-hw-menu',
			items: [
			    {
				text: gettext('Hard Disk'),
				iconCls: 'fa fa-fw fa-hdd-o black',
				disabled: !caps.vms['VM.Config.Disk'],
				handler: function() {
				    var win = Ext.create('PVE.qemu.HDEdit', {
					url: '/api2/extjs/' + baseurl,
					pveSelNode: me.pveSelNode,
				    });
				    win.on('destroy', me.reload, me);
				    win.show();
				},
			    },
			    {
				text: gettext('CD/DVD Drive'),
				iconCls: 'pve-itype-icon-cdrom',
				disabled: !caps.vms['VM.Config.Disk'],
				handler: function() {
				    var win = Ext.create('PVE.qemu.CDEdit', {
					url: '/api2/extjs/' + baseurl,
					pveSelNode: me.pveSelNode,
				    });
				    win.on('destroy', me.reload, me);
				    win.show();
				},
			    },
			    {
				text: gettext('Network Device'),
				itemId: 'addnet',
				iconCls: 'fa fa-fw fa-exchange black',
				disabled: !caps.vms['VM.Config.Network'],
				handler: function() {
				    var win = Ext.create('PVE.qemu.NetworkEdit', {
					url: '/api2/extjs/' + baseurl,
					pveSelNode: me.pveSelNode,
					isCreate: true,
				    });
				    win.on('destroy', me.reload, me);
				    win.show();
				},
			    },
			    efidisk_menuitem,
			    {
				text: gettext('USB Device'),
				itemId: 'addusb',
				iconCls: 'fa fa-fw fa-usb black',
				disabled: !caps.nodes['Sys.Console'],
				handler: function() {
				    var win = Ext.create('PVE.qemu.USBEdit', {
					url: '/api2/extjs/' + baseurl,
					pveSelNode: me.pveSelNode,
				    });
				    win.on('destroy', me.reload, me);
				    win.show();
				},
			    },
			    {
				text: gettext('PCI Device'),
				itemId: 'addpci',
				iconCls: 'pve-itype-icon-pci',
				disabled: !caps.nodes['Sys.Console'],
				handler: function() {
				    var win = Ext.create('PVE.qemu.PCIEdit', {
					url: '/api2/extjs/' + baseurl,
					pveSelNode: me.pveSelNode,
				    });
				    win.on('destroy', me.reload, me);
				    win.show();
				},
			    },
			    {
				text: gettext('Serial Port'),
				itemId: 'addserial',
				iconCls: 'pve-itype-icon-serial',
				disabled: !caps.vms['VM.Config.Options'],
				handler: function() {
				    var win = Ext.create('PVE.qemu.SerialEdit', {
					url: '/api2/extjs/' + baseurl,
				    });
				    win.on('destroy', me.reload, me);
				    win.show();
				},
			    },
			    {
				text: gettext('CloudInit Drive'),
				itemId: 'addci',
				iconCls: 'fa fa-fw fa-cloud black',
				disabled: !caps.nodes['Sys.Console'],
				handler: function() {
				    var win = Ext.create('PVE.qemu.CIDriveEdit', {
					url: '/api2/extjs/' + baseurl,
					pveSelNode: me.pveSelNode,
				    });
				    win.on('destroy', me.reload, me);
				    win.show();
				},
			    },
			    {
				text: gettext('Audio Device'),
				itemId: 'addaudio',
				iconCls: 'fa fa-fw fa-volume-up black',
				disabled: !caps.vms['VM.Config.HWType'],
				handler: function() {
				    var win = Ext.create('PVE.qemu.AudioEdit', {
					url: '/api2/extjs/' + baseurl,
					isCreate: true,
					isAdd: true,
				    });
				    win.on('destroy', me.reload, me);
				    win.show();
				},
			    },
			    {
				text: gettext("VirtIO RNG"),
				itemId: 'addrng',
				iconCls: 'pve-itype-icon-die',
				disabled: !caps.nodes['Sys.Console'],
				handler: function() {
				    var win = Ext.create('PVE.qemu.RNGEdit', {
					url: '/api2/extjs/' + baseurl,
					isCreate: true,
					isAdd: true,
				    });
				    win.on('destroy', me.reload, me);
				    win.show();
				},
			    },
			],
		    }),
		},
		remove_btn,
		edit_btn,
		resize_btn,
		move_btn,
		revert_btn,
	    ],
	    rows: rows,
	    sorterFn: sorterFn,
	    listeners: {
		itemdblclick: run_editor,
		selectionchange: set_button_status,
	    },
	});

	me.callParent();

	me.on('activate', me.rstore.startUpdate, me.rstore);
	me.on('destroy', me.rstore.stopUpdate, me.rstore);

	me.mon(me.getStore(), 'datachanged', set_button_status, me);
    },
});
