Ext.define('PVE.grig.LogView', {
    extend: 'Ext.grid.GridPanel',

    alias: ['widget.pveLogView'],

    initComponent : function() {
	var me = this;

	if (!me.url) {
	    throw "no url specified";
	}

	var store = Ext.create('Ext.data.Store', {
	    pageSize: 500,
	    buffered: true,
	    model: 'pve-string-list',
	    proxy: {
                type: 'pve',
		startParam: 'start',
		limitParam: 'limit',
                url: me.url
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

