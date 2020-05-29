Ext.define('PVE.dc.RoleView', {
    extend: 'Ext.grid.GridPanel',

    alias: ['widget.pveRoleView'],

    onlineHelp: 'pveum_roles',

    stateful: true,
    stateId: 'grid-roles',

    initComponent : function() {
	var me = this;

	var store = new Ext.data.Store({
	    model: 'pmx-roles',
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

	Proxmox.Utils.monStoreErrors(me, store);

	var sm = Ext.create('Ext.selection.RowModel', {});

	var reload = function() {
		store.load();
	};

	var run_editor = function() {
	    var rec = sm.getSelection()[0];
	    if (!rec) {
		return;
	    }

	    if (!!rec.data.special) {
		return;
	    }

	    var win = Ext.create('PVE.dc.RoleEdit',{
		roleid: rec.data.roleid,
		privs: rec.data.privs
	    });
	    win.on('destroy', reload);
	    win.show();
	};

	Ext.apply(me, {
	    store: store,
	    selModel: sm,

	    viewConfig: {
		trackOver: false
	    },
	    columns: [
		{
		    header: gettext('Built-In'),
		    width: 65,
		    sortable: true,
		    dataIndex: 'special',
		    renderer: Proxmox.Utils.format_boolean
		},
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
		},
		itemdblclick: run_editor
	    },
	    tbar: [
		{
		    text: gettext('Create'),
		    handler: function() {
			var win = Ext.create('PVE.dc.RoleEdit', {});
			win.on('destroy', reload);
			win.show();
		    }
		},
		{
		    xtype: 'proxmoxButton',
		    text: gettext('Edit'),
		    disabled: true,
		    selModel: sm,
		    handler: run_editor,
		    enableFn: (rec) => !rec.data.special,
		},
		{
		    xtype: 'proxmoxStdRemoveButton',
		    selModel: sm,
		    callback: function() {
			reload();
		    },
		    baseurl: '/access/roles/',
		    enableFn: (rec) => !rec.data.special,
		}
	    ]
	});

	me.callParent();
    }
});
