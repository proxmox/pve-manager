Ext.define('PVE.panel.LogView', {
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

	el.setStyle('padding-top', start*me.lineHeight + 'px');
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
		PVE.Utils.setErrorMask(me, false);
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
		PVE.Utils.setErrorMask(me, msg);
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

    requestUpdate: function(top, force) {
	var me = this;

	if (top === undefined) {
	    var target = me.getTargetEl();
	    top = target.dom.scrollTop;
	}

	var viewStart = parseInt((top / me.lineHeight) - 1, 10);
	if (viewStart < 0) {
	    viewStart = 0;
	}
	var viewEnd = parseInt(((top + me.getHeight())/ me.lineHeight) + 1, 10);
	var info = me.viewInfo;

	if (info && !force) {
	    if (viewStart >= info.start && viewEnd <= info.end) {
		return;
	    }
	}

	var line = parseInt((top / me.lineHeight) - (me.pageSize / 2) + 10, 10);
	if (line < 0) {
	    line = 0;
	}

	me.attemptLoad(line);
    },

    afterRender: function() {
	var me = this;

        me.callParent(arguments);
 
	Ext.Function.defer(function() {
	    var target = me.getTargetEl();
	    target.on('scroll',  function(e) {
		me.requestUpdate();
	    });
	    me.requestUpdate(0);
	}, 20);
    },

    initComponent : function() {
	/*jslint confusion: true */

	var me = this;

	if (!me.url) {
	    throw "no url specified";
	}

	me.dataCmp = Ext.create('Ext.Component', {
	    style: 'font:normal 11px tahoma, arial, verdana, sans-serif;' +
		'line-height: ' + me.lineHeight.toString() + 'px; white-space: pre;'
	});

	me.task = Ext.TaskManager.start({
	    run: function() {
		if (!me.isVisible() || !me.scrollToEnd || !me.viewInfo) {
		    return;
		}
		
		var maxDown = me.getMaxDown();
		if (maxDown > 0) {
		    return;
		}

		me.requestUpdate(undefined, true);
	    },
	    interval: 1000
	});

	Ext.apply(me, {
	    autoScroll: true,
	    layout: 'auto',
	    items: me.dataCmp,
	    bodyStyle: 'padding: 5px;',
	    listeners: {
		show: function() {
		    var target = me.getTargetEl();
		    if (target && target.dom) {
			target.dom.scrollTop = me.savedScrollTop;
		    }
		},
		beforehide: function() {
		    // Hack: chrome reset scrollTop to 0, so we save/restore
		    var target = me.getTargetEl();
		    if (target && target.dom) {
			me.savedScrollTop = target.dom.scrollTop;
		    }
		},
		destroy: function() {
		    Ext.TaskManager.stop(me.task);
		}
	    }
	});

	me.callParent();
    }
});
