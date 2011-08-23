Ext.ns("PVE.data");

/* A reader to store a single JSON Object (hash) into a storage.
 * Also accepts an array containing a single hash. 
 * So it can read:
 *
 * example1: { data: "xyz" }
 * example2: [ {  data: "xyz" } ]
 */
PVE.data.ObjectReader = Ext.extend(Ext.data.JsonReader, {

    constructor: function(config){
        PVE.data.ObjectReader.superclass.constructor.call(this, Ext.apply(config, {
	    root: 'data',
	    idProperty: 'name',
	    fields: [
		{name: 'name', type: 'text'},
		{name: 'value', type: 'text'}
	    ]	    
	}));
	this.rows = config.rows;
    },

    extractData : function(root, returnRecords) {

       if (returnRecords !== true)
	    throw "not implemented";

	if (Ext.isArray(root)) {
	    if (root.length == 1)
		root = root[0];
	    else
		root = {};
	}

        var Record = this.recordType;
 	var rs = [];
	var rows = this.rows;

	if (rows) {
	    Ext.iterate(rows, function(key, rowdef) {
		var value = root[key];
		if (Ext.isDefined(value)) {
		    var rec = new Record({ name: key, value: value }, key);
		    rs.push(rec);
		}
	    });
	} else {
	    Ext.iterate(root, function(key, value) { 
		var rec = new Record({ name: key, value: value }, key);
		rs.push(rec);
	    });
	}

	return rs;
     }
});
