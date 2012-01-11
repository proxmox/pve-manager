Ext.define('PVE.dc.ACLView', {
    extend: 'Ext.grid.GridPanel',

    alias: ['widget.pveACLView'],

    // use fixed path
    path: undefined,

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

	if (me.path) {
	    store.filters.add(new Ext.util.Filter({
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


	var run_editor = function() {
	    var rec = sm.getSelection()[0];
	    if (!rec) {
		return;
	    }

	    console.dir(rec);
	};

	var edit_btn = new PVE.button.Button({
	    text: gettext('Edit'),
	    disabled: true,
	    selModel: sm,
	    handler: run_editor
	});

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

	Ext.apply(me, {
	    store: store,
	    selModel: sm,
	    stateful: false,
	    tbar: [
		{
		    text: 'Add',
		    menu: new Ext.menu.Menu({
			items: [
			    {
				text: gettext('Group'),
				handler: function() {
				    console.log("add group");
				}
			    },
			    {
				text: gettext('User'),
				handler: function() {
				    console.log("add user");
				}
			    }
			]
		    })
		},
		remove_btn,
		edit_btn
	    ],
	    viewConfig: {
		trackOver: false
	    },
	    columns: columns,
	    listeners: {
		show: reload,
		itemdblclick: run_editor
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