Ext.define('PVE.qemu.HardwareView', {
    extend: 'PVE.grid.ObjectGrid',
    alias: ['widget.PVE.qemu.HardwareView'],

    renderKey: function(key, metaData, record, rowIndex, colIndex, store) {
	var me = this;
	var rows = me.rows;
	var rowdef = rows[key] || {};

	if (rowdef.css) {
	    if (rowdef.css == 'pve-itype-icon-storage') { 
		if (record.data.value.match(/media=cdrom/)) {
		    metaData.css = 'pve-itype-icon-cdrom';
		    return 'CD/DVD';
		} else {
		    metaData.css = rowdef.css;
		    return 'Hard Disk';
		}
	    } else
		metaData.css = rowdef.css;
	}
	return rowdef.header || key;
    },

    initComponent : function() {
	var me = this;
	var i;

	var nodename = me.pveSelNode.data.node;
	if (!nodename) 
	    throw "no node name specified";

	var vmid = me.pveSelNode.data.vmid;
	if (!vmid) 
	    throw "no VM ID specified";

	var rows = {
	    memory: {
		header: 'Memory',
		css: 'pve-itype-icon-memory',
		renderer: function(value) {
		    return PVE.Utils.format_size(value*1024*1024);
		}
	    },
	    sockets: {
		header: 'Processors',
		css: 'pve-itype-icon-processor',
		defaultValue: 1,
		renderer: function(value, metaData, record, rowIndex, colIndex, store) {
		    var cores = (store.snapshot || store.data).get('cores');
		    return cores ? value * cores.data.value : value;
		}
	    },
	    keyboard: {
		header: 'Keyboard',
		css: 'pve-itype-icon-keyboard',
		defaultValue: 'default'
	    },
	    vga: {
		header: 'Display',
		css: 'pve-itype-icon-display',
		defaultValue: 'default'		
	    },
	    cores: {
		header: 'Cores',
		visible: false
	    }
	};

	for (i = 0; i < 4; i++) {
	    rows["ide" + i] = {
		css: 'pve-itype-icon-storage',
		header: 'Hard Disk (IDE)'
	    };
	}
	for (i = 0; i < 16; i++) {
	    rows["net" + i] = {
		css: 'pve-itype-icon-network',
		header: 'Network Adapter'
	    };
	}

	var run_editor = function() {
	    
	    console.log("TEST EDIT");

	    me.rstore.load();
	};

	Ext.applyIf(me, {
	    url: "/api2/json/nodes/" + nodename + "/qemu/" + vmid + "/config",
	    cwidth1: 150,
	    tbar: [ 
		{
		    text: "Edit",
		    handler: run_editor
		}
	    ],
	    rows: rows,
	    listeners: {
		itemdblclick: function() {
		    run_editor();
		}
	    }
	});

	me.callParent();

	me.on('show', function() {
	    me.rstore.load();
	});

    }
});
