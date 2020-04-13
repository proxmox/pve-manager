Ext.define('PVE.sdn.ZoneView', {
    extend: 'Ext.grid.GridPanel',

    alias: ['widget.pveSDNZoneView'],

    stateful: true,
    stateId: 'grid-sdn-zone',

    createSDNEditWindow: function(type, sid) {
	let schema = PVE.Utils.sdnzoneSchema[type];
	if (!schema || !schema.ipanel) {
	    throw "no editor registered for zone type: " + type;
	}

	Ext.create('PVE.sdn.zones.BaseEdit', {
	    paneltype: 'PVE.sdn.zones.' + schema.ipanel,
	    type: type,
	    zone: sid,
	    autoShow: true,
	    listeners: {
		destroy: this.reloadStore
	    }
	});
    },

    initComponent : function() {
	let me = this;

	let store = new Ext.data.Store({
	    model: 'pve-sdn-zone',
	    proxy: {
                type: 'proxmox',
		url: "/api2/json/cluster/sdn/zones"
	    },
	    sorters: {
		property: 'zone',
		order: 'DESC'
	    },
	});

	let reload = function() {
	    store.load();
	};

	let sm = Ext.create('Ext.selection.RowModel', {});

	let run_editor = function() {
	    let rec = sm.getSelection()[0];
	    if (!rec) {
		return;
	    }
	    let type = rec.data.type,
	        zone = rec.data.zone;

	    me.createSDNEditWindow(type, zone);
	};

	let edit_btn = new Proxmox.button.Button({
	    text: gettext('Edit'),
	    disabled: true,
	    selModel: sm,
	    handler: run_editor
	});

	let remove_btn = Ext.create('Proxmox.button.StdRemoveButton', {
	    selModel: sm,
	    baseurl: '/cluster/sdn/zones/',
	    callback: reload
	});

	// else we cannot dynamically generate the add menu handlers
	let addHandleGenerator = function(type) {
	    return function() { me.createSDNEditWindow(type); };
	};
	let addMenuItems = [], type;
	/*jslint forin: true */

	for (type in PVE.Utils.sdnzoneSchema) {
	    let zone = PVE.Utils.sdnzoneSchema[type];
	    if (zone.hideAdd) {
		continue;
	    }
	    addMenuItems.push({
		text:  PVE.Utils.format_sdnzone_type(type),
		iconCls: 'fa fa-fw fa-' + zone.faIcon,
		handler: addHandleGenerator(type)
	    });
	}

	Ext.apply(me, {
	    store: store,
	    reloadStore: reload,
	    selModel: sm,
	    viewConfig: {
		trackOver: false
	    },
	    tbar: [
		{
		    text: gettext('Add'),
		    menu: new Ext.menu.Menu({
			items: addMenuItems
		    })
		},
		remove_btn,
		edit_btn,
	    ],
	    columns: [
		{
		    header: 'ID',
		    flex: 2,
		    dataIndex: 'zone'
		},
		{
		    header: gettext('Type'),
		    flex: 1,
		    dataIndex: 'type',
		    renderer: PVE.Utils.format_sdnzone_type
		},
		{
		    header: gettext('Nodes'),
		    flex: 3,
		    dataIndex: 'nodes',
		},
	    ],
	    listeners: {
		activate: reload,
		itemdblclick: run_editor
	    }
	});

	me.callParent();
    }
});
