Ext.define('PVE.form.UserSelector', {
    extend: 'PVE.form.ComboGrid',
    alias: ['widget.pveUserSelector'],

    initComponent: function() {
	var me = this;

	var store = new Ext.data.Store({
	    model: 'pve-users'
	});

	var render_full_name = function(firstname, metaData, record) {

	    var first = firstname || '';
	    var last = record.data.lastname || '';
	    return first + " " + last;
	};

	Ext.apply(me, {
	    store: store,
	    allowBlank: false,
	    autoSelect: false,
	    valueField: 'userid',
	    displayField: 'userid',
            listConfig: {
		columns: [
		    {
			header: gettext('User'),
			sortable: true,
			dataIndex: 'userid',
			flex: 1
		    },
		    {
			header: gettext('Name'),
			sortable: true,
			renderer: render_full_name,
			dataIndex: 'firstname',
			flex: 1
		    },
		    {
			id: 'comment',
			header: gettext('Comment'),
			sortable: false,
			dataIndex: 'comment',
			flex: 1
		    }
		]
	    }
	});

        me.callParent();

	store.load({ params: { enabled: 1 }});
    }

}, function() {

    Ext.define('pve-users', {
	extend: 'Ext.data.Model',
	fields: [ 
	    'userid', 'firstname', 'lastname' , 'email', 'comment',
	    { type: 'boolean', name: 'enable' }, 
	    { type: 'date', dateFormat: 'timestamp', name: 'expire' }
	],
	proxy: {
            type: 'pve',
	    url: "/api2/json/access/users"
	},
	idProperty: 'userid'
    });

});


