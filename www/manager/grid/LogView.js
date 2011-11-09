Ext.define('PVE.grig.LogView', {
    extend: 'Ext.grid.GridPanel',

    alias: ['widget.pveLogView'],

    scrollToEnd: true,

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

	var scrollEndMarker = false;
	var autoscroll = true;

	var scrollToEndFn = function() {
	    var vertScroller = me.getVerticalScroller();
	    if (!(vertScroller && vertScroller.scrollEl)) {
		return;
	    }

	    var vertScrollerEl = vertScroller.scrollEl;
            var vertScrollerElDom = vertScrollerEl.dom;
            var maxDown = vertScrollerElDom.scrollHeight - 
		vertScrollerElDom.clientHeight - 
		vertScrollerElDom.scrollTop;

	    scrollEndMarker = (maxDown <= 0);
	
	    if (me.scrollToEnd && scrollEndMarker) {
		autoscroll = true;
	    }

	    if (!autoscroll) {
		return;
	    }

            vertScroller.scrollByDeltaY(maxDown);

	    // invalidate last page by removing last entry from cache
	    store.prefetchData.removeAtKey(store.totalCount - 1);
	    var start = store.totalCount - store.pageSize;
	    if (start < 0) {
		start = 0;
	    }
	    store.guaranteeRange(start, start + store.pageSize - 1);
	};

	var onScroll = function() {
	    var scroller = this;
	    if (me.scrollToEnd && scrollEndMarker) {
		autoscroll = false;	    
	    }
	};

	Ext.apply(me, {
	    store: store,
	    features: [ {ftype: 'selectable'}],
	    stateful: false,
	    verticalScrollerType: 'paginggridscroller',
	    invalidateScrollerOnRefresh: false,
	    viewConfig: {
		loadMask: false,
		trackOver: false,
		stripeRows: false
	    },
	    hideHeaders: true,
	    columns: [ 
		{ header: "Text", dataIndex: 't', flex: 1 } 
	    ],
	    listeners: {
		'scrollershow': function(scroller, orientation) {
		    if (orientation !== 'vertical') {
			return;
		    }
		    scroller.on('afterrender', function() {
			me.mon(scroller.scrollEl, 'scroll', onScroll, scroller);
		    });
		},
		'scrollerhide':  function(scroller, orientation) {
		    if (orientation !== 'vertical') {
			return;
		    }
		    autoscroll = false;	    
		}
	    }
	});

	me.callParent();

	var load_task = new Ext.util.DelayedTask();

	var run_load_task = function() {
	    if (!store.totalCount) {
		store.guaranteeRange(0, store.pageSize - 1);
	    } else {
		scrollToEndFn();
	    }
	    load_task.delay(1000, run_load_task);
	};

	me.on('show', function() {
	    if (me.scrollToEnd) {
		run_load_task();
	    } else {
		store.guaranteeRange(0, store.pageSize - 1);
	    }
	});

	me.on('hide', function() {
	    load_task.cancel();
	});

	me.on('destroy', function() {
	    load_task.cancel();
	});
    }
});

