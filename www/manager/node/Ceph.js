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
	    style: 'padding-left:10px',
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
	    if (!value) {
		return '';
	    }
	    var txt = '';

	    Ext.Array.each(value, function(name) {
		txt += name + ' ';
	    });

	    return txt;
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
		fsid: { 
		    header: 'cluster', 
		    required: true
		},
		monmap: {
		    header: 'monmap',
		    renderer: rendermonmap, 
		    required: true
		},
		quorum_names: {
		    header: 'quorum',
		    renderer: renderquorum, 
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
		    title: 'Config',
		    itemId: 'config',
		    html: "ABCD"
		},
		{
		    title: 'Monitor',
		    itemId: 'test2',
		    html: "ABCD"
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