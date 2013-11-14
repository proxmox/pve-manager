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
	    PVE.Utils.API2Request({
		url: "/nodes/" + nodename + "/ceph/" + cmd,
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

	Ext.apply(me, {
	    store: store,
	    selModel: sm,
	    stateful: false,
	    tbar: [ start_btn, stop_btn ],
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
	    url: '/api2/extjs/nodes/' + nodename + '/ceph/config',
//	    style: 'padding-left:10px',
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
	    url: '/api2/extjs/nodes/' + nodename + '/ceph/crush',
//	    style: 'padding-left:10px',
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
		    title: 'OSD',
		    itemId: 'test3',
		    html: "ABCD"
		},
		{
		    title: 'Pool',
		    itemId: 'test4',
		    html: "ABCD"
		},
		{
		    title: 'Crush',
		    xtype: 'pveNodeCephCrushMap',
		    itemId: 'crushmap'
		}
	    ],
	    listeners: {
		afterrender: function(tp) {
		    var first =  tp.items.get(0);
		    if (first) {
			first.fireEvent('show', first);
		    }
		}
	    }
	});

	me.callParent();

    }
});