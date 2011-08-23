Ext.ns("PVE");

PVE.UserView = Ext.extend(PVE.grid.StdGrid, {

    initComponent : function() {
	var self = this;

	var store = new Ext.data.JsonStore({
	    url: "/api2/json/access/users",
	    autoDestory: true,
	    root: 'data',
	    restful: true, // use GET, not POST
	    fields: [ 
		'userid', 'firstname', 'lastname' , 'email', 'comment',
		{ type: 'boolean', name: 'enabled' }, 
		{ type: 'date', dateFormat: 'timestamp', name: 'expire' },
	    ],
	    idProperty: 'userid',
	    sortInfo: { field: 'userid', order: 'DESC' }
	});

	var render_expire = function(date) {
	    if (!date)
		return 'never';

	    return date.format("Y-m-d");
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

	Ext.apply(self, {
	    store: store,
	    autoExpandColumn: 'comment',
	    stateful: false,
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
		    width: 50,
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
		    dataIndex: 'comment'
		}
	    ],
	    listeners: {
		show: function() {
		    store.load();
		}
	    }
	});

	PVE.UserView.superclass.initComponent.call(self);
    }
});
Ext.reg('pveUserView', PVE.UserView);

PVE.GroupView = Ext.extend(PVE.grid.StdGrid, {

    initComponent : function() {
	var self = this;

	var store = new Ext.data.JsonStore({
	    url: "/api2/json/access/groups",
	    autoDestory: true,
	    root: 'data',
	    restful: true, // use GET, not POST
	    fields: [ 'groupid', 'comment' ],
	    idProperty: 'groupid',
	    sortInfo: { field: 'groupid', order: 'DESC' }
	});

	Ext.apply(self, {
	    store: store,
	    autoExpandColumn: 'comment',
	    stateful: false,
	    columns: [
		{
		    header: 'Group name',
		    width: 200,
		    sortable: true,
		    dataIndex: 'groupid'
		},
		{
		    id: 'comment',
		    header: 'Comment',
		    sortable: false,
		    dataIndex: 'comment'
		}
	    ],
	    listeners: {
		show: function() {
		    store.load();
		}
	    }
	});

	PVE.GroupView.superclass.initComponent.call(self);
    }
});
Ext.reg('pveGroupView', PVE.GroupView);

PVE.RoleView = Ext.extend(PVE.grid.StdGrid, {

    initComponent : function() {
	var self = this;

	var store = new Ext.data.JsonStore({
	    url: "/api2/json/access/roles",
	    autoDestory: true,
	    root: 'data',
	    restful: true, // use GET, not POST
	    fields: [ 'roleid', 'privs' ],
	    idProperty: 'roleid',
	    sortInfo: { field: 'roleid', order: 'DESC' }
	});

	var render_privs = function(value) {

	    if (!value)
		return '-';

	    // allow word wrap
	    return '<div style="white-space:normal;">' 
		+ value.replace(/\,/g, ' ') + "</div>";

	};

	Ext.apply(self, {
	    store: store,
	    autoExpandColumn: 'privs',
	    stateful: false,
	    columns: [
		{
		    header: 'Role name',
		    width: 150,
		    sortable: true,
		    dataIndex: 'roleid'
		},
		{
		    id: 'privs',
		    header: 'Privileges',
		    sortable: false,
		    renderer: render_privs,
		    dataIndex: 'privs'
		}
	    ],
	    listeners: {
		show: function() {
		    store.load();
		}
	    }
	});

	PVE.RoleView.superclass.initComponent.call(self);
    }
});
Ext.reg('pveRoleView', PVE.RoleView);

PVE.ACLView = Ext.extend(PVE.grid.StdGrid, {

    initComponent : function() {
	var self = this;

	var store = new Ext.data.JsonStore({
	    url: "/api2/json/access/acl",
	    autoDestory: true,
	    root: 'data',
	    restful: true, // use GET, not POST
	    fields: [ 'path', 'type', 'ugid', 'roleid', 
		      { name: 'propagate', type: 'boolean'} ],
	    sortInfo: { field: 'path', order: 'DESC' }
	});

	var render_ugid = function(ugid, metaData, record) {
	    if (record.data.type == 'group')
		return '@' + ugid;

	    return ugid;
	};

	Ext.apply(self, {
	    store: store,
	    stateful: false,
	    columns: [
		{
		    header: 'Path',
		    width: 200,
		    sortable: true,
		    dataIndex: 'path'
		},
		{
		    header: 'User/Group',
		    width: 200,
		    sortable: true,
		    renderer: render_ugid,
		    dataIndex: 'ugid'
		},
		{
		    header: 'Role',
		    width: 150,
		    sortable: true,
		    dataIndex: 'roleid'
		},
		{
		    header: 'Propagate',
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

	PVE.ACLView.superclass.initComponent.call(self);
    }
});
Ext.reg('pveACLView', PVE.ACLView);

PVE.AuthView = Ext.extend(PVE.grid.StdGrid, {

    initComponent : function() {
	var self = this;

	var store = new Ext.data.JsonStore({
	    url: "/api2/json/access/domains",
	    autoDestory: true,
	    root: 'data',
	    restful: true, // use GET, not POST
	    fields: [ 'realm', 'type', 'comment' ],
	    idProperty: 'realm',
	    sortInfo: { field: 'realm', order: 'DESC' }
	});

	Ext.apply(self, {
	    store: store,
	    autoExpandColumn: 'comment',
	    stateful: false,
	    columns: [
		{
		    header: 'Realm',
		    width: 100,
		    sortable: true,
		    dataIndex: 'realm'
		},
		{
		    header: 'Type',
		    width: 100,
		    sortable: true,
		    dataIndex: 'type'
		},
		{
		    id: 'comment',
		    header: 'Comment',
		    sortable: false,
		    dataIndex: 'comment'
		}
	    ],
	    listeners: {
		show: function() {
		    store.load();
		}
	    }
	});

	PVE.AuthView.superclass.initComponent.call(self);
    }
});
Ext.reg('pveAuthView', PVE.AuthView);

PVE.ClusterConfig = Ext.extend(PVE.ConfigPanel, {

    initComponent : function() {
	var self = this;

	var clusterid = self.clusterid;

	if (!clusterid)
	    throw "no cluster ID specified";

	Ext.apply(self, { 
	    title: "Cluster '" + clusterid + "'",
	    layout: 'fit',
  	    border: false,
	    showSearch: true,
 	    items: [
		{
		    title: 'Summary',
		    id: 'summary',
		    html: 'summary ' + clusterid
		},
		{
		    title: 'Storage',
		    id: 'storage',
		    html: 'storage ' + clusterid
		},
		{
		    xtype: 'pveUserView',
		    title: 'Users',
		    id: 'users'
		},
		{
		    xtype: 'pveGroupView',
		    title: 'Groups',
		    id: 'groups'
		},
		{
		    xtype: 'pveACLView',
		    title: 'Permissions',
		    id: 'permissions',
		},
		{
		    xtype: 'pveRoleView',
		    title: 'Roles',
		    id: 'roles'
		},
		{
		    xtype: 'pveAuthView',
		    title: 'Authentication',
		    id: 'domains'
		},
	    ]
	});

	PVE.ClusterConfig.superclass.initComponent.call(self);
    }
});

Ext.reg('pveClusterConfig', PVE.ClusterConfig);

