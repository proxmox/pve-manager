Ext.ns("PVE.data");

PVE.data.SearchStore = Ext.extend(Ext.data.Store, {

    constructor: function(config) {
	var self = this;

	config = config || {};

	if (!config.storelist)
	    throw "no storage list specified";

	var text_filter = '';

	var text_filter_fn = function(item) {
	    if (text_filter) {
		var match = false;
		Ext.each(['name', 'storage', 'node'], function(field) {
		    var v = item.data[field];
		    if (v !== undefined) {
			v = v.toLowerCase();
			if (v.indexOf(text_filter) >= 0) {
			    match = true;
			    return false;
			}
		    }
		});
		return !match;
	    } 
	    return false;
	};

	var item_filter_fn;

	var group_filter = [];

	var filterFn = function(item, itype) {

	    if (item_filter_fn && !item_filter_fn(item, itype)) {
		return true;
	    }

	    for (var i = 0, len = group_filter.length; i < len; i++) {
		var filter = group_filter[i];
		var field = filter.field;
		if (field === 'itype') {
		    if (itype != filter.value)
			return true;
		} else if (item.data[field] != filter.value)
		    return true;
	    }

	    return text_filter_fn(item);
	};

	var load_info = {};

	var task_search = null;

	var run_search_task = function(delay) {

	    if (!task_search) {
	    
		task_search = new Ext.util.DelayedTask(function() {

		    console.log("text filter " + text_filter);

		    self.suspendEvents();

		    self.removeAll();
	
		    Ext.each(config.storelist, function(store) {
			self.initStore(store, store.itype);
		    });

		    self.applySort();

		    self.resumeEvents();

		    self.fireEvent('datachanged', self);
		
		    self.fireEvent('load', self);
	
		});
	    }

	    task_search.delay(delay);
	};

	var basefields = PVE.Utils.base_fields;

	var myfields = ['objectid', 'itype', 'itemid'].concat(basefields);;
	
	var reader =  new Ext.data.ArrayReader({
	    fields: myfields,
	    idIndex: 0
	});

	Ext.apply(config, {

	    reader: reader,

	    sortInfo: {
		field: 'itype',
		direction: 'DESC'
	    },	
	    
	    getTextFilter: function() {
		return text_filter;
	    },

	    setTextFilter: function(text) {

		if (text_filter === text)
		    return;

		text_filter = text.toLowerCase();

		run_search_task(200);
	    },

	    setGroupFilter: function(viewname, filterinfo) {

		item_filter_fn = PVE.Utils.default_views[viewname].filterfn;

		group_filter = filterinfo;

		run_search_task(10);
	    },

	    createRec: function(item, uid, itype) {
	    
		var info = Ext.apply({}, item.data);

		Ext.apply(info, {
		    itype: itype,
		    id: uid,
		    text: item.id,
		    itemid: item.id,
		    leaf: true
		});		    
	    
		var rec = new self.reader.recordType(info, uid);
	    
		return rec;
	    },
 
	    initStore: function(basestore, itype) {
 
		console.log("basestore init " + itype);

		load_info[itype] = true;

		basestore.each(function(item) {

		    if (filterFn(item, itype))
			return true;

		    var uid = itype + "." + item.id;

		    //console.log("add item " + uid);

		    var rec = self.createRec(item, uid, itype);
		    self.add(rec);
		});
	    },

	    updateStore: function(basestore, itype) {
	    
		//console.log("basestore load " + itype);
	    
		if (!load_info[itype]) {
		    
		    //console.log("basestore first load " + itype);
		
		    self.suspendEvents();
	    
		    self.initStore(basestore, itype);
		
		    self.applySort();

		    self.resumeEvents();
		
		    self.fireEvent('datachanged', self);
 	    
		} else {
	
		    // update tree
		    //console.log("basestore update start");

		    self.suspendEvents();

		    // remove vanished or changed items
		    var rmlist = [];
		    self.each(function(item) {
		    
			if (item.data.itype !== itype)
			    return true;
		
			var newitem = basestore.getById(item.data.itemid);

			if (!newitem)
			    rmlist.push(item);
		    });

		    if (rmlist.length) 
			self.remove(rmlist); //fixme:
		
		    var addlist = [];
		    basestore.each(function(newitem) {

			if (filterFn(newitem, itype))
			    return true;

			var uid = itype + "." + newitem.id;

			var item = self.getById(uid);
			if (!item) {
			    //console.log("add item " + uid);
			    var rec = self.createRec(newitem, uid, itype);
			    addlist.push(rec);
			} else {
			    var changes = false;
			    for (var i = 0, len = basefields.length; i < len; i++) {
				field = basefields[i];
				if (field != 'id' && item[field] != newitem.data[field]) {
				    item.beginEdit()
				    item.set(field,newitem.data[field]);
				    changes = true;
				    //item[field] = newitem.data[field];
				}
			    };
			    if (changes)
				item.commit(true);
			}
		    });

		    if (addlist.length) 
			self.add(addlist);

		    self.applySort();

		    self.resumeEvents();

		    self.fireEvent('datachanged', self);
	 
		    //console.log("basestore update end " + itype);
		}
	    }
	});

	PVE.data.SearchStore.superclass.constructor.call(self, config);
	    
	Ext.each(config.storelist, function(store)  {
	    var update_store = function() {
		self.updateStore(store, store.itype);
	    };

	    store.on('load', update_store);

	    self.on('destroy', function () {
		store.un('load', update_store);
	    });
	});      
    }
});
