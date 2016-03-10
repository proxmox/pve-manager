Ext.define('PVE.storage.StatusView', {
    extend: 'PVE.grid.ObjectGrid',
    alias: 'widget.pveStorageStatusView',

    title: gettext('Status'),
    cwidth1: 150,
    interval: 30000,
    rows : {
	disable: {
	    header: gettext('Enabled'),
	    required: true,
	    renderer: PVE.Utils.format_neg_boolean
	},
	active: {
	    header: gettext('Active'),
	    required: true,
	    renderer: PVE.Utils.format_boolean
	},
	content: {
	    header: gettext('Content'),
	    required: true,
	    renderer: PVE.Utils.format_content_types
	},
	type: {
	    header: gettext('Type'),
	    required: true,
	    renderer: PVE.Utils.format_storage_type
	},
	shared: {
	    header: gettext('Shared'),
	    required: true,
	    renderer: PVE.Utils.format_boolean
	},
	total: {
	    header: gettext('Size'),
	    required: true,
	    renderer: PVE.Utils.render_size
	},
	used: {
	    header: gettext('Used'),
	    required: true,
	    renderer: PVE.Utils.render_size
	},
	avail: {
	    header: gettext('Avail'),
	    required: true,
	    renderer: PVE.Utils.render_size
	}
    },
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

	Ext.apply(me, {
	    url: "/api2/json/nodes/" + nodename + "/storage/" + storage + "/status",
	});

	me.callParent();
    }
});
