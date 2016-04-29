/* Extends the PVE.data.UpdateStore type
 *
 *
 */
Ext.define('PVE.data.RRDStore', {
    extend: 'PVE.data.UpdateStore',
    alias: 'store.pveRRDStore',

    setRRDUrl: function(timeframe, cf) {
	var me = this;
	if (!timeframe) {
	    timeframe = me.timeframe;
	}

	if (!cf) {
	    cf = me.cf;
	}

	me.proxy.url = me.rrdurl + "?timeframe=" + timeframe + "&cf=" + cf;
    },

    proxy: {
	type: 'pve'
    },
    fields: [
	// node rrd fields
	{
	    name:'cpu',
	    // percentage
	    convert: function(value) {
		return value*100;
	    }
	},
	{
	    name:'iowait',
	    // percentage
	    convert: function(value) {
		return value*100;
	    }
	},
	'loadavg',
	'maxcpu',
	'memtotal',
	'memused',
	'netin',
	'netout',
	'roottotal',
	'rootused',
	'swaptotal',
	'swapused',
	'time',

	// missing qemu/lxc fields
	'maxmem',
	'mem',
	'disk',
	'diskread',
	'diskwrite',
	'maxdisk',

	// missing storage fields
	'used',
	'total',

	// for time we generate unix timestamps, javascript uses milliseconds instead of seconds
	{ name:'time', convert: function(value) { return value*1000; }}
    ],
    sorters: 'time',
    timeframe: 'hour',
    cf: 'AVERAGE',

    constructor: function(config) {
	var me = this;

	config = config || {};

	// set default interval to 30seconds
	if (!config.interval) {
	    config.interval = 30000;
	}

	// set a new storeid
	if (!config.storeid) {
	    config.storeid = 'rrdstore-' + (++Ext.idSeed);
	}

	// rrdurl is required
	if (!config.rrdurl) {
	    throw "no rrdurl specified";
	}

	var stateid = 'pveRRDTypeSelection';
	var sp = Ext.state.Manager.getProvider();
	var stateinit = sp.get(stateid);

        if (stateinit) {
	    if(stateinit.timeframe !== me.timeframe || stateinit.cf !== me.rrdcffn){
		me.timeframe = stateinit.timeframe;
		me.rrdcffn = stateinit.cf;
	    }
	}

	me.callParent([config]);

	me.setRRDUrl();
	me.mon(sp, 'statechange', function(prov, key, state){
	    if (key === stateid) {
		if (state && state.id) {
		    if (state.timeframe !== me.timeframe || state.cf !== me.cf) {
		        me.timeframe = state.timeframe;
		        me.cf = state.cf;
			me.setRRDUrl();
			me.reload();
		    }
		}
	    }
	});
    }
});
