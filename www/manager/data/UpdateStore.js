Ext.define('PVE.data.UpdateStore', {
    extend: 'Ext.data.Store',
    requires: [
	'PVE.Utils', 
	'Ext.util.*', 
	'PVE.data.UpdateQueue'
    ],

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
		PVE.data.UpdateQueue.queue(me);
		load_task.delay(config.interval, run_load_task);
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
