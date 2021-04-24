Ext.define('PVE.CephCreateService', {
    extend: 'Proxmox.window.Edit',
    xtype: 'pveCephCreateService',

    showProgress: true,

    setNode: function(nodename) {
        var me = this;

	me.nodename = nodename;
        me.url = "/nodes/" + nodename + "/ceph/" + me.type + "/" + nodename;
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
		},
	    },
	},
    ],

    initComponent: function() {
        var me = this;

	if (!me.nodename) {
	    throw "no node name specified";
	}

	if (!me.type) {
	    throw "no type specified";
	}

	me.setNode(me.nodename);

        me.callParent();
    },
});

Ext.define('PVE.node.CephServiceList', {
    extend: 'Ext.grid.GridPanel',
    xtype: 'pveNodeCephServiceList',

    onlineHelp: 'chapter_pveceph',
    emptyText: gettext('No such service configured.'),

    stateful: true,

    // will be called when the store loads
    storeLoadCallback: Ext.emptyFn,

    // if set to true, does shows the ceph install mask if needed
    showCephInstallMask: false,

    controller: {
	xclass: 'Ext.app.ViewController',

	render_version: function(value, metadata, rec) {
	    let me = this.getView();
	    let host = rec.data.host;
	    let icon = "";
	    let v = value;
	    let nodev = [0];
	    if (me.nodeversions[host] !== undefined) {
		nodev = me.nodeversions[host].version.parts;
	    }
	    let maxv = me.maxversion;

	    if (PVE.Utils.compare_ceph_versions(maxv, nodev) > 0) {
		icon = PVE.Utils.get_ceph_icon_html('HEALTH_UPGRADE');
	    } else if (PVE.Utils.compare_ceph_versions(nodev, v) > 0) {
		icon = PVE.Utils.get_ceph_icon_html('HEALTH_OLD');
	    } else if (me.mixedversions) {
		icon = PVE.Utils.get_ceph_icon_html('HEALTH_OK');
	    }

	    return icon + v;
	},

	getMaxVersions: function(store, records, success) {
	    if (!success || records.length < 1) {
		return;
	    }
	    let me = this;
	    let view = me.getView();

	    view.nodeversions = records[0].data.node;
	    view.maxversion = [];
	    view.mixedversions = false;
	    for (const [nodename, data] of Object.entries(view.nodeversions)) {
		let res = PVE.Utils.compare_ceph_versions(data.version.parts, view.maxversion);
		if (res !== 0 && view.maxversion.length > 0) {
		    view.mixedversions = true;
		}
		if (res > 0) {
		    view.maxversion = data.version.parts;
		}
	    }
	},

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

	    view.versionsstore = Ext.create('Proxmox.data.UpdateStore', {
		autoStart: true,
		interval: 10000,
		storeid: 'ceph-versions-' + view.type + '-list' + view.nodename,
		proxy: {
		    type: 'proxmox',
		    url: "/api2/json/cluster/ceph/metadata?scope=versions",
		},
	    });

	    view.versionsstore.on('load', this.getMaxVersions, this);
	    view.on('destroy', view.versionsstore.stopUpdate);

	    view.rstore = Ext.create('Proxmox.data.UpdateStore', {
		autoStart: true,
		interval: 3000,
		storeid: 'ceph-' + view.type + '-list' + view.nodename,
		model: 'ceph-service-list',
		proxy: {
		    type: 'proxmox',
		    url: "/api2/json/nodes/" + view.nodename + "/ceph/" + view.type,
		},
	    });

	    view.setStore(Ext.create('Proxmox.data.DiffStore', {
		rstore: view.rstore,
		sorters: [{ property: 'name' }],
	    }));

	    if (view.storeLoadCallback) {
		view.rstore.on('load', view.storeLoadCallback, this);
	    }
	    view.on('destroy', view.rstore.stopUpdate);

	    if (view.showCephInstallMask) {
		PVE.Utils.monitor_ceph_installed(view, view.rstore, view.nodename, true);
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
			},
		    });
		    win.show();
		},
		failure: function(response, opts) {
		    Ext.Msg.alert(gettext('Error'), response.htmlStatus);
		},
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
	    var url = "/api2/extjs/nodes/" + rec.data.host + "/syslog?service=" + encodeURIComponent(servicename);
	    var win = Ext.create('Ext.window.Window', {
		title: gettext('Syslog') + ': ' + servicename,
		modal: true,
		width: 800,
		height: 400,
		layout: 'fit',
		items: [{
		    xtype: 'proxmoxLogView',
		    url: url,
		    log_select_timespan: 1,
		}],
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
		},
	    });
	},
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
	    handler: 'onChangeService',
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
	    handler: 'onChangeService',
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
	    handler: 'onChangeService',
	},
	'-',
	{
	    text: gettext('Create'),
	    reference: 'createButton',
	    handler: 'onCreate',
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
		    },
		});
		win.show();
	    },
	},
	'-',
	{
	    xtype: 'proxmoxButton',
	    text: gettext('Syslog'),
	    disabled: true,
	    handler: 'showSyslog',
	},
    ],

    columns: [
	{
	    header: gettext('Name'),
	    flex: 1,
	    sortable: true,
	    renderer: function(v) {
		return this.type + '.' + v;
	    },
	    dataIndex: 'name',
	},
	{
	    header: gettext('Host'),
	    flex: 1,
	    sortable: true,
	    renderer: function(v) {
		return v || Proxmox.Utils.unknownText;
	    },
	    dataIndex: 'host',
	},
	{
	    header: gettext('Status'),
	    flex: 1,
	    sortable: false,
	    dataIndex: 'state',
	},
	{
	    header: gettext('Address'),
	    flex: 3,
	    sortable: true,
	    renderer: function(v) {
		return v || Proxmox.Utils.unknownText;
	    },
	    dataIndex: 'addr',
	},
	{
	    header: gettext('Version'),
	    flex: 3,
	    sortable: true,
	    dataIndex: 'version',
	    renderer: 'render_version',
	},
    ],

    initComponent: function() {
	var me = this;

	if (me.additionalColumns) {
	    me.columns = me.columns.concat(me.additionalColumns);
	}

	me.callParent();
    },

}, function() {
    Ext.define('ceph-service-list', {
	extend: 'Ext.data.Model',
	fields: ['addr', 'name', 'rank', 'host', 'quorum', 'state',
	    'ceph_version', 'ceph_version_short',
	    {
 type: 'string', name: 'version', calculate: function(data) {
		return PVE.Utils.parse_ceph_version(data);
	    },
},
	],
	idProperty: 'name',
    });
});
