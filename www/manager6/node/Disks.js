Ext.define('PVE.node.DiskList', {
    extend: 'Ext.grid.GridPanel',
    alias: 'widget.pveNodeDiskList',
    emptyText: gettext('No Disks found'),
    stateful: true,
    stateId: 'grid-node-disks',
    columns: [
	{
	    header: gettext('Device'),
	    width: 100,
	    sortable: true,
	    dataIndex: 'devpath'
	},
	{
	    header: gettext('Type'),
	    width: 80,
	    sortable: true,
	    dataIndex: 'type',
	    renderer: function(v) {
		if (v === 'ssd') {
		    return 'SSD';
		} else if (v === 'hdd') {
		    return 'Hard Disk';
		} else if (v === 'usb'){
		    return 'USB';
		} else {
		    return gettext('Unknown');
		}
	    }
	},
	{
	    header: gettext('Usage'),
	    width: 80,
	    sortable: false,
	    renderer: function(v, metaData, rec) {
		if (rec) {
		    if (rec.data.osdid >= 0) {
			var bluestore = '';
			if (rec.data.bluestore === 1) {
			    bluestore = ' (Bluestore)';
			}
			return "Ceph osd." + rec.data.osdid.toString() + bluestore;
		    }

		    var types = [];
		    if (rec.data.journals > 0) {
			types.push('Journal');
		    }

		    if (rec.data.db > 0) {
			types.push('DB');
		    }

		    if (rec.data.wal > 0) {
			types.push('WAL');
		    }

		    if (types.length > 0) {
			return 'Ceph (' + types.join(', ') + ')';
		    }
		}

		return v || PVE.Utils.noText;
	    },
	    dataIndex: 'used'
	},
	{
	    header: gettext('Size'),
	    width: 100,
	    align: 'right',
	    sortable: true,
	    renderer: PVE.Utils.format_size,
	    dataIndex: 'size'
	},
	{
	    header: 'GPT',
	    width: 60,
	    align: 'right',
	    renderer: function(value) {
		if (value) {
		    return PVE.Utils.yesText;
		} else {
		    return PVE.Utils.noText;
		}
	    },
	    dataIndex: 'gpt'
	},
	{
	    header: gettext('Vendor'),
	    width: 100,
	    sortable: true,
	    renderer: Ext.String.htmlEncode,
	    dataIndex: 'vendor'
	},
	{
	    header: gettext('Model'),
	    width: 200,
	    sortable: true,
	    renderer: Ext.String.htmlEncode,
	    dataIndex: 'model'
	},
	{
	    header: gettext('Serial'),
	    width: 200,
	    sortable: true,
	    renderer: Ext.String.htmlEncode,
	    dataIndex: 'serial'
	},
	{
	    header: 'S.M.A.R.T.',
	    width: 100,
	    sortable: true,
	    renderer: Ext.String.htmlEncode,
	    dataIndex: 'health'
	},
	{
	    header: 'Wearout',
	    width: 100,
	    sortable: true,
	    dataIndex: 'wearout',
	    renderer: function(value) {
		if (Ext.isNumeric(value)) {
		    return (100 - value).toString() + '%';
		}
		return 'N/A';
	    }
	}
    ],

    initComponent: function() {
	 /*jslint confusion: true */
        var me = this;

	var nodename = me.pveSelNode.data.node;
	if (!nodename) {
	    throw "no node name specified";
	}

	var sm = Ext.create('Ext.selection.RowModel', {});

	var store = Ext.create('Ext.data.Store', {
	    storeid: 'node-disk-list' + nodename,
	    model: 'node-disk-list',
	    proxy: {
                type: 'pve',
                url: "/api2/json/nodes/" + nodename + "/disks/list"
	    },
	    sorters: [
		{
		    property : 'dev',
		    direction: 'ASC'
		}
	    ]
	});

	var reloadButton = Ext.create('PVE.button.Button', {
	    text: gettext('Reload'),
	    handler: function() {
		me.store.load();
	    }
	});

	var smartButton = Ext.create('PVE.button.Button', {
	    text: gettext('Show S.M.A.R.T. values'),
	    selModel: sm,
	    enableFn: function() {
		return !!sm.getSelection().length;
	    },
	    disabled: true,
	    handler: function() {
		var rec = sm.getSelection()[0];

		var win = Ext.create('PVE.DiskSmartWindow', {
                    nodename: nodename,
		    dev: rec.data.devpath
		});
		win.show();
	    }
	});

	var initButton = Ext.create('PVE.button.Button', {
	    text: gettext('Initialize Disk with GPT'),
	    selModel: sm,
	    enableFn: function() {
		var selection = sm.getSelection();

		if (!selection.length || selection[0].data.used) {
		    return false;
		} else {
		    return true;
		}
	    },
	    disabled: true,

	    handler: function() {
		var rec = sm.getSelection()[0];
		PVE.Utils.API2Request({
		    url: '/api2/extjs/nodes/' + nodename + '/disks/initgpt',
		    waitMsgTarget: me,
		    method: 'POST',
		    params: { disk: rec.data.devpath},
		    failure: function(response, options) {
			Ext.Msg.alert(gettext('Error'), response.htmlStatus);
		    },
		    success: function(response, options) {
			var upid = response.result.data;
			var win = Ext.create('PVE.window.TaskProgress', {
			    upid: upid
			});
			win.show();
		    }
		});
	    }
	});

	me.loadCount = 1; // avoid duplicate loadmask
	PVE.Utils.monStoreErrors(me, store);

	Ext.apply(me, {
	    store: store,
	    selModel: sm,
	    tbar: [ reloadButton, smartButton, initButton ],
	    listeners: {
		itemdblclick: function() {
		    var rec = sm.getSelection()[0];

		    var win = Ext.create('PVE.DiskSmartWindow', {
			nodename: nodename,
			dev: rec.data.devpath
		    });
		    win.show();
		}
	    }
	});


	me.callParent();
	me.store.load();
    }
}, function() {

    Ext.define('node-disk-list', {
	extend: 'Ext.data.Model',
	fields: [ 'devpath', 'used', { name: 'size', type: 'number'},
		  {name: 'osdid', type: 'number'},
		  'vendor', 'model', 'serial', 'rpm', 'type', 'health', 'wearout' ],
	idProperty: 'devpath'
    });
});

Ext.define('PVE.DiskSmartWindow', {
    extend: 'Ext.window.Window',
    alias: 'widget.pveSmartWindow',

    modal: true,

    items: [
	{
	    xtype: 'gridpanel',
	    layout: {
		type: 'fit'
	    },
	    emptyText: gettext('No S.M.A.R.T. Values'),
	    scrollable: true,
	    flex: 1,
	    itemId: 'smarts',
	    reserveScrollbar: true,
	    columns: [
	    { text: 'ID', dataIndex: 'id', width: 50 },
	    { text: gettext('Attribute'), flex: 1, dataIndex: 'name', renderer: Ext.String.htmlEncode },
	    { text: gettext('Value'), dataIndex: 'raw', renderer: Ext.String.htmlEncode },
	    { text: gettext('Normalized'), dataIndex: 'value', width: 60},
	    { text: gettext('Threshold'), dataIndex: 'threshold', width: 60},
	    { text: gettext('Worst'), dataIndex: 'worst', width: 60},
	    { text: gettext('Flags'), dataIndex: 'flags'},
	    { text: gettext('Failing'), dataIndex: 'fail', renderer: Ext.String.htmlEncode }
	    ]
	},
	{
	    xtype: 'component',
	    itemId: 'text',
	    layout: {
		type: 'fit'
	    },
	    hidden: true,
	    style: {
		'background-color': 'white',
		'white-space': 'pre',
		'font-family': 'monospace'
	    }
	}
    ],

    buttons: [
	{
	    text: gettext('Reload'),
	    name: 'reload',
	    handler: function() {
		var me = this;
		me.up('window').store.reload();
	    }
	},
	{
	    text: gettext('Close'),
	    name: 'close',
	    handler: function() {
		var me = this;
		me.up('window').close();
	    }
	}
    ],

    layout: {
	type: 'vbox',
	align: 'stretch'
    },
    width: 800,
    height: 500,
    minWidth: 600,
    minHeight: 400,
    bodyPadding: 5,
    title: gettext('S.M.A.R.T. Values'),

    initComponent: function() {
	var me = this;

	var nodename = me.nodename;
	if (!nodename) {
	    throw "no node name specified";
	}

	var dev = me.dev;
	if (!dev) {
	    throw "no device specified";
	}

	me.store = Ext.create('Ext.data.Store', {
	    model: 'disk-smart',
	    proxy: {
                type: 'pve',
                url: "/api2/json/nodes/" + nodename + "/disks/smart?disk=" + dev
	    }
	});

	me.callParent();
	var grid = me.down('#smarts');
	var text = me.down('#text');

	PVE.Utils.monStoreErrors(grid, me.store);
	me.mon(me.store, 'load', function(s, records, success) {
	    if (success && records.length > 0) {
		var rec = records[0];
		switch (rec.data.type) {
		    case 'text':
			grid.setVisible(false);
			text.setVisible(true);
			text.setHtml(Ext.String.htmlEncode(rec.data.text));
			break;
		    default:
			// includes 'ata'
			// cannot use empty case because
			// of jslint
			grid.setVisible(true);
			text.setVisible(false);
			grid.setStore(rec.attributes());
			break;
		}
	    }
	});

	me.store.load();
    }
}, function() {

    Ext.define('disk-smart', {
	extend: 'Ext.data.Model',
	fields: [
	    { name:'health'},
	    { name:'type'},
	    { name:'text'}
	],
	hasMany: {model: 'smart-attribute', name: 'attributes'}
    });
    Ext.define('smart-attribute', {
	extend: 'Ext.data.Model',
	fields: [
	    { name:'id', type:'number' }, 'name', 'value', 'worst', 'threshold', 'flags', 'fail', 'raw'
	]
    });
});
