/*
 * The DiffStore acts as proxy between an UpdateStore instance and a component.
 * Its purpose is to redisplay the component *only* if the data has been changed
 * inside the UpdateStore, to avoid the annoying visual flickering of using
 * the UpdateStore directly.
 *
 * Implementation:
 * The DiffStore monitors via mon() the 'load' events sent by the target store.
 * On each 'load' event, the DiffStore compares its own content with the target
 * store (call to cond_add_item()) and then fires a 'refresh' event.
 * The 'refresh' event will automatically trigger a view refresh on the component
 * who binds to this store.
 */

/* Config properties:
 * rstore: A target store to track changes
 * Only works if rstore has a model and use 'idProperty'
 */
Ext.define('PVE.data.DiffStore', {
    extend: 'Ext.data.Store',

    sortAfterUpdate: false,
    
    constructor: function(config) {
	var me = this;

	config = config || {};

	if (!config.rstore) {
	    throw "no rstore specified";
	}

	if (!config.rstore.model) {
	    throw "no rstore model specified";
	}

	var rstore = config.rstore;

	Ext.apply(config, {
	    model: rstore.model,
	    proxy: { type: 'memory' }
	});

	me.callParent([config]);

	var first_load = true;

	var cond_add_item = function(data, id) {
	    var olditem = me.getById(id);
	    if (olditem) {
		olditem.beginEdit();
		Ext.Array.each(me.model.prototype.fields, function(field) {
		    if (olditem.data[field.name] !== data[field.name]) {
			olditem.set(field.name, data[field.name]);
		    }
		});
		olditem.endEdit(true);
		olditem.commit(); 
	    } else {
		var newrec = Ext.create(me.model, data);
		var pos = (me.appendAtStart && !first_load) ? 0 : me.data.length;
		me.insert(pos, newrec);
	    }
	};

	me.mon(rstore, 'load', function(s, records, success) {

	    if (!success) {
		return;
	    }

	    me.suspendEvents();

	    // remove vanished items
	    (me.snapshot || me.data).each(function(olditem) {
		var item = rstore.getById(olditem.getId());
		if (!item) {
		    me.remove(olditem);
		}
	    });

	    rstore.each(function(item) {
		cond_add_item(item.data, item.getId());
	    });

	    me.filter();

	    if (me.sortAfterUpdate) {
		me.sort();
	    }

	    first_load = false;

	    me.resumeEvents();
	    me.fireEvent('refresh', me);
	});
    }
});
