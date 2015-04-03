Ext.define('PVE.ha.ResourcesView', {
    extend: 'Ext.grid.GridPanel',
    alias: ['widget.pveHAResourcesView'],

    initComponent : function() {
	var me = this;

	var store = new Ext.data.Store({
	    model: 'pve-ha-resources',
	    proxy: {
                type: 'pve',
		url: "/api2/json/cluster/ha/resources"
	    },
	    sorters: { 
		property: 'sid', 
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
		    header: 'ID',
		    width: 100,
		    sortable: true,
		    dataIndex: 'sid'
		},
		{
		    header: gettext('State'),
		    width: 100,
		    sortable: true,
		    renderer: function(v) {
			return v ? v : 'enabled';
		    },
		    dataIndex: 'state'
		},
		{
		    header: gettext('Group'),
		    width: 200,
		    sortable: true,
		    dataIndex: 'group'
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

    Ext.define('pve-ha-resources', {
	extend: 'Ext.data.Model',
	fields: [ 
	    'sid', 'type', 'state', 'digest', 'group', 'comment'
	],
	idProperty: 'sid'
    });

});
