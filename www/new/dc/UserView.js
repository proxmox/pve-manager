Ext.define('PVE.dc.UserView', {
    extend: 'Ext.grid.GridPanel',

    alias: ['widget.pveUserView'],

    initComponent : function() {
	var me = this;

	var store = new Ext.data.Store({
	    model: Ext.define('pve-users', {
		extend: 'Ext.data.Model',
		fields: [ 
		    'userid', 'firstname', 'lastname' , 'email', 'comment',
		    { type: 'boolean', name: 'enabled' }, 
		    { type: 'date', dateFormat: 'timestamp', name: 'expire' },
		],
		idProperty: 'userid'
	    }),
	    proxy: {
                type: 'pve',
		url: "/api2/json/access/users"
	    },
	    sorters: { 
		property: 'userid', 
		order: 'DESC' 
	    }
	});

	var render_expire = function(date) {
	    if (!date)
		return 'never';

	    return Ext.Date.format(date, "Y-m-d");
	};

	var render_full_name = function(firstname, metaData, record) {

	    var first = firstname || '';
	    var last = record.data.lastname || '';
	    return first + " " + last;
	};

	var render_username = function(userid) {
	    return userid.match(/^([^@]+)/)[1];
	};

	var render_realm = function(userid) {
	    return userid.match(/@([^@]+)$/)[1];
	};

	Ext.apply(me, {
	    store: store,
	    stateful: false,

	    viewConfig: {
		trackOver: false
	    },

	    columns: [
		{
		    header: 'User name',
		    width: 200,
		    sortable: true,
		    renderer: render_username,
		    dataIndex: 'userid'
		},
		{
		    header: 'Realm',
		    width: 100,
		    sortable: true,
		    renderer: render_realm,
		    dataIndex: 'userid'
		},
		{
		    header: 'Enabled',
		    width: 80,
		    sortable: true,
		    dataIndex: 'enabled'
		},
		{
		    header: 'Expire',
		    width: 80,
		    sortable: true,
		    renderer: render_expire, 
		    dataIndex: 'expire'
		},
		{
		    header: 'Name',
		    width: 150,
		    sortable: true,
		    renderer: render_full_name,
		    dataIndex: 'firstname'
		},
		{
		    id: 'comment',
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