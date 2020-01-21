/*jslint confusion: true */

Ext.define('pve-permissions', {
    extend: 'Ext.data.TreeModel',
    fields: [
	'text', 'type',
	{ type: 'boolean', name: 'propagate' }
    ]
});

Ext.define('PVE.dc.PermissionGridPanel', {
    extend: 'Ext.tree.Panel',
    onlineHelp: 'chapter_user_management',

    scrollable: true,

    sorterFn: function(rec1, rec2) {
	var v1, v2;

	if (rec1.data.type != rec2.data.type) {
	    v2 = rec1.data.type;
	    v1 = rec2.data.type;
	} else {
	    v1 = rec1.data.text;
	    v2 = rec2.data.text;
	}

	return (v1 > v2 ? 1 : (v1 < v2 ? -1 : 0));
    },

    initComponent: function() {
	var me = this;

	Proxmox.Utils.API2Request({
	    url: '/access/permissions?userid=' + me.userid,
	    method: 'GET',
	    failure: function(response, opts) {
		Proxmox.Utils.setErrorMask(me, response.htmlStatus);
		me.load_task.delay(me.load_delay);
	    },
	    success: function(response, opts) {
		Proxmox.Utils.setErrorMask(me, false);
		var result = Ext.decode(response.responseText);
		var data = result.data || {};
		var records = [];

		var root = { name: '__root', expanded: true, children: [] };
		var idhash = {};
		Ext.Object.each(data, function(path, perms) {
		    var path_item = {};
		    path_item.text = path;
		    path_item.type = 'path';
		    path_item.children = [];
		    Ext.Object.each(perms, function(perm, propagate) {
			var perm_item = {};
			perm_item.text = perm;
			perm_item.type = 'perm';
			perm_item.propagate = propagate == 1 ? true : false;
			perm_item.iconCls = 'fa fa-fw fa-unlock';
			perm_item.leaf = true;
			path_item.children.push(perm_item);
			path_item.expandable = true;
		    });
		    idhash[path] = path_item;
		});

		if (!idhash['/']) {
		    idhash['/'] = {
			children: [],
			text: '/',
			type: 'path',
		    };
		}

		Ext.Object.each(idhash, function(path, item) {
		    var parent_item;
		    if (path == '/') {
			parent_item = root;
			item.expand = true;
		    } else {
			let split_path = path.split('/');
			while (split_path.pop()) {
			    let parent_path = split_path.join('/');
			    if (parent_item = idhash[parent_path]) {
				break;
			    }
			}
		    }
		    if (!parent_item) {
			parent_item = idhash['/'];
		    }
		    parent_item.children.push(item);
		});

		me.setRootNode(root);
	    }
	});

	var sm = Ext.create('Ext.selection.RowModel', {});

	Ext.apply(me, {
	    layout: 'fit',
	    rootVisible: false,
	    animate: false,
	    sortableColumns: false,
	    selModel: sm,
	    columns: [
		{
		    xtype: 'treecolumn',
		    header: gettext('Path') + '/' + gettext('Permission'),
		    flex: 1,
		    sortable: true,
		    dataIndex: 'text'
		},
		{
		    header: gettext('Propagate'),
		    width: 80,
		    sortable: true,
		    renderer: function(value) {
			if (Ext.isDefined(value)) {
			    return Proxmox.Utils.format_boolean(value);
			} else {
			    return '';
			}
		    },
		    dataIndex: 'propagate'
		},
	    ],
	    listeners: {
	    }
	});

	me.callParent();

	me.store.sorters.add(new Ext.util.Sorter({
	    sorterFn: me.sorterFn
	}));
    }
});

Ext.define('PVE.dc.PermissionView', {
    extend: 'Ext.window.Window',
    scrollable: true,
    width: 800,
    height: 600,
    layout: 'fit',

    initComponent: function() {
	var me = this;

	if (!me.userid) {
	    throw "no userid specified";
	}

	var grid = Ext.create('PVE.dc.PermissionGridPanel', {
	    userid: me.userid
	});

	Ext.apply(me, {
	    title: me.userid + ' - ' + gettext('Permissions'),
	    items: [ grid ]
	});

	me.callParent();
    }
});

