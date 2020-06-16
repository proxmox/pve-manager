Ext.define('PVE.CephCreateOsd', {
    extend: 'Proxmox.window.Edit',
    xtype: 'pveCephCreateOsd',

    subject: 'Ceph OSD',

    showProgress: true,

    onlineHelp: 'pve_ceph_osds',

    initComponent : function() {
        var me = this;

	if (!me.nodename) {
	    throw "no node name specified";
	}

	me.isCreate = true;

        Ext.applyIf(me, {
	    url: "/nodes/" + me.nodename + "/ceph/osd",
	    method: 'POST',
	    items: [
		{
		    xtype: 'inputpanel',
		    onGetValues: function(values) {
			Object.keys(values || {}).forEach(function(name) {
			    if (values[name] === '') {
				delete values[name];
			    }
			});

			return values;
		    },
		    column1: [
			{
			    xtype: 'pmxDiskSelector',
			    name: 'dev',
			    nodename: me.nodename,
			    diskType: 'unused',
			    fieldLabel: gettext('Disk'),
			    allowBlank: false
			}
		    ],
		    column2: [
			{
			    xtype: 'pmxDiskSelector',
			    name: 'db_dev',
			    nodename: me.nodename,
			    diskType: 'journal_disks',
			    fieldLabel: gettext('DB Disk'),
			    value: '',
			    autoSelect: false,
			    allowBlank: true,
			    emptyText: 'use OSD disk',
			    listeners: {
				change: function(field, val) {
				    me.down('field[name=db_size]').setDisabled(!val);
				}
			    }
			},
			{
			    xtype: 'numberfield',
			    name: 'db_size',
			    fieldLabel: gettext('DB size') + ' (GiB)',
			    minValue: 1,
			    maxValue: 128*1024,
			    decimalPrecision: 2,
			    allowBlank: true,
			    disabled: true,
			    emptyText: gettext('Automatic')
			}
		    ],
		    advancedColumn1: [
			{
			    xtype: 'proxmoxcheckbox',
			    name: 'encrypted',
			    fieldLabel: gettext('Encrypt OSD')
			},
		    ],
		    advancedColumn2: [
			{
			    xtype: 'pmxDiskSelector',
			    name: 'wal_dev',
			    nodename: me.nodename,
			    diskType: 'journal_disks',
			    fieldLabel: gettext('WAL Disk'),
			    value: '',
			    autoSelect: false,
			    allowBlank: true,
			    emptyText: 'use OSD/DB disk',
			    listeners: {
				change: function(field, val) {
				    me.down('field[name=wal_size]').setDisabled(!val);
				}
			    }
			},
			{
			    xtype: 'numberfield',
			    name: 'wal_size',
			    fieldLabel: gettext('WAL size') + ' (GiB)',
			    minValue: 0.5,
			    maxValue: 128*1024,
			    decimalPrecision: 2,
			    allowBlank: true,
			    disabled: true,
			    emptyText: gettext('Automatic')
			}
		    ]
		},
		{
		    xtype: 'displayfield',
		    padding: '5 0 0 0',
		    userCls: 'pmx-hint',
		    value: 'Note: Ceph is not compatible with disks backed by a hardware ' +
			   'RAID controller. For details see ' +
			   '<a target="_blank" href="' + Proxmox.Utils.get_help_link('chapter_pveceph') + '">the reference documentation</a>.',
		}
	    ]
	});

	me.callParent();
    }
});

Ext.define('PVE.CephRemoveOsd', {
    extend: 'Proxmox.window.Edit',
    alias: ['widget.pveCephRemoveOsd'],

    isRemove: true,

    showProgress: true,
    method: 'DELETE',
    items: [
	{
	    xtype: 'proxmoxcheckbox',
	    name: 'cleanup',
	    checked: true,
	    labelWidth: 130,
	    fieldLabel: gettext('Cleanup Disks')
	}
    ],
    initComponent : function() {

        var me = this;

	if (!me.nodename) {
	    throw "no node name specified";
	}
	if (me.osdid === undefined || me.osdid < 0) {
	    throw "no osdid specified";
	}

	me.isCreate = true;

	me.title = gettext('Destroy') + ': Ceph OSD osd.' + me.osdid.toString();

        Ext.applyIf(me, {
	    url: "/nodes/" + me.nodename + "/ceph/osd/" + me.osdid.toString()
        });

        me.callParent();
    }
});

Ext.define('PVE.CephSetFlags', {
    extend: 'Proxmox.window.Edit',
    xtype: 'pveCephSetFlags',

    showProgress: true,

    width: 720,
    layout: 'fit',

    onlineHelp: 'pve_ceph_osds',
    isCreate: true,
    title: Ext.String.format(gettext('Manage {0}'), 'Global OSD Flags'),
    submitText: gettext('Apply'),

    items: [
	{
	    xtype: 'inputpanel',
	    onGetValues: function(values) {
		var me = this;
		var val = {};
		var data = me.down('#flaggrid').getStore().each((rec) => {
		    val[rec.data.name] = rec.data.value ? 1 : 0;
		});

		return val;
	    },
	    items: [
		{
		    xtype: 'grid',
		    itemId: 'flaggrid',
		    store: {
			listeners: {
			    update: function() {
				this.commitChanges();
			    }
			}
		    },

		    columns: [
			{
			    text: gettext('Enable'),
			    xtype: 'checkcolumn',
			    width: 75,
			    dataIndex: 'value',
			},
			{
			    text: 'Name',
			    dataIndex: 'name',
			},
			{
			    text: 'Description',
			    flex: 1,
			    dataIndex: 'description',
			},
		    ]
		},
	    ],
	},
    ],

    initComponent : function() {
        var me = this;

	if (!me.nodename) {
	    throw "no node name specified";
	}

        Ext.applyIf(me, {
	    url: "/cluster/ceph/flags",
	    method: 'PUT',
	});

	me.callParent();

	var grid = me.down('#flaggrid');
	me.load({
	    success: function(response, options) {
		var data = response.result.data;
		grid.getStore().setData(data);
		// re-align after store load, else the window is not centered
		me.alignTo(Ext.getBody(), 'c-c');
	    }
	});
    }
});

Ext.define('PVE.node.CephOsdTree', {
    extend: 'Ext.tree.Panel',
    alias: ['widget.pveNodeCephOsdTree'],
    onlineHelp: 'chapter_pveceph',

    viewModel: {
	data: {
	    nodename: '',
	    flags: [],
	    maxversion: '0',
	    mixedversions: false,
	    versions: {},
	    isOsd: false,
	    downOsd: false,
	    upOsd: false,
	    inOsd: false,
	    outOsd: false,
	    osdid: '',
	    osdhost: '',
	}
    },

    controller: {
	xclass: 'Ext.app.ViewController',

	reload: function() {
	    var me = this.getView();
	    var vm = this.getViewModel();
	    var nodename = vm.get('nodename');
	    var sm = me.getSelectionModel();
	    Proxmox.Utils.API2Request({
                url: "/nodes/" + nodename + "/ceph/osd",
		waitMsgTarget: me,
		method: 'GET',
		failure: function(response, opts) {
		    var msg = response.htmlStatus;
		    PVE.Utils.showCephInstallOrMask(me, msg, nodename,
			function(win){
			    me.mon(win, 'cephInstallWindowClosed', this.reload);
			}
		    );
		},
		success: function(response, opts) {
		    var data = response.result.data;
		    var selected = me.getSelection();
		    var name;
		    if (selected.length) {
			name = selected[0].data.name;
		    }
		    vm.set('versions', data.versions);
		    // extract max version
		    var maxversion = "0";
		    var mixedversions = false;
		    var traverse;
		    traverse = function(node, fn) {
			fn(node);
			if (Array.isArray(node.children)) {
			    node.children.forEach(c => { traverse(c, fn); });
			}
		    };
		    traverse(data.root, node => {
			// compatibility for old api call
			if (node.type === 'host' && !node.version) {
			    node.version = data.versions[node.name];
			}

			if (node.version === undefined) {
			    return;
			}

			if (node.version !== maxversion && maxversion !== "0") {
			    mixedversions = true;
			}

			if (PVE.Utils.compare_ceph_versions(node.version, maxversion) > 0) {
			    maxversion = node.version;
			}

		    });
		    vm.set('maxversion', maxversion);
		    vm.set('mixedversions', mixedversions);
		    sm.deselectAll();
		    me.setRootNode(data.root);
		    me.expandAll();
		    if (name) {
			var node = me.getRootNode().findChild('name', name, true);
			if (node) {
			    me.setSelection([node]);
			}
		    }

		    var flags = data.flags.split(',');
		    vm.set('flags', flags);
		}
	    });
	},

	osd_cmd: function(comp) {
	    var me = this;
	    var vm = this.getViewModel();
	    var cmd = comp.cmd;
	    var params = comp.params || {};
	    var osdid = vm.get('osdid');

	    var doRequest = function() {
		Proxmox.Utils.API2Request({
		    url: "/nodes/" + vm.get('osdhost') + "/ceph/osd/" + osdid + '/' + cmd,
		    waitMsgTarget: me.getView(),
		    method: 'POST',
		    params: params,
		    success: () => { me.reload(); },
		    failure: function(response, opts) {
			Ext.Msg.alert(gettext('Error'), response.htmlStatus);
		    }
		});
	    };

	    if (cmd === 'scrub') {
		Ext.MessageBox.defaultButton = params.deep === 1 ? 2 : 1;
		Ext.Msg.show({
		    title: gettext('Confirm'),
		    icon: params.deep === 1 ? Ext.Msg.WARNING : Ext.Msg.QUESTION,
		    msg: params.deep !== 1 ?
		       Ext.String.format(gettext("Scrub OSD.{0}"), osdid) :
		       Ext.String.format(gettext("Deep Scrub OSD.{0}"), osdid) +
			   "<br>Caution: This can reduce performance while it is running.",
		    buttons: Ext.Msg.YESNO,
		    callback: function(btn) {
			if (btn !== 'yes') {
			    return;
			}
			doRequest();
		    }
		});
	    } else {
		doRequest();
	    }
	},

	create_osd: function() {
	    var me = this;
	    var vm = this.getViewModel();
	    Ext.create('PVE.CephCreateOsd', {
		nodename: vm.get('nodename'),
		taskDone: () => { me.reload(); }
	    }).show();
	},

	destroy_osd: function() {
	    var me = this;
	    var vm = this.getViewModel();
	    Ext.create('PVE.CephRemoveOsd', {
		nodename: vm.get('osdhost'),
		osdid: vm.get('osdid'),
		taskDone: () => { me.reload(); }
	    }).show();
	},

	set_flags: function() {
	    var me = this;
	    var vm = this.getViewModel();
	    Ext.create('PVE.CephSetFlags', {
		nodename: vm.get('nodename'),
		taskDone: () => { me.reload(); }
	    }).show();
	},

	service_cmd: function(comp) {
	    var me = this;
	    var vm = this.getViewModel();
	    var cmd = comp.cmd || comp;
	    Proxmox.Utils.API2Request({
                url: "/nodes/" + vm.get('osdhost') + "/ceph/" + cmd,
		params: { service: "osd." + vm.get('osdid') },
		waitMsgTarget: me.getView(),
		method: 'POST',
		success: function(response, options) {
		    var upid = response.result.data;
		    var win = Ext.create('Proxmox.window.TaskProgress', {
			upid: upid,
			taskDone: () => { me.reload(); }
		    });
		    win.show();
		},
		failure: function(response, opts) {
		    Ext.Msg.alert(gettext('Error'), response.htmlStatus);
		}
	    });
	},

	set_selection_status: function(tp, selection) {
	    if (selection.length < 1) {
		return;
	    }
	    var rec = selection[0];
	    var vm = this.getViewModel();

	    var isOsd = (rec.data.host && (rec.data.type === 'osd') && (rec.data.id >= 0));

	    vm.set('isOsd', isOsd);
	    vm.set('downOsd', isOsd && rec.data.status === 'down');
	    vm.set('upOsd', isOsd && rec.data.status !== 'down');
	    vm.set('inOsd', isOsd && rec.data.in);
	    vm.set('outOsd', isOsd && !rec.data.in);
	    vm.set('osdid', isOsd ? rec.data.id : undefined);
	    vm.set('osdhost', isOsd ? rec.data.host : undefined);
	},

	render_status: function(value, metaData, rec) {
	    if (!value) {
		return value;
	    }
	    var inout = rec.data['in'] ? 'in' : 'out';
	    var updownicon = value === 'up' ? 'good fa-arrow-circle-up' :
		'critical fa-arrow-circle-down';

	    var inouticon = rec.data['in'] ? 'good fa-circle' :
		'warning fa-circle-o';

	    var text = value + ' <i class="fa ' + updownicon + '"></i> / ' +
		inout + ' <i class="fa ' + inouticon + '"></i>';

	    return text;
	},

	render_wal: function(value, metaData, rec) {
	    if (!value &&
		rec.data.osdtype === 'bluestore' &&
		rec.data.type === 'osd') {
		return 'N/A';
	    }
	    return value;
	},

	render_version: function(value, metadata, rec) {
	    var vm = this.getViewModel();
	    var versions = vm.get('versions');
	    var icon = "";
	    var version = value || "";
	    var maxversion = vm.get('maxversion');
	    if (value && value != maxversion) {
		if (rec.data.type === 'host' || versions[rec.data.host] !== maxversion) {
		    icon = PVE.Utils.get_ceph_icon_html('HEALTH_UPGRADE');
		} else {
		    icon = PVE.Utils.get_ceph_icon_html('HEALTH_OLD');
		}
	    } else if (value && vm.get('mixedversions')) {
		icon = PVE.Utils.get_ceph_icon_html('HEALTH_OK');
	    }

	    return icon + version;
	},

	render_osd_val: function(value, metaData, rec) {
	    return (rec.data.type === 'osd') ? value : '';
	},
	render_osd_weight: function(value, metaData, rec) {
	    if (rec.data.type !== 'osd') {
		return '';
	    }
	    return Ext.util.Format.number(value, '0.00###');
	},

	render_osd_latency: function(value, metaData, rec) {
	    if (rec.data.type !== 'osd') {
		return '';
	    }
	    let commit_ms = rec.data.commit_latency_ms,
	        apply_ms = rec.data.apply_latency_ms;
	    return apply_ms + ' / ' + commit_ms;
	},

	render_osd_size: function(value, metaData, rec) {
	    return this.render_osd_val(PVE.Utils.render_size(value), metaData, rec);
	},

	control: {
	    '#': {
		selectionchange: 'set_selection_status'
	    }
	},

	init: function(view) {
	    var me = this;
	    var vm = this.getViewModel();

	    if (!view.pveSelNode.data.node) {
		throw "no node name specified";
	    }

	    vm.set('nodename', view.pveSelNode.data.node);

	    me.callParent();
	    me.reload();
	}
    },

    stateful: true,
    stateId: 'grid-ceph-osd',
    rootVisible: false,
    useArrows: true,

    columns: [
	{
	    xtype: 'treecolumn',
	    text: 'Name',
	    dataIndex: 'name',
	    width: 150
	},
	{
	    text: 'Type',
	    dataIndex: 'type',
	    hidden: true,
	    align: 'right',
	    width: 75
	},
	{
	    text: gettext("Class"),
	    dataIndex: 'device_class',
	    align: 'right',
	    width: 75
	},
	{
	    text: "OSD Type",
	    dataIndex: 'osdtype',
	    align: 'right',
	    width: 100
	},
	{
	    text: "Bluestore Device",
	    dataIndex: 'blfsdev',
	    align: 'right',
	    width: 75,
	    hidden: true
	},
	{
	    text: "DB Device",
	    dataIndex: 'dbdev',
	    align: 'right',
	    width: 75,
	    hidden: true
	},
	{
	    text: "WAL Device",
	    dataIndex: 'waldev',
	    align: 'right',
	    renderer: 'render_wal',
	    width: 75,
	    hidden: true
	},
	{
	    text: 'Status',
	    dataIndex: 'status',
	    align: 'right',
	    renderer: 'render_status',
	    width: 120
	},
	{
	    text: gettext('Version'),
	    dataIndex: 'version',
	    align: 'right',
	    renderer: 'render_version'
	},
	{
	    text: 'weight',
	    dataIndex: 'crush_weight',
	    align: 'right',
	    renderer: 'render_osd_weight',
	    width: 90
	},
	{
	    text: 'reweight',
	    dataIndex: 'reweight',
	    align: 'right',
	    renderer: 'render_osd_weight',
	    width: 90
	},
	{
	    text: gettext('Used') + ' (%)',
	    dataIndex: 'percent_used',
	    align: 'right',
	    renderer: function(value, metaData, rec) {
		if (rec.data.type !== 'osd') {
		    return '';
		}
		return Ext.util.Format.number(value, '0.00');
	    },
	    width: 100
	},
	{
	    text: gettext('Total'),
	    dataIndex: 'total_space',
	    align: 'right',
	    renderer: 'render_osd_size',
	    width: 100
	},
	{
	    text: 'Apply/Commit<br>Latency (ms)',
	    dataIndex: 'apply_latency_ms',
	    align: 'right',
	    renderer: 'render_osd_latency',
	    width: 120
	}
    ],


    tbar: {
	items: [
	    {
		text: gettext('Reload'),
		iconCls: 'fa fa-refresh',
		handler: 'reload'
	    },
	    '-',
	    {
		text: gettext('Create') + ': OSD',
		handler: 'create_osd',
	    },
	    {
		text: Ext.String.format(gettext('Manage {0}'), 'Global Flags'),
		handler: 'set_flags',
	    },
	    '->',
	    {
		xtype: 'tbtext',
		data: {
		    osd: undefined
		},
		bind: {
		    data: {
			osd: "{osdid}"
		    }
		},
		tpl: [
		    '<tpl if="osd">',
		    'osd.{osd}:',
		    '<tpl else>',
		    gettext('No OSD selected'),
		    '</tpl>'
		]
	    },
	    {
		text: gettext('Start'),
		iconCls: 'fa fa-play',
		disabled: true,
		bind: {
		    disabled: '{!downOsd}'
		},
		cmd: 'start',
		handler: 'service_cmd'
	    },
	    {
		text: gettext('Stop'),
		iconCls: 'fa fa-stop',
		disabled: true,
		bind: {
		    disabled: '{!upOsd}'
		},
		cmd: 'stop',
		handler: 'service_cmd'
	    },
	    {
		text: gettext('Restart'),
		iconCls: 'fa fa-refresh',
		disabled: true,
		bind: {
		    disabled: '{!upOsd}'
		},
		cmd: 'restart',
		handler: 'service_cmd'
	    },
	    '-',
	    {
		text: 'Out',
		iconCls: 'fa fa-circle-o',
		disabled: true,
		bind: {
		    disabled: '{!inOsd}'
		},
		cmd: 'out',
		handler: 'osd_cmd'
	    },
	    {
		text: 'In',
		iconCls: 'fa fa-circle',
		disabled: true,
		bind: {
		    disabled: '{!outOsd}'
		},
		cmd: 'in',
		handler: 'osd_cmd'
	    },
	    '-',
	    {
		text: gettext('More'),
		iconCls: 'fa fa-bars',
		disabled: true,
		bind: {
		    disabled: '{!isOsd}'
		},
		menu: [
		    {
			text: gettext('Scrub'),
			iconCls: 'fa fa-shower',
			cmd: 'scrub',
			handler: 'osd_cmd'
		    },
		    {
			text: gettext('Deep Scrub'),
			iconCls: 'fa fa-bath',
			cmd: 'scrub',
			params: {
			    deep: 1,
			},
			handler: 'osd_cmd'
		    },
		    {
			text: gettext('Destroy'),
			itemId: 'remove',
			iconCls: 'fa fa-fw fa-trash-o',
			bind: {
			    disabled: '{!downOsd}'
			},
			handler: 'destroy_osd'
		    }
		],
	    }
	]
    },

    fields: [
	'name', 'type', 'status', 'host', 'in', 'id' ,
	{ type: 'number', name: 'reweight' },
	{ type: 'number', name: 'percent_used' },
	{ type: 'integer', name: 'bytes_used' },
	{ type: 'integer', name: 'total_space' },
	{ type: 'integer', name: 'apply_latency_ms' },
	{ type: 'integer', name: 'commit_latency_ms' },
	{ type: 'string', name: 'device_class' },
	{ type: 'string', name: 'osdtype' },
	{ type: 'string', name: 'blfsdev' },
	{ type: 'string', name: 'dbdev' },
	{ type: 'string', name: 'waldev' },
	{ type: 'string', name: 'version', calculate: function(data) {
	    return PVE.Utils.parse_ceph_version(data);
	} },
	{ type: 'string', name: 'iconCls', calculate: function(data) {
	    var iconMap = {
		host: 'fa-building',
		osd: 'fa-hdd-o',
		root: 'fa-server',
	    };
	    return 'fa x-fa-tree ' + iconMap[data.type];
	} },
	{ type: 'number', name: 'crush_weight' }
    ],
});
