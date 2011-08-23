Ext.define('PVE.storage.ContentView', {
    extend: 'Ext.grid.GridPanel',

    alias: ['widget.pveStorageContentView'],

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

	var store = new Ext.data.Store({
	    model: 'pve-storage-content',
	    proxy: {
                type: 'pve',
		url: "/api2/json/nodes/" + nodename + "/storage/" + storage + "/content"
	    },
	    sorters: { 
		property: 'volid', 
		order: 'DESC' 
	    }
	});


	Ext.apply(me, {
	    store: store,
	    stateful: false,
	    viewConfig: {
		trackOver: false
	    },
	    columns: [
		{
		    header: 'Name',
		    flex: 1,
		    sortable: true,
		    renderer: PVE.Utils.render_storage_content,
		    dataIndex: 'volid'
		},
		{
		    header: 'Format',
		    width: 100,
		    dataIndex: 'format'
		},
		{
		    header: 'Size',
		    width: 100,
		    renderer: PVE.Utils.format_size,
		    dataIndex: 'size'
		}
	    ],
	    listeners: {
		show: function() {
		    store.load();
		}
	    }
	});

	me.callParent();
    }
}, function() {

    Ext.define('pve-storage-content', {
	extend: 'Ext.data.Model',
	fields: [ 
	    'volid', 'format', 'size', 'used', 'vmid', 
	    'channel', 'id', 'lun'
	],
	idProperty: 'volid'
    });

});