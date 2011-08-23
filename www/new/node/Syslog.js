Ext.define('PVE.node.Syslog', {
    extend: 'Ext.grid.GridPanel',

    alias: ['widget.pveNodeSyslog'],

    initComponent : function() {
	var me = this;

	var nodename = me.pveSelNode.data.node;
	if (!nodename) 
	    throw "no node name specified";

	var store = Ext.create('Ext.data.Store', {
	    pageSize: 500,
 	    buffered: true,
	    model: 'pve-string-list',
	    proxy: {
                type: 'pve',
		startParam: 'start',
		limitParam: 'limit',
                url: "/api2/json/nodes/" + nodename + "/syslog"
	    }
	});

	Ext.apply(me, {
	    store: store,
	    features: [ {ftype: 'selectable'}],
	    stateful: false,
	    verticalScrollerType: 'paginggridscroller',
	    loadMask: true,
	    invalidateScrollerOnRefresh: false,
	    viewConfig: {
		trackOver: false,
		stripeRows: false
	    },
	    hideHeaders: true,
	    columns: [ 
		{ header: "Text", dataIndex: 't', flex: 1 } 
	    ]
	});

	me.callParent();

	store.guaranteeRange(0, store.pageSize - 1);
    }
});

