/* A reader to store a single JSON Object (hash) into a storage.
 * Also accepts an array containing a single hash. 
 * So it can read:
 *
 * example1: { data: "xyz" }
 * example2: [ {  data: "xyz" } ]
 */

Ext.define('PVE.data.reader.JsonObject', {
    extend: 'Ext.data.reader.Json',
    alias : 'reader.jsonobject',
    
    root: 'data',
 
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
	    var root = me.getRoot(result);

	    if (Ext.isArray(root)) {
		if (root.length == 1)
		    root = root[0];
		else
		    root = {};
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

