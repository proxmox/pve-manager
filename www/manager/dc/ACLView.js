Ext.define('PVE.dc.ACLView', {
    extend: 'Ext.grid.GridPanel',

    alias: ['widget.pveACLView'],

    initComponent : function() {
	var me = this;

	var store = new Ext.data.Store({
	    model: 'pve-acl',
	    proxy: {
                type: 'pve',
		url: "/api2/json/access/acl"
	    },
	    sorters: { 
		property: 'path', 
		order: 'DESC' 
	    }
	});

	var render_ugid = function(ugid, metaData, record) {
	    if (record.data.type == 'group') {
		return '@' + ugid;
	    }

	    return ugid;
	};

	Ext.apply(me, {
	    store: store,
	    stateful: false,
	    viewConfig: {
		trackOver: false
	    },
	    columns: [
		{
		    header: gettext('Path'),
		    width: 200,
		    sortable: true,
		    dataIndex: 'path'
		},
		{
		    header: gettext('User') + '/' + gettext('Group'),
		    width: 200,
		    sortable: true,
		    renderer: render_ugid,
		    dataIndex: 'ugid'
		},
		{
		    header: gettext('Role'),
		    width: 150,
		    sortable: true,
		    dataIndex: 'roleid'
		},
		{
		    header: gettext('Propagate'),
		    width: 80,
		    sortable: true,
		    dataIndex: 'propagate'
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

    Ext.define('pve-acl', {
	extend: 'Ext.data.Model',
	fields: [ 
	    'path', 'type', 'ugid', 'roleid', 
	    { 
		name: 'propagate', 
		type: 'boolean'
	    } 
	]
    });

});