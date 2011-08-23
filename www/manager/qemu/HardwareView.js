// fixme: howto avoid jslint type confusion?
/*jslint confusion: true */
Ext.define('PVE.qemu.HardwareView', {
    extend: 'PVE.grid.ObjectGrid',
    alias: ['widget.PVE.qemu.HardwareView'],

    renderKey: function(key, metaData, record, rowIndex, colIndex, store) {
	var me = this;
	var rows = me.rows;
	var rowdef = rows[key] || {};

	if (rowdef.tdCls) {
	    metaData.tdCls = rowdef.tdCls;
	    if (rowdef.tdCls == 'pve-itype-icon-storage') { 
		if (record.data.value.match(/media=cdrom/)) {
		    metaData.tdCls = 'pve-itype-icon-cdrom';
		    return rowdef.header.replace(/Hard Disk/, 'CD/DVD');
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

	var rows = {
	    memory: {
		header: 'Memory',
		editor: 'PVE.qemu.MemoryEdit',
		never_delete: true,
		tdCls: 'pve-itype-icon-memory',
		renderer: function(value) {
		    return PVE.Utils.format_size(value*1024*1024);
		}
	    },
	    sockets: {
		header: 'Processors',
		never_delete: true,
		editor: 'PVE.qemu.ProcessorEdit',
		tdCls: 'pve-itype-icon-processor',
		defaultValue: 1,
		renderer: function(value, metaData, record, rowIndex, colIndex, store) {
		    var model = me.getObjectValue('cpu');
		    var cores = me.getObjectValue('cores');
		    var res = '';
		    if (!cores || (cores <= 1)) {
			res = value;
		    } else {
			res = (value*cores) + ' (' + value + ' sockets, ' + cores + ' cores)';
		    }
		    if (model) {
			res += ' [' + model + ']';
		    }
		    return res;
		}
	    },
	    keyboard: {
		header: 'Keyboard',
		never_delete: true,
		editor: 'PVE.qemu.KeyboardEdit',
		tdCls: 'pve-itype-icon-keyboard',
		defaultValue: '',
		renderer: PVE.Utils.render_kvm_language
	    },
	    vga: {
		header: 'Display',
		editor: 'PVE.qemu.DisplayEdit',
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
	    }
	};

	for (i = 0; i < 4; i++) {
	    confid = "ide" + i;
	    rows[confid] = {
		group: 1,
		tdCls: 'pve-itype-icon-storage',
		editor: 'PVE.qemu.HDEdit',
		header: 'Hard Disk ' + '(' + confid +')'
	    };
	}
	for (i = 0; i < 16; i++) {
	    confid = "scsi" + i;
	    rows[confid] = {
		group: 1,
		tdCls: 'pve-itype-icon-storage',
		editor: 'PVE.qemu.HDEdit',
		header: 'Hard Disk ' + '(' + confid +')'
	    };
	}
	for (i = 0; i < 16; i++) {
	    confid = "virtio" + i;
	    rows[confid] = {
		group: 1,
		tdCls: 'pve-itype-icon-storage',
		editor: 'PVE.qemu.HDEdit',
		header: 'Hard Disk ' + '(' + confid +')'
	    };
	}
	for (i = 0; i < 32; i++) {
	    confid = "net" + i;
	    rows[confid] = {
		group: 2,
		tdCls: 'pve-itype-icon-network',
		editor: 'PVE.qemu.NetworkEdit',
		header: 'Network Adapter '+ '(' + confid +')'
	    };
	}
	for (i = 0; i < 8; i++) {
	    rows["unused" + i] = {
		group: 3,
		tdCls: 'pve-itype-icon-storage',
		editor: 'PVE.qemu.HDEdit',
		header: 'Unused Disk'
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

	var run_editor = function() {
	    var sm = me.getSelectionModel();
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
		if (rec.data.value.match(/media=cdrom/)) {
		    editor = 'PVE.qemu.CDEdit';
		}
	    }

	    var win = Ext.create(editor, {
		pveSelNode: me.pveSelNode,
		confid: rec.data.key,
		url: '/api2/extjs/' + baseurl
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

		var msg = 'Are you sure you want to remove: ' + 
		    me.renderKey(rec.data.key, {}, rec);
		if (rec.data.key.match(/^unused\d+$/)) {
		    msg = 'Are you sure you want to remove image "' +
			rec.data.value + '"? This will permanently erase ' +
			'all image data.';
		}

		Ext.Msg.confirm('Deletion Confirmation', msg, function(btn) {
		    if (btn !== 'yes') {
			return;
		    }
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
			    Ext.Msg.alert('Error',response.htmlStatus);
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

	    var rowdef = rows[rec.data.key];

	    edit_btn.setDisabled(!rowdef.editor);

	    remove_btn.setDisabled(rowdef.never_delete === true);
	};

	Ext.applyIf(me, {
	    url: '/api2/json/' + baseurl,
	    cwidth1: 170,
	    tbar: [ 
		{
		    text: 'Add',
		    menu: new Ext.menu.Menu({
			items: [
			    {
				text: 'Hard Disk',
				iconCls: 'pve-itype-icon-storage',
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
				text: 'CD/DVD Drive',
				iconCls: 'pve-itype-icon-cdrom',
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
				text: 'Network Device',
				iconCls: 'pve-itype-icon-network',
				handler: function() {
				    var win = Ext.create('PVE.qemu.NetworkEdit', {
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
		edit_btn
	    ],
	    rows: rows,
	    sorterFn: sorterFn,
	    listeners: {
		show: reload,
		itemdblclick: run_editor,
		selectionchange: set_button_status
	    }
	});

	me.callParent();
    }
});
