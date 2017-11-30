Ext.define('PVE.qemu.HardwareView', {
    extend: 'PVE.grid.PendingObjectGrid',
    alias: ['widget.PVE.qemu.HardwareView'],

    onlineHelp: 'qm_virtual_machines_settings',

    renderKey: function(key, metaData, rec, rowIndex, colIndex, store) {
	var me = this;
	var rows = me.rows;
	var rowdef = rows[key] || {};

	metaData.tdAttr = "valign=middle";

	if (rowdef.tdCls) {
	    metaData.tdCls = rowdef.tdCls;
	    if (rowdef.tdCls == 'pve-itype-icon-storage') { 
		var value = me.getObjectValue(key, '', true);
		if (value.match(/media=cdrom/)) {
		    metaData.tdCls = 'pve-itype-icon-cdrom';
		    return rowdef.cdheader;
		}
	    }
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

	var rows = {
	    memory: {
		header: gettext('Memory'),
		editor: caps.vms['VM.Config.Memory'] ? 'PVE.qemu.MemoryEdit' : undefined,
		never_delete: true,
		defaultValue: '512',
		tdCls: 'pve-itype-icon-memory',
		renderer: function(value, metaData, record) {
		    var balloon =  me.getObjectValue('balloon');
		    if (balloon) {
			return PVE.Utils.format_size(balloon*1024*1024) + "/" + 
			    PVE.Utils.format_size(value*1024*1024);

		    } 
		    return PVE.Utils.format_size(value*1024*1024);
		}
	    },
	    sockets: {
		header: gettext('Processors'),
		never_delete: true,
		editor: (caps.vms['VM.Config.CPU'] || caps.vms['VM.Config.HWType']) ? 
		    'PVE.qemu.ProcessorEdit' : undefined,
		tdCls: 'pve-itype-icon-processor',
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
		}
	    },
	    keyboard: {
		header: gettext('Keyboard Layout'),
		never_delete: true,
		editor: caps.vms['VM.Config.Options'] ? 'PVE.qemu.KeyboardEdit' : undefined,
		tdCls: 'pve-itype-icon-keyboard',
		defaultValue: '',
		renderer: PVE.Utils.render_kvm_language
	    },
	    vga: {
		header: gettext('Display'),
		editor: caps.vms['VM.Config.HWType'] ? 'PVE.qemu.DisplayEdit' : undefined,
		never_delete: true,
		tdCls: 'pve-itype-icon-display',
		defaultValue: '',
		renderer: PVE.Utils.render_kvm_vga_driver		
	    },
	    cores: {
		visible: false
	    },
	    cpu: {
		visible: false
	    },
	    numa: {
		visible: false
	    },
	    balloon: {
		visible: false
	    },
	    hotplug: {
		visible: false
	    },
	    vcpus: {
		visible: false
	    },
	    cpuunits: {
		visible: false
	    },
	    cpulimit: {
		visible: false
	    },
	    bios: {
		visible: false
	    }

	};

	for (i = 0; i < 4; i++) {
	    confid = "ide" + i.toString();
	    rows[confid] = {
		group: 1,
		tdCls: 'pve-itype-icon-storage',
		editor: 'PVE.qemu.HDEdit',
		never_delete: caps.vms['VM.Config.Disk'] ? false : true,
		header: gettext('Hard Disk') + ' (' + confid +')',
		cdheader: gettext('CD/DVD Drive') + ' (' + confid +')'
	    };
	}
	for (i = 0; i < 6; i++) {
	    confid = "sata" + i.toString();
	    rows[confid] = {
		group: 1,
		tdCls: 'pve-itype-icon-storage',
		editor: 'PVE.qemu.HDEdit',
		never_delete: caps.vms['VM.Config.Disk'] ? false : true,
		header: gettext('Hard Disk') + ' (' + confid +')',
		cdheader: gettext('CD/DVD Drive') + ' (' + confid +')'
	    };
	}
	for (i = 0; i < 16; i++) {
	    confid = "scsi" + i.toString();
	    rows[confid] = {
		group: 1,
		tdCls: 'pve-itype-icon-storage',
		editor: 'PVE.qemu.HDEdit',
		never_delete: caps.vms['VM.Config.Disk'] ? false : true,
		header: gettext('Hard Disk') + ' (' + confid +')',
		cdheader: gettext('CD/DVD Drive') + ' (' + confid +')'
	    };
	}
	for (i = 0; i < 16; i++) {
	    confid = "virtio" + i.toString();
	    rows[confid] = {
		group: 1,
		tdCls: 'pve-itype-icon-storage',
		editor: 'PVE.qemu.HDEdit',
		never_delete: caps.vms['VM.Config.Disk'] ? false : true,
		header: gettext('Hard Disk') + ' (' + confid +')',
		cdheader: gettext('CD/DVD Drive') + ' (' + confid +')'
	    };
	}
	for (i = 0; i < 32; i++) {
	    confid = "net" + i.toString();
	    rows[confid] = {
		group: 2,
		tdCls: 'pve-itype-icon-network',
		editor: caps.vms['VM.Config.Network'] ? 'PVE.qemu.NetworkEdit' : undefined,
		never_delete: caps.vms['VM.Config.Network'] ? false : true,
		header: gettext('Network Device') + ' (' + confid +')'
	    };
	}
	rows.efidisk0 = {
	    group: 3,
	    tdCls: 'pve-itype-icon-storage',
	    editor: null,
	    never_delete: caps.vms['VM.Config.Disk'] ? false : true,
	    header: gettext('EFI Disk')
	};
	for (i = 0; i < 5; i++) {
	    confid = "usb" + i.toString();
	    rows[confid] = {
		group: 4,
		tdCls: 'pve-itype-icon-usb',
		editor: caps.nodes['Sys.Console'] ? 'PVE.qemu.USBEdit' : undefined,
		never_delete: caps.nodes['Sys.Console'] ? false : true,
		header: gettext('USB Device') + ' (' + confid + ')'
	    };
	}
	for (i = 0; i < 4; i++) {
	    confid = "hostpci" + i.toString();
	    rows[confid] = {
		group: 5,
		tdCls: 'pve-itype-icon-pci',
		never_delete: caps.nodes['Sys.Console'] ? false : true,
		header: gettext('PCI Device') + ' (' + confid + ')'
	    };
	}
	for (i = 0; i < 8; i++) {
	    rows["unused" + i.toString()] = {
		group: 6,
		tdCls: 'pve-itype-icon-storage',
		editor: caps.vms['VM.Config.Disk'] ? 'PVE.qemu.HDEdit' : undefined,
		header: gettext('Unused Disk') + ' ' + i.toString()
	    };
	}

	var sorterFn = function(rec1, rec2) {
	    var v1 = rec1.data.key;
	    var v2 = rec2.data.key;
	    var g1 = rows[v1].group || 0;
	    var g2 = rows[v2].group || 0;
	    
	    return (g1 !== g2) ? 
		(g1 > g2 ? 1 : -1) : (v1 > v2 ? 1 : (v1 < v2 ? -1 : 0));
	};

	var reload = function() {
	    me.rstore.load();
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
	    if (rowdef.tdCls == 'pve-itype-icon-storage') {
		var value = me.getObjectValue(rec.data.key, '', true); 
		if (value.match(/media=cdrom/)) {
		    editor = 'PVE.qemu.CDEdit';
		}
	    }

	    var win;

	    if (Ext.isString(editor)) {
		win = Ext.create(editor, {
		    pveSelNode: me.pveSelNode,
		    confid: rec.data.key,
		    url: '/api2/extjs/' + baseurl
		});
	    } else {
		var config = Ext.apply({
		    pveSelNode: me.pveSelNode,
		    confid: rec.data.key,
		    url: '/api2/extjs/' + baseurl
		}, rowdef.editor);
		win = Ext.createWidget(rowdef.editor.xtype, config);
		win.load();
	    }

	    win.show();
	    win.on('destroy', reload);
	};

	var run_diskthrottle = function() {
	    var rec = sm.getSelection()[0];
	    if (!rec) {
		return;
	    }

            var win = Ext.create('PVE.qemu.HDThrottle', {
		pveSelNode: me.pveSelNode,
		confid: rec.data.key,
		url: '/api2/extjs/' + baseurl
	    });

	    win.show();
	    win.on('destroy', reload);
	};

	var run_resize = function() {
	    var rec = sm.getSelection()[0];
	    if (!rec) {
		return;
	    }

	    var win = Ext.create('PVE.window.HDResize', {
		disk: rec.data.key,
		nodename: nodename,
		vmid: vmid
	    });

	    win.show();

	    win.on('destroy', reload);
	};

	var run_cpuoptions = function() {
	    var sockets = me.getObjectValue('sockets', 1);
	    var cores = me.getObjectValue('cores', 1);

	    var win = Ext.create('PVE.qemu.CPUOptions', {
		maxvcpus: sockets * cores,
		vmid: vmid,
		pveSelNode: me.pveSelNode,
		url: '/api2/extjs/' + baseurl
	    });

	    win.show();

	    win.on('destroy', reload);
	};

	var run_move = function() {
	    var rec = sm.getSelection()[0];
	    if (!rec) {
		return;
	    }

	    var win = Ext.create('PVE.window.HDMove', {
		disk: rec.data.key,
		nodename: nodename,
		vmid: vmid
	    });

	    win.show();

	    win.on('destroy', reload);
	};

	var edit_btn = new PVE.button.Button({
	    text: gettext('Edit'),
	    selModel: sm,
	    disabled: true,
	    handler: run_editor
        });

	var resize_btn = new PVE.button.Button({
	    text: gettext('Resize disk'),
	    selModel: sm,
	    disabled: true,
	    handler: run_resize
	});

	var move_btn = new PVE.button.Button({
	    text: gettext('Move disk'),
	    selModel: sm,
	    disabled: true,
	    handler: run_move
	});

	var diskthrottle_btn = new PVE.button.Button({
	    text: gettext('Disk Throttle'),
	    selModel: sm,
	    disabled: true,
	    handler: run_diskthrottle
	});

	var cpuoptions_btn = new Ext.Button({
	    text: gettext('CPU options'),
	    handler: run_cpuoptions
	});

	var remove_btn = new PVE.button.Button({
	    text: gettext('Remove'),
	    defaultText: gettext('Remove'),
	    altText: gettext('Detach'),
	    selModel: sm,
	    disabled: true,
	    dangerous: true,
	    confirmMsg: function(rec) {
		var warn = gettext('Are you sure you want to remove entry {0}');
		if (this.text === this.altText) {
		    warn = gettext('Are you sure you want to detach entry {0}');
		}

		var entry = rec.data.key;
		var msg = Ext.String.format(warn, "'"
		    + me.renderKey(entry, {}, rec) + "'");

		if (entry.match(/^unused\d+$/)) {
		    msg += " " + gettext('This will permanently erase all data.');
		}

		return msg;
	    },
	    handler: function(b, e, rec) {
		PVE.Utils.API2Request({
		    url: '/api2/extjs/' + baseurl,
		    waitMsgTarget: me,
		    method: 'PUT',
		    params: {
			'delete': rec.data.key
		    },
		    callback: function() {
			reload();
		    },
		    failure: function (response, opts) {
			Ext.Msg.alert('Error', response.htmlStatus);
		    }
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
		}
	    }
	});

	var revert_btn = new PVE.button.Button({
	    text: gettext('Revert'),
	    selModel: sm,
	    disabled: true,
	    handler: function(b, e, rec) {
		var rowdef = me.rows[rec.data.key] || {};
		var keys = rowdef.multiKey ||  [ rec.data.key ];
		var revert = keys.join(',');
		PVE.Utils.API2Request({
		    url: '/api2/extjs/' + baseurl,
		    waitMsgTarget: me,
		    method: 'PUT',
		    params: {
			'revert': revert
		    },
		    callback: function() {
			reload();
		    },
		    failure: function (response, opts) {
			Ext.Msg.alert('Error',response.htmlStatus);
		    }
		});
	    }
	});

	var efidisk_menuitem = Ext.create('Ext.menu.Item',{
	    text: gettext('EFI Disk'),
	    iconCls: 'pve-itype-icon-storage',
	    disabled: !caps.vms['VM.Config.Disk'],
	    handler: function() {

		var rstoredata = me.rstore.getData().map;
		// check if ovmf is configured
		if (rstoredata.bios && rstoredata.bios.data.value === 'ovmf') {
		    var win = Ext.create('PVE.qemu.EFIDiskEdit', {
			url: '/api2/extjs/' + baseurl,
			pveSelNode: me.pveSelNode
		    });
		    win.on('destroy', reload);
		    win.show();
		} else {
		    Ext.Msg.alert('Error',gettext('Please select OVMF(UEFI) as BIOS first.'));
		}

	    }
	});

	var set_button_status = function() {
	    var sm = me.getSelectionModel();
	    var rec = sm.getSelection()[0];

	    // disable button when we have an efidisk already
	    // disable is ok in this case, because you can instantly
	    // see that there is already one
	    efidisk_menuitem.setDisabled(me.rstore.getData().map.efidisk0 !== undefined);
	    // en/disable usb add button
	    var count = 0;
	    me.rstore.getData().items.forEach(function(item){
		if (/^usb\d+/.test(item.id)) {
		    count++;
		}
	    });
	    me.down('#addusb').setDisabled((count >= 5));

	    if (!rec) {
		remove_btn.disable();
		edit_btn.disable();
		resize_btn.disable();
		move_btn.disable();
		diskthrottle_btn.disable();
		revert_btn.disable();
		return;
	    }
	    var key = rec.data.key;
	    var value = rec.data.value;
	    var rowdef = rows[key];

	    var pending = rec.data['delete'] || me.hasPendingChanges(key);
	    var isUsedDisk = !key.match(/^unused\d+/) &&
		rowdef.tdCls == 'pve-itype-icon-storage' &&
		(value && !value.match(/media=cdrom/));

	    var isEfi = (key === 'efidisk0');

	    remove_btn.setDisabled(rec.data['delete'] || (rowdef.never_delete === true));
	    remove_btn.setText(isUsedDisk ? remove_btn.altText : remove_btn.defaultText);

	    edit_btn.setDisabled(rec.data['delete'] || !rowdef.editor);

	    resize_btn.setDisabled(pending || !isUsedDisk);

	    move_btn.setDisabled(pending || !isUsedDisk);

	    diskthrottle_btn.setDisabled(pending || !isUsedDisk || isEfi);

	    revert_btn.setDisabled(!pending);

	};

	Ext.apply(me, {
	    url: '/api2/json/' + 'nodes/' + nodename + '/qemu/' + vmid + '/pending',
	    interval: 5000,
	    selModel: sm,
	    tbar: [ 
		{
		    text: gettext('Add'),
		    menu: new Ext.menu.Menu({
			items: [
			    {
				text: gettext('Hard Disk'),
				iconCls: 'pve-itype-icon-storage',
				disabled: !caps.vms['VM.Config.Disk'],
				handler: function() {
				    var win = Ext.create('PVE.qemu.HDEdit', {
					url: '/api2/extjs/' + baseurl,
					pveSelNode: me.pveSelNode
				    });
				    win.on('destroy', reload);
				    win.show();
				}
			    },
			    {
				text: gettext('CD/DVD Drive'),
				iconCls: 'pve-itype-icon-cdrom',
				disabled: !caps.vms['VM.Config.Disk'],
				handler: function() {
				    var win = Ext.create('PVE.qemu.CDEdit', {
					url: '/api2/extjs/' + baseurl,
					pveSelNode: me.pveSelNode
				    });
				    win.on('destroy', reload);
				    win.show();
				}
			    },
			    {
				text: gettext('Network Device'),
				iconCls: 'pve-itype-icon-network',
				disabled: !caps.vms['VM.Config.Network'],
				handler: function() {
				    var win = Ext.create('PVE.qemu.NetworkEdit', {
					url: '/api2/extjs/' + baseurl,
					pveSelNode: me.pveSelNode
				    });
				    win.on('destroy', reload);
				    win.show();
				}
			    },
			    efidisk_menuitem,
			    {
				text: gettext('USB Device'),
				itemId: 'addusb',
				iconCls: 'pve-itype-icon-usb',
				disabled: !caps.nodes['Sys.Console'],
				handler: function() {
				    var win = Ext.create('PVE.qemu.USBEdit', {
					url: '/api2/extjs/' + baseurl,
					pveSelNode: me.pveSelNode
				    });
				    win.on('destroy', reload);
				    win.show();
				}
			    }
			]
		    })
		},
		remove_btn,
		edit_btn,
		resize_btn,
		move_btn,
		diskthrottle_btn,
		cpuoptions_btn,
		revert_btn
	    ],
	    rows: rows,
	    sorterFn: sorterFn,
	    listeners: {
		itemdblclick: run_editor,
		selectionchange: set_button_status
	    }
	});

	me.callParent();

	me.on('activate', me.rstore.startUpdate);
	me.on('destroy', me.rstore.stopUpdate);	

	me.mon(me.rstore, 'refresh', function() {
	    set_button_status();
	});
    }
});
