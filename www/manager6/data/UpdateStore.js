/* Extends the Ext.data.Store type
 * with  startUpdate() and stopUpdate() methods
 * to refresh the store data in the background
 * Components using this store directly will flicker
 * due to the redisplay of the element ater 'config.interval' ms
 */
Ext.define('PVE.data.UpdateStore', {
    extend: 'Ext.data.Store',

    constructor: function(config) {
	var me = this;

	config = config || {};

	if (!config.interval) {
	    config.interval = 3000;
	}

	if (!config.storeid) {
	    throw "no storeid specified";
	}

	var load_task = new Ext.util.DelayedTask();

	var run_load_task = function() {
	    if (PVE.Utils.authOK()) {
		PVE.data.UpdateQueue.queue(me, function(runtime, success) {
		    var interval = config.interval + runtime*2;
		    load_task.delay(interval, run_load_task);
		});
	    } else {
		load_task.delay(200, run_load_task);
	    }
	};

	Ext.apply(config, {
	    startUpdate: function() {
		run_load_task();
	    },
	    stopUpdate: function() {
		load_task.cancel();
	    }
	});

	me.callParent([config]);

	me.on('destroy', function() {
	    load_task.cancel();
	});
    }
});
