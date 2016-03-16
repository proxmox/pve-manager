Ext.define('PVE.node.CephConfig', {
    extend: 'Ext.panel.Panel',
    alias: ['widget.pveNodeCephConfig'],

    bodyStyle: 'white-space:pre',
    bodyPadding: 5,
    scrollable: true,
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
	    listeners: {
		activate: function() {
		    me.load();
		}
	    }
	});

	me.callParent();

	me.load();
    }
});

Ext.define('PVE.node.Ceph', {
    extend: 'PVE.panel.SubConfig',
    alias: ['widget.pveNodeCeph'],

    minTabWidth: 80,
    configPrefix: 'ceph',

    initComponent: function() {
        var me = this;

	var nodename = me.pveSelNode.data.node;
	if (!nodename) {
	    throw "no node name specified";
	}

	Ext.apply(me, {
	    defaults: {
		border: false,
		pveSelNode: me.pveSelNode
	    },
	    plugins: {
		ptype: 'lazyitems',
		items: [
		    {
			xtype: 'pveNodeCephStatus',
			title: gettext('Status'),
			itemId: 'status'
		    },
		    {
			xtype: 'pveNodeCephConfig',
			title: gettext('Config'),
			itemId: 'config'
		    },
		    {
			xtype: 'pveNodeCephMonList',
			title: gettext('Monitor'),
			itemId: 'monlist'
		    },
		    {
			xtype: 'pveNodeCephDiskList',
			title: gettext('Disks'),
			itemId: 'disklist'
		    },
		    {
			xtype: 'pveNodeCephOsdTree',
			title: 'OSD',
			itemId: 'osdtree'
		    },
		    {
			xtype: 'pveNodeCephPoolList',
			title: gettext('Pools'),
			itemId: 'pools'
		    },
		    {
			title: 'Crush',
			xtype: 'pveNodeCephCrushMap',
			itemId: 'crushmap'
		    },
		    {
			title: gettext('Log'),
			itemId: 'log',
			xtype: 'pveLogView',
			url: "/api2/extjs/nodes/" + nodename + "/ceph/log"
		    }
		],
	    }
	});

	me.callParent();
    }
});
