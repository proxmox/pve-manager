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
		show: function() {
		    me.load();
		}
	    }
	});

	me.callParent();

	me.load();
    }
});

Ext.define('PVE.node.Ceph', {
    extend: 'Ext.tab.Panel',
    alias: ['widget.pveNodeCeph'],

    tabPosition: 'left',
    tabRotation: 0,
    minTabWidth: 80,

    getHState: function(itemId) {
	 /*jslint confusion: true */
        var me = this;

	if (!itemId) {
	    itemId = me.getActiveTab().itemId;
	}

	var first =  me.items.get(0);
	var ntab;

	// Note: '' is alias for first tab.
	if (itemId === first.itemId) {
	    ntab = 'ceph';
	} else {
	    ntab = 'ceph-' + itemId;
	}

	return { value: ntab };
    },

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
	    defaults: {
		border: false,
		pveSelNode: me.pveSelNode
	    },
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
	    listeners: {
		afterrender: function(tp) {
		    var first =  tp.items.get(0);
		    if (first) {
			first.fireEvent('show', first);
		    }
		},
		tabchange: function(tp, newcard, oldcard) {
		    var state = me.getHState(newcard.itemId);
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
