/*jslint confusion: true */
Ext.define('PVE.CephCreateFS', {
    extend: 'Proxmox.window.Edit',
    alias: 'widget.pveCephCreateFS',

    showTaskViewer: true,
    //onlineHelp: 'pve_ceph_fs',

    subject: 'Ceph FS',
    isCreate: true,
    method: 'POST',

    setFSName: function(fsName) {
	var me = this;

	if (fsName === '' || fsName === undefined) {
	    fsName = 'cephfs';
	}

	me.url = "/nodes/" + me.nodename + "/ceph/fs/" + fsName;
    },

    items: [
	{
	    xtype: 'textfield',
	    fieldLabel: gettext('Name'),
	    name: 'name',
	    value: 'cephfs',
	    listeners: {
		change: function(f, value) {
		    this.up('pveCephCreateFS').setFSName(value);
		}
	    },
	    submitValue: false, // already encoded in apicall URL
	    emptyText: 'cephfs'
	},
	{
	    xtype: 'proxmoxintegerfield',
	    fieldLabel: 'pg_num',
	    name: 'pg_num',
	    value: 64,
	    emptyText: 64,
	    minValue: 8,
	    maxValue: 32768,
	    allowBlank: false
	},
	{
	    xtype: 'proxmoxcheckbox',
	    fieldLabel: gettext('Add Storage'),
	    value: true,
	    name: 'add_storage'
	}
    ],

    initComponent : function() {
	var me = this;

	if (!me.nodename) {
	    throw "no node name specified";
	}
	me.setFSName();

	me.callParent();
    }
});

Ext.define('PVE.CephCreateMDS', {
    extend: 'Proxmox.window.Edit',
    alias: 'widget.pveCephCreateMDS',

    showProgress: true,
    //onlineHelp: 'pve_ceph_mds',

    subject: 'Ceph MDS',
    isCreate: true,
    method: 'POST',

    setNode: function(nodename) {
	var me = this;

	me.nodename = nodename;
	me.url = "/nodes/" + nodename + "/ceph/mds/" + nodename;
    },

    items: [
	{
	    xtype: 'pveNodeSelector',
	    fieldLabel: gettext('Node'),
	    selectCurNode: true,
	    submitValue: false,
	    allowBlank: false,
	    listeners: {
		change: function(f, value) {
		    this.up('pveCephCreateMDS').setNode(value);
		}
	    }
	}
    ],

    initComponent : function() {
	var me = this;

	if (!me.nodename) {
	    throw "no node name specified";
	}
	me.setNode(me.nodename);

	me.callParent();
    }
});

Ext.define('PVE.NodeCephFSPanel', {
    extend: 'Ext.panel.Panel',
    xtype: 'pveNodeCephFSPanel',
    mixins: ['Proxmox.Mixin.CBind'],

    title: gettext('CephFS'),
    onlineHelp: 'chapter_pvecm',

    border: false,
    defaults: {
	border: false,
	cbind: {
	    nodename: '{nodename}'
	}
    },

    viewModel: {
	parent: null,
	data: {
	    cephfsConfigured: false,
	    mdsCount: 0
	},
	formulas: {
	    canCreateFS: function(get) {
		return (!get('cephfsConfigured') && get('mdsCount') > 0);
	    }
	}
    },

    items: [
	{
	    xtype: 'grid',
	    emptyText: Ext.String.format(gettext('No {0} configured.'), 'CephFS'),
	    controller: {
		xclass: 'Ext.app.ViewController',

		init: function(view) {
		    view.rstore = Ext.create('Proxmox.data.UpdateStore', {
			autoLoad: true,
			xtype: 'update',
			interval: 5 * 1000,
			autoStart: true,
			storeid: 'pve-ceph-fs',
			model: 'pve-ceph-fs'
		    });
		    view.setStore(Ext.create('Proxmox.data.DiffStore', {
			rstore: view.rstore,
			sorters: {
			    property: 'name',
			    order: 'DESC'
			}
		    }));
		    Proxmox.Utils.monStoreErrors(view, view.rstore);
		    view.rstore.on('load', this.onLoad, this);
		    view.on('destroy', view.rstore.stopUpdate);
		},

		onCreate: function() {
		    var view = this.getView();
		    view.rstore.stopUpdate();
		    var win = Ext.create('PVE.CephCreateFS', {
			autoShow: true,
			nodename: view.nodename,
			listeners: {
			    destroy: function() {
				view.rstore.startUpdate();
			    }
			}
		    });
		},

		onLoad: function(store, records, success) {
		    var vm = this.getViewModel();
		    if (!(success && records && records.length > 0)) {
			vm.set('cephfsConfigured', false);
			return;
		    }
		    vm.set('cephfsConfigured', true);
		}
	    },
	    tbar: [
		{
		    text: gettext('Create CephFS'),
		    reference: 'createButton',
		    handler: 'onCreate',
		    bind: {
			// only one CephFS per Ceph cluster makes sense for now
			disabled: '{!canCreateFS}'
		    }
		}
	    ],
	    columns: [
		{
		    header: gettext('Name'),
		    flex: 1,
		    dataIndex: 'name'
		},
		{
		    header: 'Data Pool',
		    flex: 1,
		    dataIndex: 'data_pool'
		},
		{
		    header: 'Metadata Pool',
		    flex: 1,
		    dataIndex: 'metadata_pool'
		}
	    ],
	    cbind: {
		nodename: '{nodename}'
	    }
	},
	{
	    xtype: 'grid',
	    title: gettext('Metadata Servers'),
	    emptyText: Ext.String.format(gettext('No {0} configured.'), 'MDS'),
	    controller: {
		xclass: 'Ext.app.ViewController',

		init: function(view) {
		    view.rstore = Ext.create('Proxmox.data.UpdateStore', {
			autoLoad: true,
			xtype: 'update',
			interval: 3 * 1000,
			autoStart: true,
			storeid: 'pve-ceph-mds',
			model: 'pve-ceph-mds'
		    });
		    view.setStore(Ext.create('Proxmox.data.DiffStore', {
			rstore: view.rstore,
			sorters: {
			    property: 'id',
			    order: 'DESC'
			}
		    }));
		    Proxmox.Utils.monStoreErrors(view, view.rstore);
		    view.rstore.on('load', this.onLoad, this);
		    view.on('destroy', view.rstore.stopUpdate);
		},
		onLoad: function(store, records, success) {
		    var vm = this.getViewModel();
		    if (!success || !records) {
			vm.set('mdsCount', 0);
			return;
		    }
		    vm.set('mdsCount', records.length);
		},
		onCreateMDS: function() {
		    var view = this.getView();
		    view.rstore.stopUpdate();
		    var win = Ext.create('PVE.CephCreateMDS', {
			autoShow: true,
			nodename: view.nodename,
			listeners: {
			    destroy: function() {
				view.rstore.startUpdate();
			    }
			}
		    });
		}
	    },
	    tbar: [
		{
		    text: gettext('Create MDS'),
		    reference: 'createButton',
		    handler: 'onCreateMDS'
		},
		{
		    text: gettext('Destroy MDS'),
		    xtype: 'proxmoxStdRemoveButton',
		    getUrl: function(rec) {
			if (!rec.data.host) {
			    Ext.Msg.alert(gettext('Error'), "entry has no host");
			    return;
			}
			return "/nodes/" + rec.data.host + "/ceph/mds/" + rec.data.name;
		    },
		    callback: function(options, success, response) {
			if (!success) {
			    Ext.Msg.alert(gettext('Error'), response.htmlStatus);
			    return;
			}
			var upid = response.result.data;
			var win = Ext.create('Proxmox.window.TaskProgress', { upid: upid });
			win.show();
		    }
		}
	    ],
	    columns: [
		{
		    header: gettext('Name'),
		    flex: 1,
		    dataIndex: 'name'
		},
		{
		    header: gettext('Host'),
		    flex: 1,
		    dataIndex: 'host'
		},
		{
		    header: gettext('Address'),
		    flex: 1,
		    dataIndex: 'addr'
		},
		{
		    header: gettext('State'),
		    flex: 1,
		    dataIndex: 'state'
		}
	    ],
	    cbind: {
		nodename: '{nodename}'
	    }
	}
    ]
}, function() {
    Ext.define('pve-ceph-mds', {
	extend: 'Ext.data.Model',
	fields: [ 'name', 'host', 'addr', 'state' ],
	proxy: {
	    type: 'proxmox',
	    url: "/api2/json/nodes/localhost/ceph/mds"
	},
	idProperty: 'name'
    });
    Ext.define('pve-ceph-fs', {
	extend: 'Ext.data.Model',
	fields: [ 'name', 'data_pool', 'metadata_pool' ],
	proxy: {
	    type: 'proxmox',
	    url: "/api2/json/nodes/localhost/ceph/fs"
	},
	idProperty: 'name'
    });
});
