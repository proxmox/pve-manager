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

	Ext.apply(me, {
	    store: store,
	    stateful: false,
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
		    dataIndex: 'state',
		    renderer: PVE.Utils.format_boolean
		},
		{
		    header: gettext('Estranged'),
		    width: 100,
		    sortable: true,
		    dataIndex: 'estranged',
		    renderer: PVE.Utils.format_boolean
		},
		{
		    header: gettext('Server Address'),
		    width: 100,
		    sortable: true,
		    dataIndex: 'ip'
		},
		{
		    header: gettext('Services'),
		    flex: 1,
		    width: 80,
		    sortable: true,
		    dataIndex: 'pmxcfs',
		    renderer: function(value, metaData, record) {
			var list = [];
			var data = record.data;
			if (data) {
			    if (data.pmxcfs) {
				list.push('PVECluster');
			    }
			    if (data.rgmanager) {
				list.push('RGManager');
			    }

			}
			return list.join(', ');
		    }
		}
	    ], 
	    listeners: {
		show: rstore.startUpdate,
		hide: rstore.stopUpdate,
		destroy: rstore.stopUpdate
	    }
	});

	me.callParent();
    }
}, function() {

    Ext.define('pve-dc-nodes', {
	extend: 'Ext.data.Model',
	fields: [ 'id', 'type', 'name', 'state', 'nodeid', 'ip', 
		  'pmxcfs', 'rgmanager', 'estranged' ],
	idProperty: 'id'
    });

});

Ext.define('PVE.dc.HAServiceView', {
    extend: 'Ext.grid.GridPanel',

    alias: ['widget.pveHaServiceView'],

    initComponent : function() {
	var me = this;

	var rstore = Ext.create('PVE.data.UpdateStore', {
	    interval: 3000,
	    storeid: 'pve-ha-services',
	    model: 'pve-ha-services',
	    proxy: {
                type: 'pve',
                url: "/api2/json/cluster/status"
	    },
	    filters: {
		property: 'type',
		value   : 'group'
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
	    //tbar: [ 'start', 'stop' ],
	    bbar: [ status ],
	    columns: [
		{
		    header: gettext('Name'),
		    flex: 1,
		    sortable: true,
		    dataIndex: 'name'
		},
		{
		    header: gettext('Owner'),
		    flex: 1,
		    sortable: true,
		    dataIndex: 'owner'
		},
		{
		    header: gettext('Status'),
		    width: 80,
		    sortable: true,
		    dataIndex: 'state_str'
		},
		{
		    header: gettext('Restarts'),
		    width: 80,
		    sortable: true,
		    dataIndex: 'restarts'
		},
		{
		    header: gettext('Last transition'),
		    width: 200,
		    sortable: true,
		    dataIndex: 'last_transition'
		},
		{
		    header: gettext('Last owner'),
		    flex: 1,
		    sortable: true,
		    dataIndex: 'last_owner'
		}
	    ], 
	    listeners: {
		show: rstore.startUpdate,
		hide: rstore.stopUpdate,
		destroy: rstore.stopUpdate
	    }
	});

	me.callParent();

	rstore.on('load', function(s, records, success) {
	    if (!success) {
		return;
	    }

	    var cluster_rec = rstore.getById('cluster');
	    var quorum_rec = rstore.getById('quorum');

	    if (!(cluster_rec && quorum_rec)) {
		status.update(noClusterText);
		return;
	    }

	    var cluster_raw = cluster_rec.raw;
	    var quorum_raw = quorum_rec.raw;
	    if (!(cluster_raw && quorum_raw)) {
		status.update(noClusterText);
		return;
	    }

	    status.update("Quorate: " + PVE.Utils.format_boolean(quorum_raw.quorate));
	});

    }
}, function() {

    Ext.define('pve-ha-services', {
	extend: 'Ext.data.Model',
	fields: [ 'id', 'type', 'name', 'owner', 'last_owner', 'state_str', 'restarts',
		  { name: 'last_transition',  type: 'date', dateFormat: 'timestamp'}
		],
	idProperty: 'id'
    });

});


Ext.define('PVE.dc.Summary', {
    extend: 'Ext.panel.Panel',

    alias: ['widget.pveDcSummary'],

    initComponent: function() {
        var me = this;

	var hagrid = Ext.create('PVE.dc.HAServiceView', {
	    title: gettext('HA Service Status'),
	    region: 'south',
	    border: false,
	    split: true,
	    flex: 1
	});

	var nodegrid = Ext.create('PVE.dc.NodeView', {
	    title: gettext('Nodes'),
	    border: false,
	    region: 'center',
	    flex: 3
	});

	Ext.apply(me, {
	    layout: 'border',
	    items: [ nodegrid, hagrid ],
	    listeners: {
		show: function() {
		    hagrid.fireEvent('show', hagrid);
		    nodegrid.fireEvent('show', hagrid);
		},
		hide: function() {
		    hagrid.fireEvent('hide', hagrid);
		    nodegrid.fireEvent('hide', hagrid);
		}
	    }
	});

	me.callParent();
    }
});
