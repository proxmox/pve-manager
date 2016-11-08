Ext.define('PVE.dc.RoleView', {
    extend: 'Ext.grid.GridPanel',

    alias: ['widget.pveRoleView'],

    onlineHelp: 'pveum_roles',

    stateful: true,
    stateId: 'grid-roles',

    initComponent : function() {
	var me = this;

	var store = new Ext.data.Store({
	    model: 'pve-roles',
	    sorters: { 
		property: 'roleid', 
		order: 'DESC' 
	    }
	});

	var render_privs = function(value, metaData) {

	    if (!value) {
		return '-';
	    }

	    // allow word wrap
	    metaData.style = 'white-space:normal;';

	    return value.replace(/\,/g, ' ');
	};

	PVE.Utils.monStoreErrors(me, store);

	Ext.apply(me, {
	    store: store,

	    viewConfig: {
		trackOver: false
	    },
	    columns: [
		{
		    header: gettext('Name'),
		    width: 150,
		    sortable: true,
		    dataIndex: 'roleid'
		},
		{
		    itemid: 'privs',
		    header: gettext('Privileges'),
		    sortable: false,
		    renderer: render_privs,
		    dataIndex: 'privs',
		    flex: 1
		}
	    ],
	    listeners: {
		activate: function() {
		    store.load();
		}
	    }
	});

	me.callParent();
    }
});
