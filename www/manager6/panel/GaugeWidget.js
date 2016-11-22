Ext.define('PVE.panel.GaugeWidget', {
    extend: 'Ext.panel.Panel',
    alias: 'widget.pveGauge',

    defaults: {
	style: {
	    'text-align':'center'
	}
    },
    items: [
	{
	    xtype: 'box',
	    itemId: 'title',
	    data: {
		title: ''
	    },
	    tpl: '<h3>{title}</h3>'
	},
	{
	    xtype: 'polar',
	    height: 120,
	    border: false,
	    itemId: 'chart',
	    series: [{
		type: 'gauge',
		value: 0,
		colors: ['#f5f5f5'],
		sectors: [0],
		donut: 90,
		needleLength: 100,
		totalAngle: Math.PI
	    }],
	    sprites: [{
		id: 'valueSprite',
		type: 'text',
		text: '',
		textAlign: 'center',
		textBaseline: 'bottom',
		x: 125,
		y: 110,
		fontSize: 30
	    }]
	},
	{
	    xtype: 'box',
	    itemId: 'text'
	}
    ],

    header: false,
    border: false,

    warningThreshold: 0.6,
    criticalThreshold: 0.9,
    warningColor: '#fc0',
    criticalColor: '#FF6C59',
    defaultColor: '#c2ddf2',
    backgroundColor: '#f5f5f5',

    initialValue: 0,


    updateValue: function(value, text) {
	var me = this;
	var color = me.defaultColor;

	if (value >= me.criticalThreshold) {
	    color = me.criticalColor;
	} else if (value >= me.warningThreshold) {
	    color = me.warningColor;
	}

	me.chart.series[0].setColors([color, me.backgroundColor]);
	me.chart.series[0].setValue(value*100);

	me.valueSprite.setText(' '+(value*100).toFixed(0) + '%');
	me.valueSprite.setAttributes({x: me.chart.getWidth()/2, y:me.chart.getHeight()-20}, true);

	if (text !== undefined) {
	    me.text.setHtml(text);
	}
    },

    initComponent: function() {
	var me = this;

	me.callParent();

	if (me.title) {
	    me.getComponent('title').update({title: me.title});
	}
	me.text = me.getComponent('text');
	me.chart = me.getComponent('chart');
	me.valueSprite = me.chart.getSurface('chart').get('valueSprite');
    }
});
