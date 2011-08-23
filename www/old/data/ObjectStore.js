Ext.ns("PVE.data");

// a store for simple JSON Object (hash)

PVE.data.ObjectStore = Ext.extend(Ext.data.Store, {
    constructor: function(config) {
        PVE.data.ObjectStore.superclass.constructor.call(this, Ext.apply(config, {
            reader: new PVE.data.ObjectReader(config)
        }));
    }
});
