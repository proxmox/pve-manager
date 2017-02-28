Ext.define('PVE.dc.ACLAdd', {
    extend: 'PVE.window.Edit',
    alias: ['widget.pveACLAdd'],
    url: '/access/acl',
    method: 'PUT',
    isAdd: true,
    initComponent : function() {

        var me = this;

	me.isCreate = true;

	var items = [
	    {
		xtype: me.path ? 'hiddenfield' : 'textfield',
		name: 'path',
		value: me.path,
		allowBlank: false,
		fieldLabel: gettext('Path')
	    }
	];

	if (me.aclType === 'group') {
	    me.subject = gettext("Group Permission");
	    items.push({
		xtype: 'pveGroupSelector',
		name: 'groups',
		fieldLabel: gettext('Group')
	    });
	} else if (me.aclType === 'user') {
	    me.subject = gettext("User Permission");
	    items.push({
		xtype: 'pveUserSelector',
		name: 'users',
		fieldLabel: gettext('User')
	    });
	} else {
	    throw "unknown ACL type";
	}

	items.push({
	    xtype: 'pveRoleSelector',
	    name: 'roles',
	    value: 'NoAccess',
	    fieldLabel: gettext('Role')
	});

	if (!me.path) {
	    items.push({
		xtype: 'pvecheckbox',
		name: 'propagate',
		checked: true,
		uncheckedValue: 0,
		fieldLabel: gettext('Propagate')
	    });
	}

	var ipanel = Ext.create('PVE.panel.InputPanel', {
	    items: items,
	    onlineHelp: 'pveum_permission_management'
	});

	Ext.apply(me, {
	    items: [ ipanel ]
	});

	me.callParent();
    }
});

Ext.define('PVE.dc.ACLView', {
    extend: 'Ext.grid.GridPanel',

    alias: ['widget.pveACLView'],

    onlineHelp: 'chapter_user_management',

    stateful: true,
    stateId: 'grid-acls',

    // use fixed path
    path: undefined,

    initComponent : function() {
	var me = this;

	var store = Ext.create('Ext.data.Store',{
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

	if (me.path) {
	    store.addFilter(Ext.create('Ext.util.Filter',{
		filterFn: function(item) {
		    if (item.data.path === me.path) {
			return true;
		    }
		}
	    }));
	}

	var render_ugid = function(ugid, metaData, record) {
	    if (record.data.type == 'group') {
		return '@' + ugid;
	    }

	    return ugid;
	};

	var columns = [
	    {
		header: gettext('User') + '/' + gettext('Group'),
		flex: 1,
		sortable: true,
		renderer: render_ugid,
		dataIndex: 'ugid'
	    },
	    {
		header: gettext('Role'),
		flex: 1,
		sortable: true,
		dataIndex: 'roleid'
	    }
	];

	if (!me.path) {
	    columns.unshift({
		header: gettext('Path'),
		flex: 1,
		sortable: true,
		dataIndex: 'path'
	    });
	    columns.push({
		header: gettext('Propagate'),
		width: 80,
		sortable: true,
		dataIndex: 'propagate'
	    });
	}

	var sm = Ext.create('Ext.selection.RowModel', {});

	var reload = function() {
	    store.load();
	};

	var remove_btn = new PVE.button.Button({
	    text: gettext('Remove'),
	    disabled: true,
	    selModel: sm,
	    confirmMsg: gettext('Are you sure you want to remove this entry'),
	    handler: function(btn, event, rec) {
		var params = {
		    'delete': 1,
		    path: rec.data.path,
		    roles: rec.data.roleid
		};
		if (rec.data.type === 'group') {
		    params.groups = rec.data.ugid;
		} else if (rec.data.type === 'user') {
		    params.users = rec.data.ugid;
		} else {
		    throw 'unknown data type';
		}

		PVE.Utils.API2Request({
		    url: '/access/acl',
		    params: params,
		    method: 'PUT',
		    waitMsgTarget: me,
		    callback: function() {
			reload();
		    },
		    failure: function (response, opts) {
			Ext.Msg.alert(gettext('Error'), response.htmlStatus);
		    }
		});
	    }
	});

	PVE.Utils.monStoreErrors(me, store);

	Ext.apply(me, {
	    store: store,
	    selModel: sm,
	    tbar: [
		{
		    text: gettext('Add'),
		    menu: {
			xtype: 'menu',
			items: [
			    {
				text: gettext('Group Permission'),
				iconCls: 'fa fa-fw fa-group',
				handler: function() {
				    var win = Ext.create('PVE.dc.ACLAdd',{
					aclType: 'group',
					path: me.path
				    });
				    win.on('destroy', reload);
				    win.show();
				}
			    },
			    {
				text: gettext('User Permission'),
				iconCls: 'fa fa-fw fa-user',
				handler: function() {
				    var win = Ext.create('PVE.dc.ACLAdd',{
					aclType: 'user',
					path: me.path
				    });
				    win.on('destroy', reload);
				    win.show();
				}
			    }
			]
		    }
		},
		remove_btn
	    ],
	    viewConfig: {
		trackOver: false
	    },
	    columns: columns,
	    listeners: {
		activate: reload
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
