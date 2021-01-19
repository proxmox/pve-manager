Ext.define('PVE.form.UserSelector', {
    extend: 'Proxmox.form.ComboGrid',
    alias: ['widget.pveUserSelector'],

    allowBlank: false,
    autoSelect: false,
    valueField: 'userid',
    displayField: 'userid',

    editable: true,
    anyMatch: true,
    forceSelection: true,

    initComponent: function() {
	var me = this;

	var store = new Ext.data.Store({
	    model: 'pve-users',
	    sorters: [{
		property: 'userid',
	    }],
	});

	Ext.apply(me, {
	    store: store,
            listConfig: {
		columns: [
		    {
			header: gettext('User'),
			sortable: true,
			dataIndex: 'userid',
			renderer: Ext.String.htmlEncode,
			flex: 1,
		    },
		    {
			header: gettext('Name'),
			sortable: true,
			renderer: PVE.Utils.render_full_name,
			dataIndex: 'firstname',
			flex: 1,
		    },
		    {
			header: gettext('Comment'),
			sortable: false,
			dataIndex: 'comment',
			renderer: Ext.String.htmlEncode,
			flex: 1,
		    },
		],
	    },
	});

        me.callParent();

	store.load({ params: { enabled: 1 }});
    },

}, function() {

    Ext.define('pve-users', {
	extend: 'Ext.data.Model',
	fields: [
	    'userid', 'firstname', 'lastname', 'email', 'comment',
	    { type: 'boolean', name: 'enable' },
	    { type: 'date', dateFormat: 'timestamp', name: 'expire' },
	],
	proxy: {
            type: 'proxmox',
	    url: "/api2/json/access/users",
	},
	idProperty: 'userid',
    });

});


