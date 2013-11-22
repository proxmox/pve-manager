Ext.define('PVE.CephCreatePool', {
    extend: 'PVE.window.Edit',
    alias: ['widget.pveCephCreatePool'],

    create: true,
 
    subject: 'Ceph Pool',
 
     initComponent : function() {
        var me = this;

	if (!me.nodename) {
	    throw "no node name specified";
	}

        Ext.applyIf(me, {
	    url: "/nodes/" + me.nodename + "/ceph/pools",
            method: 'POST',
            items: [
		{
		    xtype: 'textfield',
		    fieldLabel: gettext('Name'),
		    name: 'name',
		    allowBlank: false
		},
		{
		    xtype: 'numberfield',
		    fieldLabel: gettext('Size'),
		    name: 'size',
		    value: 2,
		    minValue: 1,
		    maxValue: 3,
		    allowBlank: false
		},
		{
		    xtype: 'numberfield',
		    fieldLabel: 'pg_num',
		    name: 'pg_num',
		    value: 512,
		    minValue: 8,
		    maxValue: 32768,
		    allowBlank: false
		}
            ]
        });

        me.callParent();
    }
});

Ext.define('PVE.node.CephPoolList', {
    extend: 'Ext.grid.GridPanel',
    alias: 'widget.pveNodeCephPoolList',

    initComponent: function() {
        var me = this;

	var nodename = me.pveSelNode.data.node;
	if (!nodename) {
	    throw "no node name specified";
	}

	var sm = Ext.create('Ext.selection.RowModel', {});

	var rstore = Ext.create('PVE.data.UpdateStore', {
	    interval: 3000,
	    storeid: 'ceph-pool-list',
	    model: 'ceph-pool-list',
	    proxy: {
                type: 'pve',
                url: "/api2/json/nodes/" + nodename + "/ceph/pools"
	    }
	});

	var store = Ext.create('PVE.data.DiffStore', { rstore: rstore });

	PVE.Utils.monStoreErrors(me, rstore);

	var create_btn = new Ext.Button({
	    text: gettext('Create'),
	    handler: function() {
		var win = Ext.create('PVE.CephCreatePool', {
                    nodename: nodename
		});
		win.show();
	    }
	});

	var remove_btn = new PVE.button.Button({
	    text: gettext('Remove'),
	    selModel: sm,
	    disabled: true,
	    confirmMsg: function(rec) {
		var msg = Ext.String.format(gettext('Are you sure you want to remove entry {0}'),
					    "'" + rec.data.pool_name + "'");
		msg += " " + gettext('This will permanently erase all image data.');

		return msg;
	    },
	    handler: function() {
		var rec = sm.getSelection()[0];

		if (!rec.data.pool_name) {
		    return;
		}

		PVE.Utils.API2Request({
		    url: "/nodes/" + nodename + "/ceph/pools/" + 
			rec.data.pool_name,
		    method: 'DELETE',
		    failure: function(response, opts) {
			Ext.Msg.alert(gettext('Error'), response.htmlStatus);
		    }
		});
	    }
	});

	Ext.apply(me, {
	    store: store,
	    selModel: sm,
	    stateful: false,
	    tbar: [ create_btn, remove_btn ],
	    columns: [
		{
		    header: gettext('Name'),
		    width: 100,
		    sortable: true,
		    dataIndex: 'pool_name'
		},
		{
		    header: gettext('Size') + '/min',
		    width: 50,
		    sortable: false,
		    renderer: function(v, meta, rec) {
			return v + '/' + rec.data.min_size;
		    },
		    dataIndex: 'size'
		},
		{
		    header: 'pg_num',
		    width: 100,
		    sortable: false,
		    dataIndex: 'pg_num'
		},
		{
		    header: 'ruleset',
		    width: 50,
		    sortable: false,
		    dataIndex: 'crush_ruleset'
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

    Ext.define('ceph-pool-list', {
	extend: 'Ext.data.Model',
	fields: [ 'pool_name', 
		  { name: 'pool', type: 'integer'}, 
		  { name: 'size', type: 'integer'}, 
		  { name: 'min_size', type: 'integer'}, 
		  { name: 'pg_num', type: 'integer'}, 
		  { name: 'crush_ruleset', type: 'integer'}
		],
	idProperty: 'pool_name'
    });
});


Ext.define('PVE.node.CephOsdTree', {
    extend: 'Ext.tree.Panel',
    alias: 'widget.pveNodeCephOsdTree',

    initComponent: function() {
        var me = this;

	var nodename = me.pveSelNode.data.node;
	if (!nodename) {
	    throw "no node name specified";
	}

	var sm = Ext.create('Ext.selection.TreeModel', {});

	var service_cmd = function(cmd) {
	    var rec = sm.getSelection()[0];
	    if (!(rec && rec.data.name && rec.data.host)) {
		return;
	    }
	    PVE.Utils.API2Request({
                url: "/nodes/" + rec.data.host + "/ceph/" + cmd,
		params: { service: rec.data.name },
		waitMsgTarget: me,
		method: 'POST',
		failure: function(response, opts) {
		    Ext.Msg.alert(gettext('Error'), response.htmlStatus);
		}
	    });
	}

	var start_btn = new Ext.Button({
	    text: gettext('Start'),
	    disabled: true,
	    handler: function(){ service_cmd('start'); }
	});

	var stop_btn = new Ext.Button({
	    text: gettext('Stop'),
	    disabled: true,
	    handler: function(){ service_cmd('stop'); }
	});

	var remove_btn = new Ext.Button({
	    text: gettext('Remove'),
	    disabled: true,
	    handler: function(){
		var rec = sm.getSelection()[0];
		if (!(rec && (rec.data.id >= 0) && rec.data.host)) {
		    return;
		}
		PVE.Utils.API2Request({
                    url: "/nodes/" + rec.data.host + "/ceph/osd/" + rec.data.id,
		    waitMsgTarget: me,
		    method: 'DELETE',
		    failure: function(response, opts) {
			Ext.Msg.alert(gettext('Error'), response.htmlStatus);
		    }
		});
	    }
	});

	var set_button_status = function() {
	    var rec = sm.getSelection()[0];

	    if (!rec) {
		start_btn.setDisabled(true);
		stop_btn.setDisabled(true);
		remove_btn.setDisabled(true);
		return;
	    }

	    var isOsd = (rec.data.host && (rec.data.type === 'osd') && (rec.data.id >= 0));

	    start_btn.setDisabled(!(isOsd && (rec.data.status !== 'up')));
	    stop_btn.setDisabled(!(isOsd && (rec.data.status !== 'down')));
	    remove_btn.setDisabled(!(isOsd && (rec.data.status === 'down')));
	};

	sm.on('selectionchange', set_button_status);

	var reload = function() {
	    PVE.Utils.API2Request({
                url: "/nodes/" + nodename + "/ceph/osd",
		waitMsgTarget: me,
		method: 'GET',
		failure: function(response, opts) {
		    PVE.Utils.setErrorMask(me, response.htmlStatus);
		},
		success: function(response, opts) {
		    sm.deselectAll();
		    me.setRootNode(response.result.data.root);
		    me.expandAll();
		    set_button_status();
		}
	    });
	};

	var reload_btn = new Ext.Button({
	    text: gettext('Reload'),
	    handler: reload
	});

	Ext.apply(me, {
	    tbar: [ reload_btn, start_btn, stop_btn, remove_btn ],
	    rootVisible: false,
	    fields: ['name', 'type', 'status', 'host',
		     { type: 'integre', name: 'id' }, 
		     { type: 'number', name: 'reweight' }, 
		     { type: 'number', name: 'crush_weight' }],
	    stateful: false,
	    selModel: sm,
	    columns: [
		{
		    xtype: 'treecolumn',
		    text: 'Name',
		    dataIndex: 'name',
		    width: 200
		},
		{ 
		    text: 'ID',
		    dataIndex: 'id',
		    align: 'right',
		    width: 60
		},
		{ 
		    text: 'weight',
		    dataIndex: 'crush_weight',
		    align: 'right',
		    width: 60
		},
		{ 
		    text: 'Type',
		    dataIndex: 'type',
		    align: 'right',
		    width: 100		 
		},
		{ 
		    text: 'Status',
		    dataIndex: 'status',
		    align: 'right',
		    width: 100
		},
		{ 
		    text: 'reweight',
		    dataIndex: 'reweight',
		    align: 'right',
		    width: 60
		}
	    ],
	    listeners: {
		show: function() {
		    reload();
		}
	    }
	});

	me.callParent();

	reload();
    }
});


Ext.define('PVE.node.CephDiskList', {
    extend: 'Ext.grid.GridPanel',
    alias: 'widget.pveNodeCephDiskList',


    initComponent: function() {
        var me = this;

	var nodename = me.pveSelNode.data.node;
	if (!nodename) {
	    throw "no node name specified";
	}

	var sm = Ext.create('Ext.selection.RowModel', {});

	var rstore = Ext.create('PVE.data.UpdateStore', {
	    interval: 3000,
	    storeid: 'ceph-disk-list',
	    model: 'ceph-disk-list',
	    proxy: {
                type: 'pve',
                url: "/api2/json/nodes/" + nodename + "/ceph/disks"
	    }
	});

	var store = Ext.create('PVE.data.DiffStore', { rstore: rstore });

	PVE.Utils.monStoreErrors(me, rstore);

	var create_btn = new PVE.button.Button({
	    text: gettext('Create') + ': OSD',
	    selModel: sm,
	    disabled: true,
	    handler: function() {
		var rec = sm.getSelection()[0];
		
		PVE.Utils.API2Request({
		    url: "/nodes/" + nodename + "/ceph/osd",
		    method: 'POST',
		    params: { dev: "/dev/" + rec.data.dev },
		    failure: function(response, opts) {
			Ext.Msg.alert(gettext('Error'), response.htmlStatus);
		    }
		});
	    }
	});

	Ext.apply(me, {
	    store: store,
	    selModel: sm,
	    stateful: false,
	    tbar: [ create_btn ],
	    columns: [
		{
		    header: gettext('Device'),
		    width: 100,
		    sortable: true,
		    dataIndex: 'dev'
		},
		{
		    header: gettext('used'),
		    width: 50,
		    sortable: false,
		    renderer: function(v, metaData, rec) {
			if (rec && (rec.data.osdid >= 0)) {
			    return "osd." + rec.data.osdid;
			}
			return PVE.Utils.format_boolean(v);
		    },
		    dataIndex: 'used'
		},
		{
		    header: gettext('Size'),
		    width: 100,
		    sortable: false,
		    renderer: PVE.Utils.format_size,
		    dataIndex: 'size'
		},
		{
		    header: gettext('Vendor'),
		    width: 100,
		    sortable: true,
		    dataIndex: 'vendor'
		},
		{
		    header: gettext('Model'),
		    width: 200,
		    sortable: true,
		    dataIndex: 'model'
		},
		{
		    header: gettext('Serial'),
		    flex: 1,
		    sortable: true,
		    dataIndex: 'serial'
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

    Ext.define('ceph-disk-list', {
	extend: 'Ext.data.Model',
	fields: [ 'dev', 'used', { name: 'size', type: 'number'}, 
		  {name: 'osdid', type: 'number'}, 
		  'vendor', 'model', 'serial'],
	idProperty: 'dev'
    });
});

Ext.define('PVE.CephCreateMon', {
    extend: 'PVE.window.Edit',
    alias: ['widget.pveCephCreateMon'],

    create: true,
 
    subject: 'Ceph Monitor',
 
    setNode: function(nodename) {
        var me = this;

	me.nodename = nodename;
        me.url = "/nodes/" + nodename + "/ceph/mon";
    },

    initComponent : function() {
        var me = this;

	if (!me.nodename) {
	    throw "no node name specified";
	}

	me.setNode(me.nodename);

        Ext.applyIf(me, {
            method: 'POST',
            items: [
               {
		   xtype: 'PVE.form.NodeSelector',
		   submitValue: false,
		   fieldLabel: gettext('Host'),
		   selectCurNode: true,
		   allowBlank: false,
		   listeners: {
		       change: function(f, value) {
			   me.setNode(value);
		       }
		   }
	       }
            ]
        });

        me.callParent();
    }
});

Ext.define('PVE.node.CephMonList', {
    extend: 'Ext.grid.GridPanel',
    alias: 'widget.pveNodeCephMonList',


    initComponent: function() {
        var me = this;

	var nodename = me.pveSelNode.data.node;
	if (!nodename) {
	    throw "no node name specified";
	}

	var sm = Ext.create('Ext.selection.RowModel', {});

	var rstore = Ext.create('PVE.data.UpdateStore', {
	    interval: 3000,
	    storeid: 'ceph-mon-list',
	    model: 'ceph-mon-list',
	    proxy: {
                type: 'pve',
                url: "/api2/json/nodes/" + nodename + "/ceph/mon"
	    }
	});

	var store = Ext.create('PVE.data.DiffStore', { rstore: rstore });

	PVE.Utils.monStoreErrors(me, rstore);

	var service_cmd = function(cmd) {
	    var rec = sm.getSelection()[0];
	    if (!rec.data.host) {
		Ext.Msg.alert(gettext('Error'), "entry has no host");
		return;
	    }
	    PVE.Utils.API2Request({
		url: "/nodes/" + rec.data.host + "/ceph/" + cmd,
		method: 'POST',
		params: { service: "mon." + rec.data.name },
		failure: function(response, opts) {
		    Ext.Msg.alert(gettext('Error'), response.htmlStatus);
		}
	    });
	};

	var start_btn = new PVE.button.Button({
	    text: gettext('Start'),
	    selModel: sm,
	    disabled: true,
	    handler: function(){
		service_cmd("start");
	    }
	});

	var stop_btn = new PVE.button.Button({
	    text: gettext('Stop'),
	    selModel: sm,
	    disabled: true,
	    handler: function(){
		service_cmd("stop");
	    }
	});

	var create_btn = new Ext.Button({
	    text: gettext('Create'),
	    handler: function(){
		var win = Ext.create('PVE.CephCreateMon', {
                    nodename: nodename
		});
		win.show();
	    }
	});

	var remove_btn = new PVE.button.Button({
	    text: gettext('Remove'),
	    selModel: sm,
	    disabled: true,
	    handler: function() {
		var rec = sm.getSelection()[0];

		if (!rec.data.host) {
		    Ext.Msg.alert(gettext('Error'), "entry has no host");
		    return;
		}

		PVE.Utils.API2Request({
		    url: "/nodes/" + rec.data.host + "/ceph/mon/" + 
			rec.data.name,
		    method: 'DELETE',
		    failure: function(response, opts) {
			Ext.Msg.alert(gettext('Error'), response.htmlStatus);
		    }
		});
	    }
	});

	Ext.apply(me, {
	    store: store,
	    selModel: sm,
	    stateful: false,
	    tbar: [ start_btn, stop_btn, create_btn, remove_btn ],
	    columns: [
		{
		    header: gettext('Name'),
		    width: 50,
		    sortable: true,
		    renderer: function(v) { return "mon." + v; },
		    dataIndex: 'name'
		},
		{
		    header: gettext('Host'),
		    width: 100,
		    sortable: true,
		    renderer: function(v) {
			return v ? v : 'unknown';
		    },
		    dataIndex: 'host'
		},
		{
		    header: gettext('Quorum'),
		    width: 50,
		    sortable: false,
		    renderer: PVE.Utils.format_boolean,
		    dataIndex: 'quorum'
		},
		{
		    header: gettext('Address'),
		    flex: 1,
		    sortable: true,
		    dataIndex: 'addr'
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

    Ext.define('ceph-mon-list', {
	extend: 'Ext.data.Model',
	fields: [ 'addr', 'name', 'rank', 'host', 'quorum' ],
	idProperty: 'name'
    });
});

Ext.define('PVE.node.CephConfig', {
    extend: 'Ext.panel.Panel',
    alias: 'widget.pveNodeCephConfig',

    load: function() {
	var me = this;
	
	PVE.Utils.API2Request({
	    url: me.url,
	    waitMsgTarget: me,
	    failure: function(response, opts) {
		me.update(gettext('Error') + " " + response.htmlStatus);
	    },
	    success: function(response, opts) {
		var data = response.result.data;
		me.update(Ext.htmlEncode(data));
	    }
	});
    },

    initComponent: function() {
        var me = this;

	var nodename = me.pveSelNode.data.node;
	if (!nodename) {
	    throw "no node name specified";
	}

	Ext.apply(me, {
	    url: '/nodes/' + nodename + '/ceph/config',
	    bodyStyle: 'white-space:pre',
	    bodyPadding: 5,
	    autoScroll: true,
	    listeners: {
		show: function() {
		    me.load();
		}
	    }
	});

	me.callParent();

	me.load();
    }
});

Ext.define('PVE.node.CephCrushMap', {
    extend: 'Ext.panel.Panel',
    alias: 'widget.pveNodeCephCrushMap',

    load: function() {
	var me = this;
	
	PVE.Utils.API2Request({
	    url: me.url,
	    waitMsgTarget: me,
	    failure: function(response, opts) {
		me.update(gettext('Error') + " " + response.htmlStatus);
	    },
	    success: function(response, opts) {
		var data = response.result.data;
		me.update(Ext.htmlEncode(data));
	    }
	});
    },

    initComponent: function() {
        var me = this;

	var nodename = me.pveSelNode.data.node;
	if (!nodename) {
	    throw "no node name specified";
	}

	Ext.apply(me, {
	    url: '/nodes/' + nodename + '/ceph/crush',
	    bodyStyle: 'white-space:pre',
	    bodyPadding: 5,
	    autoScroll: true,
	    listeners: {
		show: function() {
		    me.load();
		}
	    }
	});

	me.callParent();

	me.load();
    }
});

Ext.define('PVE.node.CephStatus', {
    extend: 'PVE.grid.ObjectGrid',
    alias: 'widget.pveNodeCephStatus',

    initComponent: function() {
        var me = this;

	var nodename = me.pveSelNode.data.node;
	if (!nodename) {
	    throw "no node name specified";
	}

	var renderquorum = function(value) {
	    if (!value || value.length < 0) {
		return 'No';
	    }

	    return 'Yes {' + value.join(' ') + '}';
	};

	var rendermonmap = function(d) {
	    if (!d) {
		return '';
	    }

	    var txt =  'e' + d.epoch + ': ' + d.mons.length + " mons at ";

	    Ext.Array.each(d.mons, function(d) {
		txt += d.name + '=' + d.addr + ',';
	    });

	    return txt;
	};

	var renderosdmap = function(value) {
	    if (!value || !value.osdmap) {
		return '';
	    }

	    var d = value.osdmap;

	    var txt = 'e' + d.epoch + ': ';

	    txt += d.num_osds + ' osds: ' + d.num_up_osds + ' up, ' +
		d.num_in_osds + " in";

	    return txt;
	};

	var renderhealth = function(value) {
	    if (!value || !value.overall_status) {
		return '';
	    }

	    var txt = value.overall_status;

	    Ext.Array.each(value.summary, function(d) {
		txt += " " + d.summary + ';';
	    });

	    return txt;
	};

	var renderpgmap = function(d) {
	    if (!d) {
		return '';
	    }

	    var txt = 'v' + d.version + ': ';

	    txt += d.num_pgs + " pgs:";

	    Ext.Array.each(d.pgs_by_state, function(s) {
		txt += " " + s.count + " " + s.state_name;
	    });
	    txt += '; ';

	    txt += d.data_bytes + " bytes data, ";
	    txt += d.bytes_used + " bytes used, ";
	    txt += d.bytes_avail + " bytes avail";

	    return txt;
	};

	Ext.applyIf(me, {
	    url: "/api2/json/nodes/" + nodename + "/ceph/status",
	    cwidth1: 150,
	    interval: 3000,
	    rows: {
		health: { 
		    header: 'health', 
		    renderer: renderhealth, 
		    required: true
		},
		quorum_names: {
		    header: 'quorum',
		    renderer: renderquorum, 
		    required: true
		},
		fsid: { 
		    header: 'cluster', 
		    required: true
		},
		monmap: {
		    header: 'monmap',
		    renderer: rendermonmap, 
		    required: true
		},
		osdmap: {
		    header: 'osdmap',
		    renderer: renderosdmap, 
		    required: true
		},
		pgmap: {
		    header: 'pgmap',
		    renderer: renderpgmap, 
		    required: true
		}
	    }
	});

	me.callParent();

 	me.on('show', me.rstore.startUpdate);
	me.on('hide', me.rstore.stopUpdate);
	me.on('destroy', me.rstore.stopUpdate);	
    }
});

Ext.define('PVE.node.Ceph', {
    extend: 'Ext.tab.Panel',
    alias: 'widget.pveNodeCeph',

    initComponent: function() {
        var me = this;

	var nodename = me.pveSelNode.data.node;
	if (!nodename) {
	    throw "no node name specified";
	}

	if (!me.phstateid) {
	    throw "no parent history state specified";
	}

	var sp = Ext.state.Manager.getProvider();
	var state = sp.get(me.phstateid);
	var hsregex =  /^ceph-(\S+)$/;

	if (state && state.value) {
	    var res = hsregex.exec(state.value);
	    if (res && res[1]) {
		me.activeTab = res[1];
	    }
	}

	Ext.apply(me, {
	    plain: true,
	    tabPosition: 'bottom',
	    defaults: {
		border: false,
		pveSelNode: me.pveSelNode
	    },
	    items: [
		{
		    xtype: 'pveNodeCephStatus',
		    title: 'Status',
		    itemId: 'status'
		},
		{
		    xtype: 'pveNodeCephConfig',
		    title: 'Config',
		    itemId: 'config'
		},
		{
		    xtype: 'pveNodeCephMonList',
		    title: 'Monitor',
		    itemId: 'monlist'
		},
		{
		    xtype: 'pveNodeCephDiskList',
		    title: 'Disks',
		    itemId: 'disklist'
		},
		{
		    xtype: 'pveNodeCephOsdTree',
		    title: 'OSD',
		    itemId: 'osdtree'
		},
		{
		    xtype: 'pveNodeCephPoolList',
		    title: 'Pools',
		    itemId: 'pools'
		},
		{
		    title: 'Crush',
		    xtype: 'pveNodeCephCrushMap',
		    itemId: 'crushmap'
		},
		{
		    title: 'Log',
		    itemId: 'log',
		    xtype: 'pveLogView',
		    url: "/api2/extjs/nodes/" + nodename + "/ceph/log"
		}
	    ],
	    listeners: {
		afterrender: function(tp) {
		    var first =  tp.items.get(0);
		    if (first) {
			first.fireEvent('show', first);
		    }
		},
		tabchange: function(tp, newcard, oldcard) {
		    var first =  tp.items.get(0);
		    var ntab;

		    // Note: '' is alias for first tab.
		    if (newcard.itemId === first.itemId) {
			ntab = 'ceph';
		    } else {
			ntab = 'ceph-' + newcard.itemId;
		    }

		    var state = { value: ntab };
		    sp.set(me.phstateid, state);
		}
	    }
	});

	me.callParent();

	var statechange = function(sp, key, state) {
	    if ((key === me.phstateid) && state) {
		var first = me.items.get(0);
		var atab = me.getActiveTab().itemId;
		var res = hsregex.exec(state.value);
		var ntab = (res && res[1]) ? res[1] : first.itemId;
		if (ntab && (atab != ntab)) {
		    me.setActiveTab(ntab);
		}
	    }
	};

	me.mon(sp, 'statechange', statechange);
    }
});