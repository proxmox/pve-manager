/* A reader to store a single JSON Object (hash) into a storage.
 * Also accepts an array containing a single hash. 
 *
 * So it can read:
 *
 * example1: {data1: "xyz", data2: "abc"} 
 * returns [{key: "data1", value: "xyz"}, {key: "data2", value: "abc"}]
 *
 * example2: [ {data1: "xyz", data2: "abc"} ] 
 * returns [{key: "data1", value: "xyz"}, {key: "data2", value: "abc"}]
 *
 * If you set 'readArray', the reader expexts the object as array:
 *
 * example3: [ { key: "data1", value: "xyz", p2: "cde" },  { key: "data2", value: "abc", p2: "efg" }]
 * returns [{key: "data1", value: "xyz", p2: "cde}, {key: "data2", value: "abc", p2: "efg"}]
 *
 * Note: The records can contain additional properties (like 'p2' above) when you use 'readArray'
 *
 * Additional feature: specify allowed properties with default values with 'rows' object
 *
 * var rows = {
 *   memory: {
 *     required: true,
 *     defaultValue: 512
 *   }
 * }
 *
 */

Ext.define('PVE.data.reader.JsonObject', {
    extend: 'Ext.data.reader.Json',
    alias : 'reader.jsonobject',
    
    readArray: false,

    rows: undefined,

    constructor: function(config) {
        var me = this;

        Ext.apply(me, config || {});

	me.callParent([config]);
    },

    getResponseData: function(response) {
	var me = this;

	var data = [];
        try {
        var result = Ext.decode(response.responseText);
        // get our data items inside the server response
        var root = result[me.getRootProperty()];

	    if (me.readArray) {

		var rec_hash = {};
		Ext.Array.each(root, function(rec) {
		    if (Ext.isDefined(rec.key)) {
			rec_hash[rec.key] = rec;
		    }
		});

		if (me.rows) {
		    Ext.Object.each(me.rows, function(key, rowdef) {
			var rec = rec_hash[key];
			if (Ext.isDefined(rec)) {
			    if (!Ext.isDefined(rec.value)) {
				rec.value = rowdef.defaultValue;
			    }
			    data.push(rec);
			} else if (Ext.isDefined(rowdef.defaultValue)) {
			    data.push({key: key, value: rowdef.defaultValue} );
			} else if (rowdef.required) {
			    data.push({key: key, value: undefined });
			}
		    });
		} else {
		    Ext.Array.each(root, function(rec) {
			if (Ext.isDefined(rec.key)) {
			    data.push(rec);
			}
		    });
		}
		
	    } else { 
		
		var org_root = root;

		if (Ext.isArray(org_root)) {
		    if (root.length == 1) {
			root = org_root[0];
		    } else {
			root = {};
		    }
		}

		if (me.rows) {
		    Ext.Object.each(me.rows, function(key, rowdef) {
			if (Ext.isDefined(root[key])) {
			    data.push({key: key, value: root[key]});
			} else if (Ext.isDefined(rowdef.defaultValue)) {
			    data.push({key: key, value: rowdef.defaultValue});
			} else if (rowdef.required) {
			    data.push({key: key, value: undefined});
			}
		    });
		} else {
		    Ext.Object.each(root, function(key, value) {
			data.push({key: key, value: value });
		    });
		}
	    }
	}
        catch (ex) {
            Ext.Error.raise({
                response: response,
                json: response.responseText,
                parseError: ex,
                msg: 'Unable to parse the JSON returned by the server: ' + ex.toString()
            });
        }

	return data;
    }
});

