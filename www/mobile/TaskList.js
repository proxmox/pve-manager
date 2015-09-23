Ext.define('PVE.TaskListBase', {
    extend: 'PVE.Page',

    config: {
	baseUrl: undefined,
	items: [
	    {
		xtype: 'pveTitleBar'
	    },
	    {
		xtype: 'list',
		flex: 1,
		disableSelection: true,
		listeners: {
		    itemsingletap: function(list, index, target, record) {
			PVE.Workspace.gotoPage('nodes/' + record.get('node') + '/tasks/' + 
					       record.get('upid'));
		    }
		},
		itemTpl: [
		    '<div style="vertical-align: middle;">' +
		    '<span>{[this.desc(values)]}</span>',
		    '<span style=" font-size:small; float: right;">' +
		    '{starttime:date("M d H:i:s")} - {endtime:date("H:i:s")}' +
		    '</span></div>',
		    '<small>node: {node}<br /> Status: {[this.status(values)]}</small>',
		    {
			desc: function(values) {
			    return PVE.Utils.format_task_description(values.type, values.id);
			},
			status: function(values) {
			    return Ext.String.ellipsis(values.status, 160);
			}
		    }
		]
	    }
	]
    },

    reload: function() {
	var me = this;

	me.store.load();
    },

    initialize: function() {
	var me = this;

	me.store = Ext.create('Ext.data.Store', {
	    model: 'pve-tasks',
	    proxy: {
                type: 'pve',
		url: '/api2/json' + me.getBaseUrl()
	    },
	    sorters: [
		{
		    property : 'starttime',
		    direction: 'DESC'
		}
	    ]
	});

	var list = me.down('list');
	list.setStore(me.store);

	me.reload();
	
	this.callParent();
    }
});

Ext.define('PVE.ClusterTaskList', {
    extend: 'PVE.TaskListBase',

    statics: {
	pathMatch: function(loc) {
	    return loc.match(/^tasks$/);
	}
    },

    config: {
	baseUrl: '/cluster/tasks'
    },

    initialize: function() {
	var me = this;

	me.down('titlebar').setTitle(gettext('Tasks') + ': ' + gettext('Cluster'));

	var match = me.self.pathMatch(me.getAppUrl());
	if (!match) {
	    throw "pathMatch failed";
	}

	this.callParent();
    }
});

Ext.define('PVE.NodeTaskList', {
    extend: 'PVE.TaskListBase',

    statics: {
	pathMatch: function(loc) {
	    return loc.match(/^nodes\/([^\s\/]+)\/tasks$/);
	}
    },

    nodename: undefined,

    initialize: function() {
	var me = this;

	var match = me.self.pathMatch(me.getAppUrl());
	if (!match) {
	    throw "pathMatch failed";
	}

	me.nodename = match[1];

	me.setBaseUrl('/nodes/' + me.nodename + '/tasks');

	me.down('titlebar').setTitle(gettext('Tasks') + ': ' + me.nodename);

	this.callParent();
    }
});


