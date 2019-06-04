Ext.define('PVE.CephCreateService', {
    extend: 'Proxmox.window.Edit',
    xtype: 'pveCephCreateService',

    showProgress: true,

    setNode: function(nodename) {
        var me = this;

	me.nodename = nodename;
        me.url = "/nodes/" + nodename + "/ceph/" + me.type;
    },

    method: 'POST',
    isCreate: true,

    items: [
	{
	    xtype: 'pveNodeSelector',
	    submitValue: false,
	    fieldLabel: gettext('Host'),
	    selectCurNode: true,
	    allowBlank: false,
	    listeners: {
		change: function(f, value) {
		    var me = this.up('pveCephCreateService');
		    me.setNode(value);
		}
	    }
	}
    ],

    initComponent : function() {
        var me = this;

	if (!me.nodename) {
	    throw "no node name specified";
	}

	if (!me.type) {
	    throw "no type specified";
	}

	me.setNode(me.nodename);

        me.callParent();
    }
});

Ext.define('PVE.node.CephServiceList', {
    extend: 'Ext.grid.GridPanel',
    xtype: 'pveNodeCephServiceList',

    onlineHelp: 'chapter_pveceph',
    emptyText: Ext.String.format(gettext('No {0} configured.'), 'MDS'),

    stateful: true,

    // will be called when the store loads
    storeLoadCallback: Ext.emptyFn,

    // if set to true, does shows the ceph install mask if needed
    showCephInstallMask: false,

    controller: {
	xclass: 'Ext.app.ViewController',

	init: function(view) {
	    if (view.pveSelNode) {
		view.nodename = view.pveSelNode.data.node;
	    }
	    if (!view.nodename) {
		throw "no node name specified";
	    }

	    if (!view.type) {
		throw "no type specified";
	    }

	    view.rstore = Ext.create('Proxmox.data.UpdateStore', {
		autoLoad: true,
		autoStart: true,
		interval: 3000,
		storeid: 'ceph-' + view.type + '-list' + view.nodename,
		model: 'ceph-service-list',
		proxy: {
		    type: 'proxmox',
		    url: "/api2/json/nodes/" + view.nodename + "/ceph/" + view.type
		}
	    });

	    view.setStore(Ext.create('Proxmox.data.DiffStore', {
		rstore: view.rstore,
		sorters: [{ property: 'name' }]
	    }));

	    if (view.storeLoadCallback) {
		view.rstore.on('load', view.storeLoadCallback, this);
	    }
	    view.on('destroy', view.rstore.stopUpdate);

	    if (view.showCephInstallMask) {
		var regex = new RegExp("not (installed|initialized)", "i");
		PVE.Utils.handleStoreErrorOrMask(view, view.rstore, regex, function(me, error) {
		    view.rstore.stopUpdate();
		    PVE.Utils.showCephInstallOrMask(view.ownerCt, error.statusText, view.nodename,
			function(win){
			    me.mon(win, 'cephInstallWindowClosed', function(){
				view.rstore.startUpdate();
			    });
			}
		    );
		});
	    }
	},

	service_cmd: function(rec, cmd) {
	    var view = this.getView();
	    if (!rec.data.host) {
		Ext.Msg.alert(gettext('Error'), "entry has no host");
		return;
	    }
	    Proxmox.Utils.API2Request({
		url: "/nodes/" + rec.data.host + "/ceph/" + cmd,
		method: 'POST',
		params: { service: view.type + '.' + rec.data.name },
		success: function(response, options) {
		    var upid = response.result.data;
		    var win = Ext.create('Proxmox.window.TaskProgress', {
			upid: upid,
			taskDone: function() {
			    view.rstore.load();
			}
		    });
		    win.show();
		},
		failure: function(response, opts) {
		    Ext.Msg.alert(gettext('Error'), response.htmlStatus);
		}
	    });
	},
	onChangeService: function(btn) {
	    var me = this;
	    var view = this.getView();
	    var cmd = btn.action;
	    var rec = view.getSelection()[0];
	    me.service_cmd(rec, cmd);
	},

	showSyslog: function() {
	    var view = this.getView();
	    var rec = view.getSelection()[0];
	    var servicename = 'ceph-' + view.type + '@' + rec.data.name;
	    var url = "/api2/extjs/nodes/" + rec.data.host + "/syslog?service=" +  encodeURIComponent(servicename);
	    var win = Ext.create('Ext.window.Window', {
		title: gettext('Syslog') + ': ' + servicename,
		modal: true,
		items: [{
		    xtype: 'proxmoxLogView',
		    width: 800,
		    height: 400,
		    url: url,
		    log_select_timespan: 1
		}]
	    });
	    win.show();
	},

	onCreate: function() {
	    var view = this.getView();
	    var win = Ext.create('PVE.CephCreateService', {
		autoShow: true,
		nodename: view.nodename,
		subject: view.getTitle(),
		type: view.type,
		taskDone: function() {
		    view.rstore.load();
		}
	    });
	}
    },

    tbar: [
	{
	    xtype: 'proxmoxButton',
	    text: gettext('Start'),
	    iconCls: 'fa fa-play',
	    action: 'start',
	    disabled: true,
	    enableFn: function(rec) {
		return rec.data.state === 'stopped' ||
		  rec.data.state === 'unknown';
	    },
	    handler: 'onChangeService'
	},
	{
	    xtype: 'proxmoxButton',
	    text: gettext('Stop'),
	    iconCls: 'fa fa-stop',
	    action: 'stop',
	    enableFn: function(rec) {
		return rec.data.state !== 'stopped';
	    },
	    disabled: true,
	    handler: 'onChangeService'
	},
	{
	    xtype: 'proxmoxButton',
	    text: gettext('Restart'),
	    iconCls: 'fa fa-refresh',
	    action: 'restart',
	    disabled: true,
	    enableFn: function(rec) {
		return rec.data.state !== 'stopped';
	    },
	    handler: 'onChangeService'
	},
	'-',
	{
	    text: gettext('Create'),
	    reference: 'createButton',
	    handler: 'onCreate'
	},
	{
	    text: gettext('Destroy'),
	    xtype: 'proxmoxStdRemoveButton',
	    getUrl: function(rec) {
		var view = this.up('grid');
		if (!rec.data.host) {
		    Ext.Msg.alert(gettext('Error'), "entry has no host");
		    return;
		}
		return "/nodes/" + rec.data.host + "/ceph/" + view.type + "/" + rec.data.name;
	    },
	    callback: function(options, success, response) {
		var view = this.up('grid');
		if (!success) {
		    Ext.Msg.alert(gettext('Error'), response.htmlStatus);
		    return;
		}
		var upid = response.result.data;
		var win = Ext.create('Proxmox.window.TaskProgress', {
		    upid: upid,
		    taskDone: function() {
			view.rstore.load();
		    }
		});
		win.show();
	    }
	},
	'-',
	{
	    xtype: 'proxmoxButton',
	    text: gettext('Syslog'),
	    disabled: true,
	    handler: 'showSyslog'
	}
    ],

    columns: [
	{
	    header: gettext('Name'),
	    width: 100,
	    sortable: true,
	    renderer: function(v) {
		return this.type + '.' + v;
	    },
	    dataIndex: 'name'
	},
	{
	    header: gettext('Host'),
	    width: 100,
	    sortable: true,
	    renderer: function(v) {
		return v || Proxmox.Utils.unknownText;
	    },
	    dataIndex: 'host'
	},
	{
	    header: gettext('Status'),
	    width: 70,
	    sortable: false,
	    dataIndex: 'state'
	},
	{
	    header: gettext('Address'),
	    flex: 1,
	    sortable: true,
	    renderer: function(v) {
		return v || Proxmox.Utils.unknownText;
	    },
	    dataIndex: 'addr'
	},
	{
	    header: gettext('Version'),
	    flex: 1,
	    sortable: true,
	    dataIndex: 'version'
	}
    ],

    initComponent: function() {
	var me = this;

	if (me.additionalColumns) {
	    me.columns = me.columns.concat(me.additionalColumns);
	}

	me.callParent();
    }

}, function() {

    Ext.define('ceph-service-list', {
	extend: 'Ext.data.Model',
	fields: [ 'addr', 'name', 'rank', 'host', 'quorum', 'state',
	    'ceph_version', 'ceph_version_short',
	    { type: 'string', name: 'version', calculate: function(data) {
		return PVE.Utils.parse_ceph_version(data);
	    } }
	],
	idProperty: 'name'
    });
});
