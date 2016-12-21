/*
 * The DiffStore is a in-memory store acting as proxy between a real store
 * instance and a component.
 * Its purpose is to redisplay the component *only* if the data has been changed
 * inside the real store, to avoid the annoying visual flickering of using
 * the real store directly.
 *
 * Implementation:
 * The DiffStore monitors via mon() the 'load' events sent by the real store.
 * On each 'load' event, the DiffStore compares its own content with the target
 * store (call to cond_add_item()) and then fires a 'refresh' event.
 * The 'refresh' event will automatically trigger a view refresh on the component
 * who binds to this store.
 */

/* Config properties:
 * rstore: the realstore which will autorefresh its content from the API
 * Only works if rstore has a model and use 'idProperty'
 * sortAfterUpdate: sort the diffstore before rendering the view
 */
Ext.define('PVE.data.DiffStore', {
    extend: 'Ext.data.Store',
    alias: 'store.diff',

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

	var loadFn = function(s, records, success) {

	    if (!success) {
		return;
	    }

	    me.suspendEvents();

	    // getSource returns null if data is not filtered
	    // if it is filtered it returns all records
	    var allItems = me.getData().getSource() || me.getData();

	    // remove vanished items
	    allItems.each(function(olditem) {
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
	    me.fireEvent('datachanged', me);
	};

	if (rstore.isLoaded()) {
	    // if store is already loaded,
	    // insert items instantly
	    loadFn(rstore, [], true);
	}

	me.mon(rstore, 'load', loadFn);
    }
});
