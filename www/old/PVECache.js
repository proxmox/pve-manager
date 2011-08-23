Ext.ns("PVE");

PVE.Cache = function() {

    var defaults = {};

    var pvecache = {

	startUpdate: function() {	    
	    Ext.each(this.storelist, function(store) {
		store.startUpdate(); 
	    });
	},


	// fixme: use a single store instead of three
	// URl: /api2/json/cluster/index

	nodestore: function(){

	    var fields = PVE.Utils.get_field_defaults(['name', 'storage', 'cpu', 'maxcpu',
						       'mem', 'maxmem', 'uptime']);

	    var store = new PVE.data.UpdateStore({
		itype: 'node',
		idProperty: 'name',
		autoDestroy: false,
		url: '/api2/json/nodes',
		fields: fields
	    });

	    return store;
  
	}(),

	vmstore: function(){

	    var fields = PVE.Utils.get_field_defaults(['id', 'name', 'node', 'storage', 'cpu', 'maxcpu',
						       'mem', 'maxmem', 'disk', 'maxdisk', 'uptime']);
	    var store = new  PVE.data.UpdateStore({
		itype: 'vm',
		idProperty: 'id',
		autoDestroy: false,
		url: '/api2/json/cluster/vms',
		fields: fields
	    });

	    return store;
  
	}(),

	ststore: function(){

	    var fields = PVE.Utils.get_field_defaults(['name', 'storage', 'node', 'shared', 'disk', 'maxdisk']);

	    var store = new  PVE.data.UpdateStore({
		itype: 'storage',
		idProperty: 'name',
		autoDestroy: false,
		url: '/api2/json/cluster/storage',
		fields: fields
	    });

	    return store;
  
	}(),

	dummy: "ignore me"
    };

    pvecache.storelist = [
	pvecache.nodestore,
	pvecache.vmstore,
	pvecache.ststore
    ];

    pvecache.searchstore = new PVE.data.SearchStore({ storelist: pvecache.storelist });

    return pvecache;

}();

