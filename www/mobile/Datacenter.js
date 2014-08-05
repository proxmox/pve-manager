Ext.define('PVE.ClusterInfo', {
    extend: 'Ext.Component',
    alias: 'widget.pveClusterInfo',

    config: {
	style: 'background-color: white;',
	styleHtmlContent: true,
	tpl: [
	    '<table style="margin-bottom:0px;">',
	    '<tr><td>Node:</td><td><b>{local_node}</large></b></tr>',
	    '<tpl if="cluster_name">',
	    '<tr><td>Cluster:</td><td>{cluster_name}</td></tr>',
	    '<tr><td>Members:</td><td>{nodes}</td></tr>',
	    '<tr><td>Quorate:</td><td>{quorate}</td></tr>',
	    '</tpl>',
	    '<tr><td>Version:</td><td>{version}</td></tr>',
	    '</table>',
	]
    },
});

Ext.define('PVE.Datacenter', {
    extend: 'PVE.Page',
    alias: 'widget.pveDatacenter',

    statics: {
	pathMatch: function(loc) {
	    if (loc === '') {
		return [''];
	    }
	}
    },

    config: {
	appUrl: '',
	items: [
	    { 
		xtype: 'titlebar',
		docked: 'top',
		title: gettext('Datacenter'),
		items: [
		    { 
			xtype: 'button',
			align: 'right',
			iconCls: 'refresh',
			handler: function() {
			    this.up('pvePage').reload();
			}
		    },
		    {
			xtype: 'pveMenuButton',
			align: 'right',
			pveStdMenu: true,
			menuItems: [
			    { 
				text: gettext('Tasks'),
				handler: function() {
				    PVE.Workspace.gotoPage('tasks');
				}
			    }
			]
		    }
		]
	    },
	    {
 		xtype: 'pveClusterInfo'
	    },
            {
                xtype: 'component',
                cls: 'dark',
		padding: 5,
 		html: gettext('Nodes')
            },
	    {
		xtype: 'list',
		flex: 1,
		disableSelection: true,
		listeners: {
		    itemsingletap: function(list, index, target, record) {
			PVE.Workspace.gotoPage('nodes/' + record.get('name'));
		    } 
		},
		itemTpl: '{name}' +
		    '<br><small>Online: {[PVE.Utils.format_boolean(values.state)]}</small>' +
		    '<br><small>Support: {[PVE.Utils.render_support_level(values.level)]}</small>'
	    }
	]	
    },

    reload: function() {
	var me = this;

	var ci = me.down('pveClusterInfo');

	me.setMasked(false);

	me.summary = {};

	PVE.Utils.API2Request({
	    url: '/version',
	    method: 'GET',
	    success: function(response) {
		var d = response.result.data;
		me.summary.version = d.version + '-' + d.release + '/' + d.repoid;
		ci.setData(me.summary);
	    }
	});

	var list = me.down('list');

	PVE.Utils.API2Request({
	    url: '/cluster/status',
	    method: 'GET',
	    success: function(response) {
		var d = response.result.data;
		list.setData(d.filter(function(el) { return (el.type === "node"); }));

		var node_count = 0;
		d.forEach(function(el) {
		    if (el.type === "node") {
			node_count++;
			if (el.local) {
			    me.summary.local_node = el.name;
			}
		    } else if (el.type === "cluster") {
			me.summary.cluster_name = el.name;
		    } else if (el.type === "quorum") {
			me.summary.quorate = el.quorate;
		    }
		});

		me.summary.nodes = node_count;
		ci.setData(me.summary);
	    },
	    failure: function(response) {
		me.setMasked({ xtype: 'loadmask', message: response.htmlStatus} );
	    }
	});
    },

    initialize: function() {
	var me = this;

	me.reload();
    }

});

