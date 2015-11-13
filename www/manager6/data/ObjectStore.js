/* This store encapsulates data items which are organized as an Array of key-values Objects
 * ie data[0] contains something like {key: "keyboard", value: "da"}
*
* Designed to work with the KeyValue model and the JsonObject data reader
*/
Ext.define('PVE.data.ObjectStore',  {
    extend: 'PVE.data.UpdateStore',

    constructor: function(config) {
	var me = this;

        config = config || {};

	if (!config.storeid) {
	    config.storeid =  'pve-store-' + (++Ext.idSeed);
	}

        Ext.applyIf(config, {
	    model: 'KeyValue',
            proxy: {
                type: 'pve',
		url: config.url,
		extraParams: config.extraParams,
                reader: {
		    type: 'jsonobject',
		    rows: config.rows,
		    readArray: config.readArray,
		    rootProperty: config.root || 'data'
		}
            }
        });

        me.callParent([config]);
    }
});
