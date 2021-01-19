/*
 * This is a running chart widget you add time datapoints to it, and we only
 * show the last x of it used for ceph performance charts
 */
Ext.define('PVE.widget.RunningChart', {
    extend: 'Ext.container.Container',
    alias: 'widget.pveRunningChart',

    layout: {
	type: 'hbox',
	align: 'center',
    },
    items: [
	{
	    width: 80,
	    xtype: 'box',
	    itemId: 'title',
	    data: {
		title: '',
	    },
	    tpl: '<h3>{title}:</h3>',
	},
	{
	    flex: 1,
	    xtype: 'cartesian',
	    height: '100%',
	    itemId: 'chart',
	    border: false,
	    axes: [
		{
		    type: 'numeric',
		    position: 'left',
		    hidden: true,
		    minimum: 0,
		},
		{
		    type: 'numeric',
		    position: 'bottom',
		    hidden: true,
		},
	    ],

	    store: {
		trackRemoved: false,
		data: {},
	    },

	    sprites: [{
		id: 'valueSprite',
		type: 'text',
		text: '0 B/s',
		textAlign: 'end',
		textBaseline: 'middle',
		fontSize: 14,
	    }],

	    series: [{
		type: 'line',
		xField: 'time',
		yField: 'val',
		fill: 'true',
		colors: ['#cfcfcf'],
		tooltip: {
		    trackMouse: true,
		    renderer: function( tooltip, record, ctx) {
			let me = this.getChart();
			if (!record || !record.data) return;
			let date = new Date(record.data.time);
			let value = me.up().renderer(record.data.val);
			tooltip.setHtml(
			    me.up().title + ': ' + value + '<br />' +
			    Ext.Date.format(date, 'H:i:s'),
			);
		    },
		},
		style: {
		    lineWidth: 1.5,
		    opacity: 0.60,
		},
		marker: {
		    opacity: 0,
		    scaling: 0.01,
		    fx: {
			duration: 200,
			easing: 'easeOut',
		    },
		},
		highlightCfg: {
		    opacity: 1,
		    scaling: 1.5,
		},
	    }],
	},
    ],

    // the renderer for the tooltip and last value, default just the value
    renderer: Ext.identityFn,

    // show the last x seconds default is 5 minutes
    timeFrame: 5*60,

    addDataPoint: function(value, time) {
	let me = this.chart;
	let panel = me.up();
	let now = new Date().getTime();
	let begin = new Date(now - (1000 * panel.timeFrame)).getTime();

	me.store.add({
	    time: time || now,
	    val: value || 0,
	});

	// delete all old records when we have 20 times more datapoints
	// than seconds in our timeframe (so even a subsecond graph does
	// not trigger this often)
	//
	// records in the store do not take much space, but like this,
	// we prevent a memory leak when someone has the site open for a long time
	// with minimal graphical glitches
	if (me.store.count() > panel.timeFrame * 20) {
	    var oldData = me.store.getData().createFiltered(function(item) {
		return item.data.time < begin;
	    });

	    me.store.remove(oldData.getRange());
	}

	me.timeaxis.setMinimum(begin);
	me.timeaxis.setMaximum(now);
	me.valuesprite.setText(panel.renderer(value || 0).toString());
	me.valuesprite.setAttributes({
	    x: me.getWidth() - 15,
	    y: me.getHeight()/2,
	}, true);
	me.redraw();
    },

    setTitle: function(title) {
	this.title = title;
	var me = this.getComponent('title');
	me.update({title: title});
    },

    initComponent: function(){
	var me = this;
	me.callParent();

	if (me.title) {
	    me.getComponent('title').update({title: me.title});
	}
	me.chart = me.getComponent('chart');
	me.chart.timeaxis = me.chart.getAxes()[1];
	me.chart.valuesprite = me.chart.getSurface('chart').get('valueSprite');
	if (me.color) {
	    me.chart.series[0].setStyle({
		fill: me.color,
		stroke: me.color,
	    });
	}
    },
});
