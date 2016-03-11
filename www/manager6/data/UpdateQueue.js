// Serialize load (avoid too many parallel connections)
Ext.define('PVE.data.UpdateQueue', {
    singleton: true,

    constructor : function(){
        var me = this;

	var queue = [];
	var queue_idx = {};

	var idle = true;

	var start_update = function() {
	    if (!idle) {
		return;
	    }

	    var storeid = queue.shift();
	    if (!storeid) {
		return;
	    }
	    var info = queue_idx[storeid];
	    queue_idx[storeid] = null;

	    info.updatestart = new Date();

	    idle = false;
	    info.store.load({
		callback: function(records, operation, success) {
		    idle = true;
		    if (info.callback) {
			var runtime = (new Date()).getTime() - info.updatestart.getTime();
			info.callback(runtime, success);
		    }
		    start_update();
		}
	    });
	};

	Ext.apply(me, {
	    queue: function(store, cb) {
		var storeid = store.storeid;
		if (!storeid) {
		    throw "unable to queue store without storeid";
		}
		if (!queue_idx[storeid]) {
		    queue_idx[storeid] = {
			store: store,
			callback: cb
		    };
		    queue.push(storeid);
		}
		start_update();
	    },
	    unqueue: function(store) {
		var storeid = store.storeid;
		if (!storeid) {
		    throw "unabel to unqueue store without storeid";
		}
		if (queue_idx[storeid]) {
		    Ext.Array.remove(queue,storeid);
		    queue_idx[storeid] = null;
		}
	    }
	});
    }
});
