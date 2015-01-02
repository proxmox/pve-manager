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
	    var org_root = root;

	    if (Ext.isArray(org_root)) {
		if (org_root.length == 1) {
		    root = org_root[0];
		} else {
		    root = {};
		}
	    }

	    if (me.pending) {

		if (me.rows) {
		    Ext.Object.each(me.rows, function(key, rowdef) {
			if (Ext.isDefined(root[key])) {
			    if(Ext.isDefined(root[key]["value"])){
				data.push({key: key, value: root[key]["value"], pending: root[key]["pending"], delete: root[key]["delete"]});
			    }else if(Ext.isDefined(rowdef.defaultValue)){
				data.push({key: key, value: rowdef.defaultValue, pending: root[key]["pending"], delete: root[key]["delete"]});
			    }
			} else if (Ext.isDefined(rowdef.defaultValue)) {
			    data.push({key: key, value: rowdef.defaultValue, pending: undefined, delete: undefined});
			} else if (rowdef.required) {
			    data.push({key: key, value: undefined, pending: undefined, delete: undefined});
			}
		    });
		} else {
		    Ext.Object.each(root, function(key, value) {
			data.push({key: key, value: root[key]["value"], pending: root[key]["pending"], delete: root[key]["delete"]});
		    });
	    	}

	    } else {

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

