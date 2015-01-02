Ext.define('PVE.data.PendingObjectStore',  {
    extend: 'PVE.data.UpdateStore',

    constructor: function(config) {
	var me = this;

        config = config || {};

	if (!config.storeid) {
	    config.storeid =  'pve-store-' + (++Ext.idSeed);
	}

        Ext.applyIf(config, {
	    model: 'KeyValuePendingDelete',
            proxy: {
                type: 'pve',
		url: config.url,
		extraParams: config.extraParams,
                reader: {
		    type: 'jsonobject',
		    rows: config.rows,
		    pending: 1
		}
            }
        });

        me.callParent([config]);
    }
});
