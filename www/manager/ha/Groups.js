Ext.define('PVE.ha.GroupsView', {
    extend: 'Ext.grid.GridPanel',
    alias: ['widget.pveHAGroupsView'],

    initComponent : function() {
	var me = this;

	var store = new Ext.data.Store({
	    model: 'pve-ha-groups',
	    proxy: {
                type: 'pve',
		url: "/api2/json/cluster/ha/groups"
	    },
	    sorters: { 
		property: 'group', 
		order: 'DESC' 
	    }
	});
	
	var reload = function() {
	    store.load();
	};

	var sm = Ext.create('Ext.selection.RowModel', {});

	Ext.apply(me, {
	    store: store,
	    selModel: sm,
	    stateful: false,
	    viewConfig: {
		trackOver: false
	    },
	    columns: [
		{
		    header: gettext('Group'),
		    width: 150,
		    sortable: true,
		    dataIndex: 'group'
		},
		{
		    header: gettext('restricted'),
		    width: 100,
		    sortable: true,
		    renderer: PVE.Utils.format_boolean,
		    dataIndex: 'restricted'
		},
		{
		    header: gettext('nofailback'),
		    width: 100,
		    sortable: true,
		    renderer: PVE.Utils.format_boolean,
		    dataIndex: 'nofailback'
		},
		{
		    header: gettext('Nodes'),
		    width: 500,
		    sortable: false,
		    dataIndex: 'nodes'
		},
		{
		    header: gettext('Description'),
		    flex: 1,
		    dataIndex: 'comment'
		}
	    ],
	    listeners: {
		show: reload
//		itemdblclick: run_editor
	    }
	});

	me.callParent();
    }
}, function() {

    Ext.define('pve-ha-groups', {
	extend: 'Ext.data.Model',
	fields: [ 
	    'group', 'type', 'restricted', 'digest', 'nofailback',
	    'nodes', 'comment'
	],
	idProperty: 'group'
    });

});
