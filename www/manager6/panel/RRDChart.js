Ext.define('PVE.widget.RRDChart', {
    extend: 'Ext.chart.CartesianChart',
    alias: 'widget.pveRRDChart',


    width: 800,
    height: 300,
    interactions: 'crosszoom',
    axes: [{
	type: 'numeric',
	position: 'left',
	grid: true,
	renderer: 'leftAxisRenderer',
	minimum: 0,
    }, {
	type: 'time',
	position: 'bottom',
	grid: true,
	fields: ['time'],
    }],
    legend: {
	docked: 'right',
	// we set this that all graphs have same width
	width: 140,
    },
    listeners: {
	afterrender: 'onAfterRender'
    },

    bytesArr : [
	'memtotal',
	'memused',
	'roottotal',
	'rootused',
	'swaptotal',
	'swapused',
	'maxmem',
	'mem',
	'disk',
	'maxdisk',
	'total',
	'used',
    ],
    bytespersArr: [
	'netin',
	'netout',
	'diskread',
	'diskwrite'
    ],

    percentArr: [
	'cpu',
	'iowait'
    ],

    convertToUnits: function(value) {
	var units = ['', 'k','M','G','T', 'P'];
	var si = 0;
	while(value >= 1000  && si < (units.length -1)){
	    value = value / 1000;
	    si++;
	}
	// javascript floating point weirdness
	value = Ext.Number.correctFloat(value);

	// limit to 2 decimal points
	value = Ext.util.Format.number(value, "0.##");

	return value + " " + units[si];
    },

    leftAxisRenderer: function(axis, label, layoutContext) {
	var me = this;
	return me.convertToUnits(label);
    },

    onSeriesTooltipRender: function (tooltip, record, item) {
	var me = this;
	var suffix = '';

	if (me.percentArr.indexOf(item.field) != -1) {
	    suffix = '%';
	} else if (me.bytesArr.indexOf(item.field) != -1) {
	    suffix = 'B';
	} else if (me.bytespersArr.indexOf(item.field) != -1) {
	    suffix = 'B/s';
	}

	var prefix = item.field;
	if (me.fieldTitles && me.fieldTitles[me.fields.indexOf(item.field)]) {
	    prefix = me.fieldTitles[me.fields.indexOf(item.field)];
	}
        tooltip.setHtml(prefix + ': ' + this.convertToUnits(record.get(item.field)) + suffix +
	    '<br>' + new Date(record.get('time')));
    },

    onAfterRender: function(){
	var me = this;

	// add correct label for left axis
	var axisTitle = "";
	if (me.percentArr.indexOf(me.fields[0]) != -1) {
	    axisTitle = "%";
	} else if (me.bytesArr.indexOf(me.fields[0]) != -1) {
	    axisTitle = "Bytes";
	} else if (me.bytespersArr.indexOf(me.fields[0]) != -1) {
	    axisTitle = "Bytes/s";
	}
	me.axes[0].setTitle(axisTitle);

	// add a series for each field we get
	me.fields.forEach(function(item, index){
	    var title = item;
	    if (me.fieldTitles && me.fieldTitles[index]) {
		title = me.fieldTitles[index];
	    }
	    me.addSeries({
		type: 'line',
		xField: 'time',
		yField: item,
		title: title,
		fill: true,
		style: {
		    lineWidth: 1.5,
		    opacity: 0.60,
		},
		marker: {
		    opacity: 0,
		    scaling: 0.01,
		    fx: {
			duration: 200,
			easing: 'easeOut'
		    }
		},
		highlightCfg: {
		    opacity: 1,
		    scaling: 1.5
		},
		tooltip: {
		    trackMouse: true,
		    renderer: 'onSeriesTooltipRender'
		}
	    });
	});
    },

    initComponent: function() {
	var me = this;

	if (!me.store) {
	    throw "cannot work without store";
	}

	if (!me.fields) {
	    throw "cannot work without fields";
	}

	me.callParent();
    }
});
