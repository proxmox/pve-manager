Ext.ns("PVE.data");

// Serialize load (avoid too many parallel connections)
PVE.data.UpdateQueue = function() {

    var queue = [];
    var queue_idx = {};

    var idle = true;

    var start_update = function() {
	if (!idle)
	    return;
	var store = queue.shift();
	if (!store)
	    return;

	queue_idx[store.itype] = null;

	idle = false;
	store.load({
	    callback: function() {
		idle = true;
		start_update();
	    }
	});
    };

    return {
	queue: function(store) {
	    if (queue_idx[store.itype])
		return;
	    queue_idx[store.itype] = store;
	    queue.push(store);
	    start_update();
	}
    };
}();

PVE.data.UpdateStore = Ext.extend(Ext.data.JsonStore, {

    constructor: function(config) {
	var self = this;

	var load_task;

	var run_load_task = function(delay) {
	    if (!load_task) {
		load_task = new Ext.util.DelayedTask(function() {
		    PVE.data.UpdateQueue.queue(self);
		});
	    }
	    
	    load_task.delay(delay === undefined ? self.interval : delay);
	};

        config = config || {};

	if (!config.interval)
	    config.interval = 3000;
	    
	if (!config.itype)
	    throw "no itype specifued";

	Ext.apply(config, {
	    root: 'data',

	    startUpdate: function() {
		run_load_task(10);
	    },

	    stopUpdate: function() {
		if (!load_task)
		    return;

		load_task.cancel();
	    },

	    listeners: {
		beforeload: function() {
		    if (!PVE.Utils.authOK()) {
			run_load_task(1000);
			return false;
		    }
		},
		load: function() {
		    run_load_task();
		},
		exception: function() {
		    // fixme: what to do here ?
		    //console.log("got load expection");
		    run_load_task();
		}
	    }
	});

	PVE.data.UpdateStore.superclass.constructor.call(self, config);
    }
});
