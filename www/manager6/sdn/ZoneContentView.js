Ext.define('PVE.sdn.ZoneContentView', {
    extend: 'Ext.grid.GridPanel',
    alias: 'widget.pveSDNZoneContentView',

    stateful: true,
    stateId: 'grid-sdnzone-content',
    viewConfig: {
	trackOver: false,
	loadMask: false,
    },
    features: [
	{
	    ftype: 'grouping',
	    groupHeaderTpl: '{name} ({rows.length} Item{[values.rows.length > 1 ? "s" : ""]})',
	},
    ],
    initComponent : function() {
	var me = this;

	var nodename = me.pveSelNode.data.node;
	if (!nodename) {
	    throw "no node name specified";
	}

	var zone = me.pveSelNode.data.sdn;
	if (!zone) {
	    throw "no zone ID specified";
	}

	var baseurl = "/nodes/" + nodename + "/sdn/zones/" + zone + "/content";
	var store = Ext.create('Ext.data.Store', {
	    model: 'pve-sdnzone-content',
	    groupField: 'content',
	    proxy: {
                type: 'proxmox',
		url: '/api2/json' + baseurl,
	    },
	    sorters: {
		property: 'vnet',
		order: 'DESC',
	    },
	});

	var sm = Ext.create('Ext.selection.RowModel', {});

	var reload = function() {
	    store.load();
	};

	Proxmox.Utils.monStoreErrors(me, store);

	Ext.apply(me, {
	    store: store,
	    selModel: sm,
	    tbar: [
	    ],
	    columns: [
		{
		    header: 'VNet',
		    flex: 1,
		    sortable: true,
		    dataIndex: 'vnet',
		},
		{
		    header: gettext('Status'),
		    width: 20,
		    dataIndex: 'status',
		},
		{
		    header: gettext('Details'),
		    width: 20,
		    dataIndex: 'statusmsg',
		},
	    ],
	    listeners: {
		activate: reload,
	    },
	});

	me.callParent();

    },
}, function() {

    Ext.define('pve-sdnzone-content', {
	extend: 'Ext.data.Model',
	fields: [
	    'vnet', 'status', 'statusmsg',
	    {
		name: 'text',
		convert: function(value, record) {
		    // check for volid, because if you click on a grouping header,
		    // it calls convert (but with an empty volid)
		    if (value || record.data.vnet === null) {
			return value;
		    }
		    return PVE.Utils.format_sdnvnet_type(value, {}, record);
		},
	    },
	],
	idProperty: 'vnet',
    });

});
