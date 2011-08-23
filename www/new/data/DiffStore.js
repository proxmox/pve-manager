/* Config properties:
 * rstore: A storage to track changes
 * Only works if rstore has a model and use 'idProperty'
 */
Ext.define('PVE.data.DiffStore', {
    extend: 'Ext.data.Store',

    constructor: function(config) {
	var me = this;

	var config = config || {};

	if (!config.rstore) 
	    throw "no rstore specified";
	if (!config.rstore.model) 
	    throw "no rstore model specified";

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
		olditem.beginEdit()
		me.model.prototype.fields.eachKey(function(field) {
		    if (olditem.data[field] !== data[field])
			olditem.set(field, data[field]);
		});
		olditem.endEdit(true);
		olditem.commit(); 
	    } else {
		var newrec = Ext.ModelMgr.create(data, me.model, id);
		var pos = (me.appendAtStart && !first_load) ? 0 : me.data.length;
		me.insert(pos, newrec);
	    }
	};

	me.mon(rstore, 'load', function(s, records, success) {

	    if (!success)
		return;

	    me.suspendEvents();

	    // remove vanished items
	    me.each(function(olditem) {
		var item = rstore.getById(olditem.getId());
		if (!item)
		    me.remove(olditem);
	    });
		    
	    rstore.each(function(item) {
		cond_add_item(item.data, item.getId());
	    });
	    	
	    me.filter();

	    first_load = false;

	    me.resumeEvents();
	    me.fireEvent('datachanged', me);
	});
    }
});
