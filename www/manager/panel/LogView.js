Ext.define('PVE.LogView', {
    extend: 'Ext.panel.Panel',

    alias: ['widget.pveLogView'],

    pageSize: 500,

    lineHeight: 16,

    viewInfo: undefined,

    scrollToEnd: true,

    getMaxDown: function(scrollToEnd) {
        var me = this;

	var target = me.getTargetEl();
	var dom = target.dom;
	if (scrollToEnd) {
	    dom.scrollTop = dom.scrollHeight - dom.clientHeight;
	}

	var maxDown = dom.scrollHeight - dom.clientHeight - 
	    dom.scrollTop;

	return maxDown;
    },

    updateView: function(start, end, total, text) {
        var me = this;
	var el = me.dataCmp.el;

	if (me.viewInfo && me.viewInfo.start === start &&
	    me.viewInfo.end === end && me.viewInfo.total === total &&
	    me.viewInfo.textLength === text.length) {
	    return; // same content
	}

	var maxDown = me.getMaxDown();
	var scrollToEnd = (maxDown <= 0) && me.scrollToEnd;

	el.setStyle('padding-top', start*me.lineHeight);
	el.update(text);
	me.dataCmp.setHeight(total*me.lineHeight);

	if (scrollToEnd) {
	    me.getMaxDown(true);
	}

	me.viewInfo = {
	    start: start,
	    end: end,
	    total: total,
	    textLength:  text.length
	};
    },

    doAttemptLoad: function(start) {
        var me = this;

	PVE.Utils.API2Request({
	    url: me.url,
	    params: {
		start: start,
		limit: me.pageSize
	    },
	    method: 'GET',
	    success: function(response) {
		me.setLoading(false);
		var list = response.result.data;
		var total = response.result.total;
		var first = 0, last = 0;
		var text = '';
		Ext.Array.each(list, function(item) {
		    if (!first|| item.n < first) {
			first = item.n;
		    }
		    if (!last || item.n > last) {
			last = item.n;
		    }
		    text = text + Ext.htmlEncode(item.t) + "<br>";
		});

		if (first && last && total) {
		    me.updateView(first -1 , last -1, total, text);
		} else {
		    me.updateView(0, 0, 0, '');
		}
	    },
	    failure: function(response) {
		var msg = response.htmlStatus;
		me.setLoading(msg);
	    }
	});			      
    },

    attemptLoad: function(start) {
        var me = this;
        if (!me.loadTask) {
            me.loadTask = Ext.create('Ext.util.DelayedTask', me.doAttemptLoad, me, []);
        }
        me.loadTask.delay(200, me.doAttemptLoad, me, [start]);
    },


    initComponent : function() {
	var me = this;

	if (!me.url) {
	    throw "no url specified";
	}

	me.dataCmp = Ext.create('Ext.Component', {
	    style: 'font:normal 11px tahoma, arial, verdana, sans-serif;' +
		'line-height: ' + me.lineHeight + 'px; white-space: pre;'
	});

	var requestUpdate = function(top, force) {
	    var viewStart = parseInt((top / me.lineHeight) - 1);
	    if (viewStart < 0) {
		viewStart = 0;
	    }
	    var viewEnd = parseInt(((top + me.getHeight())/ me.lineHeight) + 1);
	    var info = me.viewInfo;
	    if (info && !force) {
		if (viewStart >= info.start && viewEnd <= info.end) {
		    return;
		}
	    }
	    var line = parseInt((top / me.lineHeight) - (me.pageSize / 2) + 10);
	    if (line < 0) {
		line = 0;
	    }

	    me.attemptLoad(line);
	};

	var autoScrollTask = {
	    run: function() {
		if (!me.scrollToEnd || !me.viewInfo) {
		    return;
		}

		var target = me.getTargetEl();
		var dom = target.dom;
		var maxDown = dom.scrollHeight - dom.clientHeight - 
		    dom.scrollTop;

		if (maxDown > 0) {
		    return;
		}

		requestUpdate(dom.scrollTop, true);
	    },
	    interval: 1000
	};

	var task;
	var savedScrollTop = 0;

	Ext.apply(me, {
	    autoScroll: true,
	    layout: 'auto',
	    items: me.dataCmp,
	    bodyStyle: 'padding: 5px;',
	    listeners: {
		afterrender: Ext.Function.createDelayed(function() {
		    var target = me.getTargetEl();
		    target.on('scroll',  function(e) {
			requestUpdate(target.dom.scrollTop);
		    });
		    requestUpdate(0);
		}, 20),
		show: function() {
		    var target = me.getTargetEl();
		    target.dom.scrollTop = savedScrollTop;
		    task = Ext.TaskManager.start(autoScrollTask);
		},
		beforehide: function() {
		    var target = me.getTargetEl();
		    // Hack: chrome reset scrollTop to 0, so we save/restore
		    savedScrollTop = target.dom.scrollTop;
		    if (task) {
			Ext.TaskManager.stop(task);
		    }
		},
		destroy: function() {
		    if (task) {
			Ext.TaskManager.stop(task);
		    }
		}
	    }
	});

	me.callParent();
    }
});
