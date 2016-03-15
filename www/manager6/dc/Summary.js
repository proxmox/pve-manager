Ext.define('PVE.dc.NodeView', {
    extend: 'Ext.grid.GridPanel',

    alias: ['widget.pveDcNodeView'],

    initComponent : function() {
	var me = this;

	var rstore = Ext.create('PVE.data.UpdateStore', {
	    interval: 3000,
	    storeid: 'pve-dc-nodes',
	    model: 'pve-dc-nodes',
	    proxy: {
                type: 'pve',
                url: "/api2/json/cluster/status"
	    },
	    filters: {
		property: 'type',
		value   : 'node'
	    }
	});

	var store = Ext.create('PVE.data.DiffStore', { rstore: rstore });

	var noClusterText = gettext("Standalone node - no cluster defined");
	var status = Ext.create('Ext.Component', {
	    padding: 2,
	    html: '&nbsp;',
	    dock: 'bottom'
	});

	Ext.apply(me, {
	    store: store,
	    stateful: false,
	    bbar: [ status ],
	    columns: [
		{
		    header: gettext('Name'),
		    width: 200,
		    sortable: true,
		    dataIndex: 'name'
		},
		{
		    header: 'ID',
		    width: 50,
		    sortable: true,
		    dataIndex: 'nodeid'
		},
		{
		    header: gettext('Online'),
		    width: 100,
		    sortable: true,
		    dataIndex: 'online',
		    renderer: PVE.Utils.format_boolean
		},
		{
		    header: gettext('Support'),
		    width: 100,
		    sortable: true,
		    dataIndex: 'level',
		    renderer: PVE.Utils.render_support_level
		},
		{
		    header: gettext('Server Address'),
		    flex: 1,
		    sortable: true,
		    dataIndex: 'ip'
		}
	    ],
	    listeners: {
		show: rstore.startUpdate,
		hide: rstore.stopUpdate,
		destroy: rstore.stopUpdate
	    }
	});

	me.callParent();

	me.mon(rstore, 'load', function(s, records, success) {
	    if (!success) {
		return;
	    }

	    var cluster_rec = rstore.getById('cluster');

	    if (!cluster_rec) {
		status.update(noClusterText);
		return;
	    }

	    var cluster_data = cluster_rec.getData();
	    if (!cluster_data) {
		status.update(noClusterText);
		return;
	    }
	    var text = gettext("Cluster") + ": " + cluster_data.name + ",  " +
		gettext("Quorate") + ": " + PVE.Utils.format_boolean(cluster_data.quorate);
	    status.update(text);
	});

    }
}, function() {

    Ext.define('pve-dc-nodes', {
	extend: 'Ext.data.Model',
	fields: [ 'id', 'type', 'name', 'nodeid', 'ip', 'level', 'local', 'online'],
	idProperty: 'id'
    });

});

Ext.define('PVE.dc.Summary', {
    extend: 'Ext.panel.Panel',

    alias: ['widget.pveDcSummary'],

    initComponent: function() {
        var me = this;

	var nodegrid = Ext.create('PVE.dc.NodeView', {
	    title: gettext('Nodes'),
	    border: false,
	    region: 'center',
	    flex: 3
	});

	Ext.apply(me, {
	    layout: 'border',
	    items: [ nodegrid ],
	    listeners: {
		activate: function() {
		    nodegrid.fireEvent('show', nodegrid);
		},
		hide: function() {
		    nodegrid.fireEvent('hide', nodegrid);
		}
	    }
	});

	me.callParent();
    }
});
