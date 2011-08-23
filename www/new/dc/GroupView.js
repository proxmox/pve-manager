Ext.define('PVE.dc.GroupView', {
    extend: 'Ext.grid.GridPanel',

    alias: ['widget.pveGroupView'],

    initComponent : function() {
	var me = this;

	var store = new Ext.data.Store({
	    model: Ext.define('pve-groups', {
		extend: 'Ext.data.Model',
		fields: [ 'groupid', 'comment' ],
		idProperty: 'groupid'
	    }),
	    proxy: {
                type: 'pve',
		url: "/api2/json/access/groups"
	    },
	    sorters: { 
		property: 'groupid', 
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
		    header: 'Group name',
		    width: 200,
		    sortable: true,
		    dataIndex: 'groupid'
		},
		{
		    header: 'Comment',
		    sortable: false,
		    dataIndex: 'comment',
		    flex: 1
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
});