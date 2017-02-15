/*
 * Display log entries in a panel with scrollbar
 * The log entries are automatically refreshed via a background task,
 * with newest entries comming at the bottom
 */
Ext.define('PVE.panel.LogView', {
    extend: 'Ext.panel.Panel',

    alias: ['widget.pveLogView'],

    pageSize: 500,

    lineHeight: 16,

    viewInfo: undefined,

    scrollToEnd: true,

    autoScroll: true,

    layout: 'auto',

    bodyPadding: 5,

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

	if (me.destroyed) { // return if element is not there anymore
	    return;
	}

	var el = me.dataCmp.el;

	if (me.viewInfo && me.viewInfo.start === start &&
	    me.viewInfo.end === end && me.viewInfo.total === total &&
	    me.viewInfo.textLength === text.length) {
	    return; // same content
	}

	var maxDown = me.getMaxDown();
	var scrollToEnd = (maxDown <= 0) && me.scrollToEnd;

	el.setStyle('padding-top', (start*me.lineHeight).toString() + 'px');
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

	var req_params = {
	    start: start,
	    limit: me.pageSize
	};

	if (me.log_select_timespan) {
	    // always show log until the end of the selected day
	    req_params.until = Ext.Date.format(me.until_date, 'Y-m-d') + ' 23:59:59';
	    req_params.since = Ext.Date.format(me.since_date, 'Y-m-d');
	}

	PVE.Utils.API2Request({
	    url: me.url,
	    params: req_params,
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

       // show logs from today back to 3 days ago per default
       me.until_date = new Date();
       me.since_date = new Date();
       me.since_date.setDate(me.until_date.getDate() - 3);

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
	    items: me.dataCmp,
	    listeners: {
		destroy: function() {
		    Ext.TaskManager.stop(me.task);
		}
	    }
	});

	if (me.log_select_timespan) {
	    me.tbar = ['->','Since: ',
		       {
			   xtype: 'datefield',
			   maxValue: me.until_date,
			   value: me.since_date,
			   name: 'since_date',
			   format: 'Y-m-d',
			   listeners: {
			       select: function(field, date) {
				   me.since_date_selected = date;
				   var until_field = field.up().down('field[name=until_date]');
				   if (date > until_field.getValue()) {
				       until_field.setValue(date);
				   }
			       }
			   }
		       },
		       'Until: ',
		       {
			   xtype: 'datefield',
			   maxValue: me.until_date,
			   value: me.until_date,
			   name: 'until_date',
			   format: 'Y-m-d',
			   listeners: {
			       select: function(field, date) {
				   var since_field = field.up().down('field[name=since_date]');
				   if (date < since_field.getValue()) {
				       since_field.setValue(date);
				   }
			       }
			   }
		       },
		       {
			   xtype: 'button',
			   text: 'Update',
			   handler: function() {
			       var until_field = me.down('field[name=until_date]');
			       var since_field = me.down('field[name=since_date]');
			       if (until_field.getValue() < since_field.getValue()) {
				   Ext.Msg.alert('Error',
						 'Since date must be less equal than Until date.');
				   until_field.setValue(me.until_date);
				   since_field.setValue(me.since_date);
			       } else {
				   me.until_date = until_field.getValue();
				   me.since_date = since_field.getValue();
				   me.requestUpdate();
			       }
			   }
		       }
		      ];
	}


	me.callParent();
    }
});
