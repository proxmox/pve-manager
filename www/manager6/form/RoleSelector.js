Ext.define('PVE.form.RoleSelector', {
    extend: 'PVE.form.ComboGrid',
    alias: ['widget.pveRoleSelector'],

    allowBlank: false,
    autoSelect: false,
    valueField: 'roleid',
    displayField: 'roleid',
    initComponent: function() {
	var me = this;

	var store = new Ext.data.Store({
	    model: 'pve-roles',
	    sorters: [{
		property: 'roleid'
	    }]
	});

	Ext.apply(me, {
	    store: store,
            listConfig: {
		columns: [
		    {
			header: gettext('Role'),
			sortable: true,
			dataIndex: 'roleid',
			flex: 1
		    }
		]
	    }
	});

        me.callParent();

	store.load();
    }

}, function() {

    Ext.define('pve-roles', {
	extend: 'Ext.data.Model',
	fields: [ 'roleid', 'privs' ],
	proxy: {
            type: 'pve',
	    url: "/api2/json/access/roles"
	},
	idProperty: 'roleid'
    });

});
