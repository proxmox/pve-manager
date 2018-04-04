/*jslint confusion: true*/
Ext.define('pve-cluster-nodes', {
    extend: 'Ext.data.Model',
    fields: [
	'node', { type: 'integer', name: 'nodeid' }, 'ring0_addr', 'ring1_addr',
	{ type: 'integer', name: 'quorum_votes' }
    ],
    proxy: {
        type: 'proxmox',
	url: "/api2/json/cluster/config/nodes"
    },
    idProperty: 'nodeid'
});

Ext.define('pve-cluster-info', {
    extend: 'Ext.data.Model',
    proxy: {
        type: 'proxmox',
	url: "/api2/json/cluster/config/join"
    }
});

Ext.define('PVE.ClusterAdministration', {
    extend: 'Ext.panel.Panel',
    xtype: 'pveClusterAdministration',

    title: gettext('Cluster Administration'),

    border: false,
    defaults: { border: false },

    viewModel: {
	parent: null,
	data: {
	    totem: {},
	    nodelist: [],
	    preferred_node: {
		name: '',
		fp: '',
		addr: ''
	    },
	    isInCluster: false,
	    nodecount: 0
	}
    },

    items: [
	{
	    xtype: 'panel',
	    title: gettext('Cluster Information'),
	    controller: {
		xclass: 'Ext.app.ViewController',

		init: function(view) {
		    view.store = Ext.create('Proxmox.data.UpdateStore', {
			autoStart: true,
			interval: 15 * 1000,
			storeid: 'pve-cluster-info',
			model: 'pve-cluster-info'
		    });
		    view.store.on('load', this.onLoad, this);
		    view.on('destroy', view.store.stopUpdate);
		},

		onLoad: function(store, records, success) {
		    var vm = this.getViewModel();
		    if (!success || !records || !records[0].data) {
			vm.set('totem', {});
			vm.set('isInCluster', false);
			vm.set('nodelist', []);
			vm.set('preferred_node', {
			    name: '',
			    addr: '',
			    fp: ''
			});
			return;
		    }
		    var data = records[0].data;
		    vm.set('totem', data.totem);
		    vm.set('isInCluster', !!data.totem.cluster_name);
		    vm.set('nodelist', data.nodelist);

		    var nodeinfo = Ext.Array.findBy(data.nodelist, function (el) {
			return el.name === data.preferred_node;
		    });

		    vm.set('preferred_node', {
			name: data.preferred_node,
			addr: nodeinfo.pve_addr,
			fp: nodeinfo.pve_fp
		    });
		},

		onCreate: function() {
		    var view = this.getView();
		    view.store.stopUpdate();
		    var win = Ext.create('PVE.ClusterCreateWindow', {
			autoShow: true,
			listeners: {
			    destroy: function() {
				view.store.startUpdate();
			    }
			}
		    });
		}
	    },
	    tbar: [
		{
		    text: gettext('Create Cluster'),
		    reference: 'createButton',
		    handler: 'onCreate',
		    bind: {
			disabled: '{isInCluster}'
		    }
		}
	    ],
	    layout: 'hbox',
	    bodyPadding: 5,
	    items: [
		{
		    xtype: 'displayfield',
		    fieldLabel: gettext('Cluster Name'),
		    bind: {
			value: '{totem.cluster_name}',
			hidden: '{!isInCluster}'
		    },
		    flex: 1
		},
		{
		    xtype: 'displayfield',
		    fieldLabel: gettext('Config Version'),
		    bind: {
			value: '{totem.config_version}',
			hidden: '{!isInCluster}'
		    },
		    flex: 1
		},
		{
		    xtype: 'displayfield',
		    fieldLabel: gettext('Number of Nodes'),
		    labelWidth: 120,
		    bind: {
			value: '{nodecount}',
			hidden: '{!isInCluster}'
		    },
		    flex: 1
		},
		{
		    xtype: 'displayfield',
		    value: gettext('Standalone node - no cluster defined'),
		    bind: {
			hidden: '{isInCluster}'
		    },
		    flex: 1
		}
	    ]
	},
	{
	    xtype: 'grid',
	    title: gettext('Cluster Nodes'),
	    controller: {
		xclass: 'Ext.app.ViewController',

		init: function(view) {
		    view.rstore = Ext.create('Proxmox.data.UpdateStore', {
			autoLoad: true,
			xtype: 'update',
			interval: 5 * 1000,
			autoStart: true,
			storeid: 'pve-cluster-nodes',
			model: 'pve-cluster-nodes'
		    });
		    view.setStore(Ext.create('Proxmox.data.DiffStore', {
			rstore: view.rstore,
			sorters: {
			    property: 'nodeid',
			    order: 'DESC'
			}
		    }));
		    Proxmox.Utils.monStoreErrors(view, view.rstore);
		    view.store.on('load', this.onLoad, this);
		    view.on('destroy', view.rstore.stopUpdate);
		},

		onLoad: function(store, records, success) {
		    var vm = this.getViewModel();
		    if (!success || !records) {
			vm.set('nodecount', 0);
			return;
		    }
		    vm.set('nodecount', records.length);
		}
	    },
	    columns: [
		{
		    header: gettext('Nodename'),
		    flex: 2,
		    dataIndex: 'name'
		},
		{
		    header: gettext('ID'),
		    flex: 1,
		    dataIndex: 'nodeid'
		},
		{
		    header: gettext('Votes'),
		    flex: 1,
		    dataIndex: 'quorum_votes'
		},
		{
		    header: gettext('Ring 0'),
		    flex: 2,
		    dataIndex: 'ring0_addr'
		},
		{
		    header: gettext('Ring 1'),
		    flex: 2,
		    dataIndex: 'ring1_addr'
		}
	    ]
	}
    ]
});
