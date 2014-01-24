
Ext.define('PVE.node.CephDiskList', {
    extend: 'Ext.grid.GridPanel',
    alias: ['widget.pveNodeCephDiskList'],

    initComponent: function() {
	 /*jslint confusion: true */
        var me = this;

	var nodename = me.pveSelNode.data.node;
	if (!nodename) {
	    throw "no node name specified";
	}

	var sm = Ext.create('Ext.selection.RowModel', {});

	var rstore = Ext.create('PVE.data.UpdateStore', {
	    interval: 3000,
	    storeid: 'ceph-disk-list',
	    model: 'ceph-disk-list',
	    proxy: {
                type: 'pve',
                url: "/api2/json/nodes/" + nodename + "/ceph/disks"
	    },
	    sorters: [
		{
		    property : 'dev',
		    direction: 'ASC'
		}
	    ]
	});

	var store = Ext.create('PVE.data.DiffStore', { rstore: rstore });

	PVE.Utils.monStoreErrors(me, rstore);

	var create_btn = new PVE.button.Button({
	    text: gettext('Create') + ': OSD',
	    selModel: sm,
	    disabled: true,
	    enableFn: function(rec) {
		return !rec.data.used;
	    },
	    handler: function() {
		var rec = sm.getSelection()[0];
		
		var win = Ext.create('PVE.CephCreateOsd', {
                    nodename: nodename,
		    dev: rec.data.dev
		});
		win.show();
	    }
	});

	Ext.apply(me, {
	    store: store,
	    selModel: sm,
	    stateful: false,
	    tbar: [ create_btn ],
	    columns: [
		{
		    header: gettext('Device'),
		    width: 100,
		    sortable: true,
		    dataIndex: 'dev'
		},
		{
		    header: gettext('Usage'),
		    width: 80,
		    sortable: false,
		    renderer: function(v, metaData, rec) {
			if (rec && (rec.data.osdid >= 0)) {
			    return "osd." + rec.data.osdid;
			}
			return v || PVE.Utils.noText;
		    },
		    dataIndex: 'used'
		},
		{
		    header: gettext('Size'),
		    width: 100,
		    align: 'right',
		    sortable: false,
		    renderer: PVE.Utils.format_size,
		    dataIndex: 'size'
		},
		{
		    header: gettext('Vendor'),
		    width: 100,
		    sortable: true,
		    dataIndex: 'vendor'
		},
		{
		    header: gettext('Model'),
		    width: 200,
		    sortable: true,
		    dataIndex: 'model'
		},
		{
		    header: gettext('Serial'),
		    flex: 1,
		    sortable: true,
		    dataIndex: 'serial'
		}
	    ],
	    listeners: {
		show: rstore.startUpdate,
		hide: rstore.stopUpdate,
		destroy: rstore.stopUpdate
	    }
	});

	me.callParent();
    }
}, function() {

    Ext.define('ceph-disk-list', {
	extend: 'Ext.data.Model',
	fields: [ 'dev', 'used', { name: 'size', type: 'number'}, 
		  {name: 'osdid', type: 'number'}, 
		  'vendor', 'model', 'serial'],
	idProperty: 'dev'
    });
});

Ext.define('PVE.form.CephDiskSelector', {
    extend: 'PVE.form.ComboGrid',
    alias: ['widget.pveCephDiskSelector'],

    diskType: 'journal_disks',

    initComponent: function() {
	var me = this;

	var nodename = me.nodename;
	if (!nodename) {
	    throw "no node name specified";
	}

	var store = Ext.create('Ext.data.Store', {
	    filterOnLoad: true,
	    model: 'ceph-disk-list',
	    proxy: {
                type: 'pve',
                url: "/api2/json/nodes/" + nodename + "/ceph/disks",
		extraParams: { type: me.diskType }
	    },
	    sorters: [
		{
		    property : 'dev',
		    direction: 'ASC'
		}
	    ]
	});

	Ext.apply(me, {
	    store: store,
	    valueField: 'dev',
	    displayField: 'dev',
            listConfig: {
		columns: [
		    {
			header: gettext('Device'),
			width: 80,
			sortable: true,
			dataIndex: 'dev'
		    },
		    {
			header: gettext('Size'),
			width: 60,
			sortable: false,
			renderer: PVE.Utils.format_size,
			dataIndex: 'size'
		    },
		    {
			header: gettext('Serial'),
			flex: 1,
			sortable: true,
			dataIndex: 'serial'
		    }
		]
	    }
	});

        me.callParent();

	store.load();
    }
});
