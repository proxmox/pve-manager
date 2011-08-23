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

	    var store = queue.shift();
	    if (!store) {
		return;
	    }

	    queue_idx[store.storeid] = null;

	    idle = false;
	    store.load({
		callback: function(records, operation, success) {
		    idle = true;
		    start_update();
		}
	    });
	};

	Ext.apply(me, {
	    queue: function(store) {
		if (!store.storeid) {
		    throw "unable to queue store without storeid";
		}
		if (!queue_idx[store.storeid]) {
		    queue_idx[store.storeid] = store;
		    queue.push(store);
		}
		start_update();
	    }
	});
    }
});
