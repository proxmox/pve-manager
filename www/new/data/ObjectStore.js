Ext.define('PVE.data.ObjectStore',  {
    extend: 'PVE.data.UpdateStore',

    constructor: function(config) {
	var me = this;

        config = config || {};

	if (!config.storeid) 
	    config.storeid =  'pve-store-' + (++Ext.idSeed);

        Ext.applyIf(config, {
 	    model: 'KeyValue',
            proxy: {
                type: 'pve',
		url: config.url,
                reader: {
		    type: 'jsonobject',
		    rows: config.rows
		}
            }
        });

        me.callParent([config]);
    }
});
