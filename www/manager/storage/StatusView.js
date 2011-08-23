Ext.define('PVE.storage.StatusView', {
    extend: 'PVE.grid.ObjectGrid',
    alias: ['widget.pveStorageStatusView'],

    initComponent : function() {
	var me = this;

	var nodename = me.pveSelNode.data.node;
	if (!nodename) {
	    throw "no node name specified";
	}

	var storage = me.pveSelNode.data.storage;
	if (!storage) {
	    throw "no storage ID specified";
	}

	var rows = {
	    disable: {
		header: 'Enabled', 
		required: true,
		renderer: PVE.Utils.format_neg_boolean	
	    },
	    active: {
		header: 'Active', 
		required: true,		
		renderer: PVE.Utils.format_boolean
	    },
	    content: {
		header: 'Content', 
		required: true,
		renderer: PVE.Utils.format_content_types
	    },
	    type: {
		header: 'Type', 
		required: true,
		renderer: PVE.Utils.format_storage_type
	    },
	    shared: {
		header: 'Shared', 
		required: true,
		renderer: PVE.Utils.format_boolean
	    },
	    total: {
		header: 'Size', 
		required: true, 
		renderer: PVE.Utils.render_size
	    },
	    used: {
		header: 'Used', 
		required: true, 
		renderer: function(value) {
		    // do not confuse users with filesystem details
		    var total = me.getObjectValue('total', 0);
		    var avail = me.getObjectValue('avail', 0);
		    return PVE.Utils.render_size(total - avail);
		}
	    },
	    avail: {
		header: 'Avail', 
		required: true, 
		renderer: PVE.Utils.render_size
	    }
	};

	Ext.applyIf(me, {
	    url: "/api2/json/nodes/" + nodename + "/storage/" + storage + "/status",
	    cwidth1: 150,
	    interval: 30000,
	    //height: 195,
	    rows: rows
	});

	me.callParent();
    }
});
